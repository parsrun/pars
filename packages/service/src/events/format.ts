/**
 * @parsrun/service - Event Format
 * CloudEvents and compact event format utilities
 */

import { generateId } from "@parsrun/core";
import type { ParsEvent, CompactEvent, TraceContext } from "../types.js";

// ============================================================================
// EVENT CREATION
// ============================================================================

/**
 * Options for creating a CloudEvents-compatible event.
 */
export interface CreateEventOptions<T = unknown> {
  /** Event type (e.g., "subscription.created") */
  type: string;
  /** Source service */
  source: string;
  /** Event data */
  data: T;
  /** Optional event ID (auto-generated if not provided) */
  id?: string;
  /** Optional subject */
  subject?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Trace context */
  traceContext?: TraceContext;
  /** Delivery guarantee */
  delivery?: "at-most-once" | "at-least-once";
}

/**
 * Create a CloudEvents-compatible event.
 *
 * @param options - Event creation options
 * @returns A new ParsEvent conforming to CloudEvents spec
 */
export function createEvent<T = unknown>(options: CreateEventOptions<T>): ParsEvent<T> {
  const event: ParsEvent<T> = {
    specversion: "1.0",
    type: options.type,
    source: options.source,
    id: options.id ?? generateId(),
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    data: options.data,
  };

  if (options.subject) event.subject = options.subject;
  if (options.tenantId) event.parstenantid = options.tenantId;
  if (options.requestId) event.parsrequestid = options.requestId;
  if (options.traceContext) event.parstracecontext = formatTraceContext(options.traceContext);
  if (options.delivery) event.parsdelivery = options.delivery;

  return event;
}

// ============================================================================
// FORMAT CONVERSION
// ============================================================================

/**
 * Convert to full CloudEvents format (creates a copy).
 *
 * @param event - The event to convert
 * @returns A copy of the event in CloudEvents format
 */
export function toCloudEvent<T>(event: ParsEvent<T>): ParsEvent<T> {
  return { ...event };
}

/**
 * Convert to compact internal format for efficient transport.
 *
 * @param event - The CloudEvents event to convert
 * @returns A compact representation of the event
 */
export function toCompactEvent<T>(event: ParsEvent<T>): CompactEvent<T> {
  const compact: CompactEvent<T> = {
    e: event.type,
    s: event.source,
    i: event.id,
    t: new Date(event.time).getTime(),
    d: event.data,
  };

  if (event.parstracecontext) compact.ctx = event.parstracecontext;
  if (event.parstenantid) compact.tid = event.parstenantid;

  return compact;
}

/**
 * Convert from compact format to CloudEvents format.
 *
 * @param compact - The compact event to convert
 * @param source - Optional source override
 * @returns A full CloudEvents event
 */
export function fromCompactEvent<T>(compact: CompactEvent<T>, source?: string): ParsEvent<T> {
  const event: ParsEvent<T> = {
    specversion: "1.0",
    type: compact.e,
    source: source ?? compact.s,
    id: compact.i,
    time: new Date(compact.t).toISOString(),
    datacontenttype: "application/json",
    data: compact.d,
  };

  if (compact.ctx) event.parstracecontext = compact.ctx;
  if (compact.tid) event.parstenantid = compact.tid;

  return event;
}

// ============================================================================
// EVENT TYPE UTILITIES
// ============================================================================

/**
 * Format full event type with source prefix.
 *
 * @param source - The source service name
 * @param type - The event type
 * @returns Fully qualified event type
 *
 * @example
 * ```typescript
 * formatEventType('payments', 'subscription.created')
 * // Returns: 'com.pars.payments.subscription.created'
 * ```
 */
export function formatEventType(source: string, type: string): string {
  return `com.pars.${source}.${type}`;
}

/**
 * Parse event type to extract source and type.
 *
 * @param fullType - The fully qualified event type
 * @returns Parsed source and type, or null if invalid
 *
 * @example
 * ```typescript
 * parseEventType('com.pars.payments.subscription.created')
 * // Returns: { source: 'payments', type: 'subscription.created' }
 * ```
 */
export function parseEventType(fullType: string): { source: string; type: string } | null {
  const prefix = "com.pars.";
  if (!fullType.startsWith(prefix)) {
    // Try to parse as simple type (source.type)
    const parts = fullType.split(".");
    if (parts.length >= 2) {
      const [source, ...rest] = parts;
      return { source: source!, type: rest.join(".") };
    }
    return null;
  }

  const withoutPrefix = fullType.slice(prefix.length);
  const dotIndex = withoutPrefix.indexOf(".");
  if (dotIndex === -1) {
    return null;
  }

  return {
    source: withoutPrefix.slice(0, dotIndex),
    type: withoutPrefix.slice(dotIndex + 1),
  };
}

/**
 * Check if event type matches a pattern.
 * Supports wildcards: * matches one segment, ** matches multiple segments.
 *
 * @param type - The event type to check
 * @param pattern - The pattern to match against
 * @returns True if the type matches the pattern
 *
 * @example
 * ```typescript
 * matchEventType('subscription.created', 'subscription.*') // true
 * matchEventType('payment.invoice.paid', 'payment.**') // true
 * matchEventType('subscription.created', 'payment.*') // false
 * ```
 */
export function matchEventType(type: string, pattern: string): boolean {
  if (pattern === "*" || pattern === "**") {
    return true;
  }

  const typeParts = type.split(".");
  const patternParts = pattern.split(".");

  let ti = 0;
  let pi = 0;

  while (ti < typeParts.length && pi < patternParts.length) {
    const pp = patternParts[pi];

    if (pp === "**") {
      // ** matches rest of type
      if (pi === patternParts.length - 1) {
        return true;
      }
      // Try to match remaining pattern
      for (let i = ti; i <= typeParts.length; i++) {
        const remaining = typeParts.slice(i).join(".");
        const remainingPattern = patternParts.slice(pi + 1).join(".");
        if (matchEventType(remaining, remainingPattern)) {
          return true;
        }
      }
      return false;
    }

    if (pp === "*") {
      // * matches single segment
      ti++;
      pi++;
      continue;
    }

    if (pp !== typeParts[ti]) {
      return false;
    }

    ti++;
    pi++;
  }

  return ti === typeParts.length && pi === patternParts.length;
}

// ============================================================================
// TRACE CONTEXT HELPERS
// ============================================================================

/**
 * Format trace context to W3C traceparent string
 */
function formatTraceContext(ctx: TraceContext): string {
  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Parse W3C traceparent string to trace context.
 *
 * @param traceparent - The traceparent header value
 * @returns Parsed trace context, or null if invalid
 */
export function parseTraceContext(traceparent: string): TraceContext | null {
  const parts = traceparent.split("-");
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;
  if (version !== "00" || !traceId || !spanId || !flags) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that an object conforms to CloudEvents structure.
 *
 * @param event - The object to validate
 * @returns True if the object is a valid ParsEvent
 */
export function validateEvent(event: unknown): event is ParsEvent {
  if (!event || typeof event !== "object") {
    return false;
  }

  const e = event as Record<string, unknown>;

  // Required fields
  if (e["specversion"] !== "1.0") return false;
  if (typeof e["type"] !== "string" || (e["type"] as string).length === 0) return false;
  if (typeof e["source"] !== "string" || (e["source"] as string).length === 0) return false;
  if (typeof e["id"] !== "string" || (e["id"] as string).length === 0) return false;
  if (typeof e["time"] !== "string") return false;

  return true;
}

/**
 * Validate that an object conforms to compact event structure.
 *
 * @param event - The object to validate
 * @returns True if the object is a valid CompactEvent
 */
export function validateCompactEvent(event: unknown): event is CompactEvent {
  if (!event || typeof event !== "object") {
    return false;
  }

  const e = event as Record<string, unknown>;

  if (typeof e["e"] !== "string" || (e["e"] as string).length === 0) return false;
  if (typeof e["s"] !== "string" || (e["s"] as string).length === 0) return false;
  if (typeof e["i"] !== "string" || (e["i"] as string).length === 0) return false;
  if (typeof e["t"] !== "number") return false;

  return true;
}
