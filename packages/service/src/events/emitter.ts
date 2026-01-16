/**
 * @parsrun/service - Event Emitter
 * Service-level event emission
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type {
  EventTransport,
  TraceContext,
  ServiceDefinition,
} from "../types.js";
import { createEvent, type CreateEventOptions } from "./format.js";

// ============================================================================
// EVENT EMITTER
// ============================================================================

export interface EventEmitterOptions {
  /** Service name (source) */
  service: string;
  /** Service definition (for validation) */
  definition?: ServiceDefinition;
  /** Event transport */
  transport: EventTransport;
  /** Logger */
  logger?: Logger;
  /** Default tenant ID */
  defaultTenantId?: string;
  /** Validate events against definition */
  validateEvents?: boolean;
}

/**
 * Event emitter for service events
 */
export class EventEmitter {
  private readonly service: string;
  private readonly definition?: ServiceDefinition;
  private readonly transport: EventTransport;
  private readonly logger: Logger;
  private readonly defaultTenantId?: string;
  private readonly validateEvents: boolean;

  constructor(options: EventEmitterOptions) {
    this.service = options.service;
    if (options.definition) {
      this.definition = options.definition;
    }
    this.transport = options.transport;
    this.logger = options.logger ?? createLogger({ name: `events:${options.service}` });
    if (options.defaultTenantId) {
      this.defaultTenantId = options.defaultTenantId;
    }
    this.validateEvents = options.validateEvents ?? true;
  }

  /**
   * Emit an event
   */
  async emit<T = unknown>(
    type: string,
    data: T,
    options?: EmitOptions
  ): Promise<string> {
    // Validate event type if definition provided
    if (this.validateEvents && this.definition?.events?.emits) {
      const emits = this.definition.events.emits;
      if (!(type in emits)) {
        this.logger.warn(`Event type not declared in service definition: ${type}`);
      }
    }

    // Get delivery guarantee from definition
    let delivery: "at-most-once" | "at-least-once" | undefined;
    if (this.definition?.events?.emits?.[type]) {
      delivery = this.definition.events.emits[type].delivery;
    }

    // Create event options
    const eventOptions: CreateEventOptions<T> = {
      type,
      source: this.service,
      data,
    };

    if (options?.eventId) eventOptions.id = options.eventId;
    if (options?.subject) eventOptions.subject = options.subject;

    const tenantId = options?.tenantId ?? this.defaultTenantId;
    if (tenantId) eventOptions.tenantId = tenantId;

    if (options?.requestId) eventOptions.requestId = options.requestId;
    if (options?.traceContext) eventOptions.traceContext = options.traceContext;

    const eventDelivery = options?.delivery ?? delivery;
    if (eventDelivery) eventOptions.delivery = eventDelivery;

    // Create event
    const event = createEvent(eventOptions);

    // Emit via transport
    try {
      await this.transport.emit(event);
      this.logger.debug(`Event emitted: ${type}`, {
        eventId: event.id,
        tenantId: event.parstenantid,
      });
      return event.id;
    } catch (error) {
      this.logger.error(`Failed to emit event: ${type}`, error as Error, {
        eventId: event.id,
      });
      throw error;
    }
  }

  /**
   * Emit multiple events
   */
  async emitBatch<T = unknown>(
    events: Array<{ type: string; data: T; options?: EmitOptions }>
  ): Promise<string[]> {
    const results: string[] = [];

    for (const { type, data, options } of events) {
      const eventId = await this.emit(type, data, options);
      results.push(eventId);
    }

    return results;
  }

  /**
   * Create a scoped emitter with preset options
   */
  scoped(options: Partial<EmitOptions>): ScopedEmitter {
    return new ScopedEmitter(this, options);
  }

  /**
   * Get service name
   */
  get serviceName(): string {
    return this.service;
  }
}

/**
 * Emit options
 */
export interface EmitOptions {
  /** Custom event ID */
  eventId?: string;
  /** Event subject */
  subject?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Trace context */
  traceContext?: TraceContext;
  /** Override delivery guarantee */
  delivery?: "at-most-once" | "at-least-once";
}

/**
 * Scoped emitter with preset options
 */
export class ScopedEmitter {
  private readonly emitter: EventEmitter;
  private readonly defaultOptions: Partial<EmitOptions>;

  constructor(emitter: EventEmitter, defaultOptions: Partial<EmitOptions>) {
    this.emitter = emitter;
    this.defaultOptions = defaultOptions;
  }

  async emit<T = unknown>(
    type: string,
    data: T,
    options?: EmitOptions
  ): Promise<string> {
    return this.emitter.emit(type, data, {
      ...this.defaultOptions,
      ...options,
    });
  }
}

/**
 * Create an event emitter
 */
export function createEventEmitter(options: EventEmitterOptions): EventEmitter {
  return new EventEmitter(options);
}

// ============================================================================
// TYPED EVENT EMITTER
// ============================================================================

/**
 * Create a typed event emitter from service definition
 * Provides type-safe event emission
 */
export function createTypedEmitter<TDef extends ServiceDefinition>(
  definition: TDef,
  options: Omit<EventEmitterOptions, "service" | "definition">
): TypedEventEmitter<TDef> {
  const emitter = new EventEmitter({
    ...options,
    service: definition.name,
    definition,
  });

  return emitter as TypedEventEmitter<TDef>;
}

/**
 * Typed event emitter type
 * Provides type-safe event emission with specific event types
 */
export type TypedEventEmitter<TDef extends ServiceDefinition> = EventEmitter & {
  emit<K extends keyof NonNullable<TDef["events"]>["emits"]>(
    type: K,
    data: NonNullable<TDef["events"]>["emits"][K] extends { data?: infer D } ? D : unknown,
    options?: EmitOptions
  ): Promise<string>;
};
