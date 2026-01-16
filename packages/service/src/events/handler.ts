/**
 * @parsrun/service - Event Handler
 * Event handler registration and execution
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type {
  ParsEvent,
  EventHandler,
  EventHandlerContext,
  EventHandlerOptions,
  Unsubscribe,
} from "../types.js";
import { matchEventType } from "./format.js";
import type { DeadLetterQueue } from "./dead-letter.js";

// ============================================================================
// EVENT HANDLER REGISTRY
// ============================================================================

/**
 * Resolved handler options with required fields
 */
export interface ResolvedHandlerOptions {
  retries: number;
  backoff: "linear" | "exponential";
  maxDelay: number;
  onExhausted: "alert" | "log" | "discard";
  deadLetter?: string;
}

/**
 * Registration entry for an event handler.
 */
export interface HandlerRegistration {
  /** Event type pattern (supports wildcards) */
  pattern: string;
  /** Handler function */
  handler: EventHandler;
  /** Handler options */
  options: ResolvedHandlerOptions;
}

/**
 * Options for creating an event handler registry.
 */
export interface EventHandlerRegistryOptions {
  /** Logger */
  logger?: Logger;
  /** Dead letter queue */
  deadLetterQueue?: DeadLetterQueue;
  /** Default handler options */
  defaultOptions?: Partial<EventHandlerOptions>;
}

/**
 * Registry for event handlers
 */
export class EventHandlerRegistry {
  private readonly handlers: Map<string, HandlerRegistration[]> = new Map();
  private readonly logger: Logger;
  private readonly deadLetterQueue?: DeadLetterQueue;
  private readonly defaultOptions: ResolvedHandlerOptions;

  constructor(options: EventHandlerRegistryOptions = {}) {
    this.logger = options.logger ?? createLogger({ name: "event-handler" });
    if (options.deadLetterQueue) {
      this.deadLetterQueue = options.deadLetterQueue;
    }
    const defaultOpts: ResolvedHandlerOptions = {
      retries: options.defaultOptions?.retries ?? 3,
      backoff: options.defaultOptions?.backoff ?? "exponential",
      maxDelay: options.defaultOptions?.maxDelay ?? 30_000,
      onExhausted: options.defaultOptions?.onExhausted ?? "log",
    };
    if (options.defaultOptions?.deadLetter) {
      defaultOpts.deadLetter = options.defaultOptions.deadLetter;
    }
    this.defaultOptions = defaultOpts;
  }

  /**
   * Register an event handler
   */
  register(
    pattern: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): Unsubscribe {
    const registration: HandlerRegistration = {
      pattern,
      handler,
      options: {
        ...this.defaultOptions,
        ...options,
      },
    };

    const handlers = this.handlers.get(pattern) ?? [];
    handlers.push(registration);
    this.handlers.set(pattern, handlers);

    this.logger.debug(`Handler registered for pattern: ${pattern}`);

    // Return unsubscribe function
    return () => {
      const currentHandlers = this.handlers.get(pattern);
      if (currentHandlers) {
        const index = currentHandlers.indexOf(registration);
        if (index !== -1) {
          currentHandlers.splice(index, 1);
          if (currentHandlers.length === 0) {
            this.handlers.delete(pattern);
          }
          this.logger.debug(`Handler unregistered for pattern: ${pattern}`);
        }
      }
    };
  }

  /**
   * Handle an event
   */
  async handle(event: ParsEvent): Promise<void> {
    const matchingHandlers = this.getMatchingHandlers(event.type);

    if (matchingHandlers.length === 0) {
      this.logger.debug(`No handlers for event type: ${event.type}`, {
        eventId: event.id,
      });
      return;
    }

    this.logger.debug(`Handling event: ${event.type}`, {
      eventId: event.id,
      handlerCount: matchingHandlers.length,
    });

    // Execute handlers in parallel
    const results = await Promise.allSettled(
      matchingHandlers.map((reg) => this.executeHandler(event, reg))
    );

    // Log failures
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result?.status === "rejected") {
        this.logger.error(
          `Handler failed for ${event.type}`,
          result.reason as Error,
          { eventId: event.id, pattern: matchingHandlers[i]?.pattern }
        );
      }
    }
  }

  /**
   * Execute a single handler with retry logic
   */
  private async executeHandler(
    event: ParsEvent,
    registration: HandlerRegistration
  ): Promise<void> {
    const { handler, options } = registration;
    const maxAttempts = options.retries + 1;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const context: EventHandlerContext = {
          logger: this.logger.child({
            eventId: event.id,
            pattern: registration.pattern,
            attempt,
          }),
          attempt,
          maxAttempts,
          isRetry: attempt > 1,
        };

        // Add trace context if available
        if (event.parstracecontext) {
          const traceCtx = parseTraceContext(event.parstracecontext);
          if (traceCtx) {
            context.traceContext = traceCtx;
          }
        }

        await handler(event, context);
        return; // Success
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts) {
          const delay = this.calculateBackoff(attempt, options);
          this.logger.warn(
            `Handler failed, retrying in ${delay}ms`,
            { eventId: event.id, attempt, maxAttempts }
          );
          await sleep(delay);
        }
      }
    }

    // All retries exhausted
    await this.handleExhausted(event, registration, lastError!);
  }

  /**
   * Calculate backoff delay
   */
  private calculateBackoff(
    attempt: number,
    options: ResolvedHandlerOptions
  ): number {
    const baseDelay = 100;

    if (options.backoff === "exponential") {
      return Math.min(baseDelay * Math.pow(2, attempt - 1), options.maxDelay);
    }

    // Linear
    return Math.min(baseDelay * attempt, options.maxDelay);
  }

  /**
   * Handle exhausted retries
   */
  private async handleExhausted(
    event: ParsEvent,
    registration: HandlerRegistration,
    error: Error
  ): Promise<void> {
    const { options } = registration;

    // Send to dead letter queue
    if (options.deadLetter && this.deadLetterQueue) {
      await this.deadLetterQueue.add({
        event,
        error: error.message,
        pattern: registration.pattern,
        attempts: options.retries + 1,
      });
    }

    // Handle based on onExhausted option
    switch (options.onExhausted) {
      case "alert":
        this.logger.error(
          `[ALERT] Event handler exhausted all retries`,
          error,
          {
            eventId: event.id,
            eventType: event.type,
            pattern: registration.pattern,
          }
        );
        break;
      case "discard":
        this.logger.debug(`Event discarded after exhausted retries`, {
          eventId: event.id,
        });
        break;
      case "log":
      default:
        this.logger.warn(`Event handler exhausted all retries`, {
          eventId: event.id,
          error: error.message,
        });
    }
  }

  /**
   * Get handlers matching an event type
   */
  private getMatchingHandlers(eventType: string): HandlerRegistration[] {
    const matching: HandlerRegistration[] = [];

    for (const [pattern, handlers] of this.handlers) {
      if (matchEventType(eventType, pattern)) {
        matching.push(...handlers);
      }
    }

    return matching;
  }

  /**
   * Get all registered patterns
   */
  getPatterns(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a pattern has handlers
   */
  hasHandlers(pattern: string): boolean {
    return this.handlers.has(pattern);
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }
}

/**
 * Create an event handler registry for managing event subscriptions.
 *
 * @param options - Registry configuration options
 * @returns A new event handler registry instance
 *
 * @example
 * ```typescript
 * const registry = createEventHandlerRegistry({
 *   deadLetterQueue: dlq,
 *   defaultOptions: { retries: 3 },
 * });
 * registry.register('subscription.*', async (event, ctx) => {
 *   console.log('Received event:', event.type);
 * });
 * ```
 */
export function createEventHandlerRegistry(
  options?: EventHandlerRegistryOptions
): EventHandlerRegistry {
  return new EventHandlerRegistry(options);
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTraceContext(traceparent: string): {
  traceId: string;
  spanId: string;
  traceFlags: number;
} | undefined {
  const parts = traceparent.split("-");
  if (parts.length !== 4) return undefined;

  const [, traceId, spanId, flags] = parts;
  if (!traceId || !spanId || !flags) return undefined;

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}
