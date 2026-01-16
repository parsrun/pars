/**
 * @parsrun/service - Memory Event Transport
 * In-memory event transport for embedded mode and testing
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type {
  ParsEvent,
  EventTransport,
  EventHandler,
  EventHandlerOptions,
  Unsubscribe,
} from "../../types.js";
import { EventHandlerRegistry, type EventHandlerRegistryOptions } from "../handler.js";

// ============================================================================
// MEMORY EVENT TRANSPORT
// ============================================================================

export interface MemoryEventTransportOptions {
  /** Logger */
  logger?: Logger;
  /** Process events synchronously (default: false) */
  sync?: boolean;
  /** Default handler options */
  defaultHandlerOptions?: EventHandlerOptions;
}

/**
 * In-memory event transport
 * Events are processed immediately without persistence
 */
export class MemoryEventTransport implements EventTransport {
  readonly name = "memory";
  private readonly registry: EventHandlerRegistry;
  private readonly logger: Logger;
  private readonly sync: boolean;
  private readonly pendingEvents: ParsEvent[] = [];
  private processing = false;

  constructor(options: MemoryEventTransportOptions = {}) {
    this.logger = options.logger ?? createLogger({ name: "memory-transport" });
    this.sync = options.sync ?? false;

    const registryOptions: EventHandlerRegistryOptions = {
      logger: this.logger,
    };
    if (options.defaultHandlerOptions) {
      registryOptions.defaultOptions = options.defaultHandlerOptions;
    }
    this.registry = new EventHandlerRegistry(registryOptions);
  }

  /**
   * Emit an event
   */
  async emit<T>(event: ParsEvent<T>): Promise<void> {
    this.logger.debug(`Event emitted: ${event.type}`, {
      eventId: event.id,
      tenantId: event.parstenantid,
    });

    if (this.sync) {
      // Process synchronously
      await this.registry.handle(event);
    } else {
      // Queue for async processing
      this.pendingEvents.push(event);
      this.processQueue();
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): Unsubscribe {
    return this.registry.register(eventType, handler, options);
  }

  /**
   * Process pending events asynchronously
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.pendingEvents.length > 0) {
        const event = this.pendingEvents.shift();
        if (event) {
          await this.registry.handle(event);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Wait for all pending events to be processed
   */
  async flush(): Promise<void> {
    while (this.pendingEvents.length > 0 || this.processing) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Get pending event count
   */
  get pendingCount(): number {
    return this.pendingEvents.length;
  }

  /**
   * Get registered patterns
   */
  getPatterns(): string[] {
    return this.registry.getPatterns();
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.registry.clear();
    this.pendingEvents.length = 0;
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    await this.flush();
    this.clear();
  }
}

/**
 * Create a memory event transport
 */
export function createMemoryEventTransport(
  options?: MemoryEventTransportOptions
): MemoryEventTransport {
  return new MemoryEventTransport(options);
}

// ============================================================================
// GLOBAL EVENT BUS (for embedded multi-service)
// ============================================================================

/**
 * Global event bus for communication between embedded services
 */
export class GlobalEventBus {
  private static instance: GlobalEventBus | null = null;
  private readonly transports: Map<string, MemoryEventTransport> = new Map();
  private readonly logger: Logger;

  private constructor() {
    this.logger = createLogger({ name: "global-event-bus" });
  }

  static getInstance(): GlobalEventBus {
    if (!GlobalEventBus.instance) {
      GlobalEventBus.instance = new GlobalEventBus();
    }
    return GlobalEventBus.instance;
  }

  /**
   * Register a service's event transport
   */
  register(serviceName: string, transport: MemoryEventTransport): void {
    if (this.transports.has(serviceName)) {
      throw new Error(`Service already registered: ${serviceName}`);
    }
    this.transports.set(serviceName, transport);
    this.logger.debug(`Service registered: ${serviceName}`);
  }

  /**
   * Unregister a service
   */
  unregister(serviceName: string): boolean {
    const deleted = this.transports.delete(serviceName);
    if (deleted) {
      this.logger.debug(`Service unregistered: ${serviceName}`);
    }
    return deleted;
  }

  /**
   * Broadcast an event to all services (except source)
   */
  async broadcast(event: ParsEvent, excludeSource?: string): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, transport] of this.transports) {
      if (name !== excludeSource) {
        promises.push(transport.emit(event));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send an event to a specific service
   */
  async send(serviceName: string, event: ParsEvent): Promise<void> {
    const transport = this.transports.get(serviceName);
    if (!transport) {
      this.logger.warn(`Target service not found: ${serviceName}`, {
        eventId: event.id,
      });
      return;
    }

    await transport.emit(event);
  }

  /**
   * Get all registered service names
   */
  getServices(): string[] {
    return Array.from(this.transports.keys());
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.transports.clear();
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    GlobalEventBus.instance = null;
  }
}

/**
 * Get the global event bus
 */
export function getGlobalEventBus(): GlobalEventBus {
  return GlobalEventBus.getInstance();
}
