/**
 * @parsrun/service - Spans
 * Span creation and management
 */

import type {
  Span,
  SpanKind,
  SpanStatus,
  SpanAttributeValue,
  SpanEvent,
  TraceContext,
} from "../types.js";
import { generateSpanId, createTraceContext } from "./context.js";

// ============================================================================
// SPAN CREATION
// ============================================================================

export interface SpanOptions {
  /** Span name */
  name: string;
  /** Span kind */
  kind?: SpanKind;
  /** Parent trace context */
  parent?: TraceContext;
  /** Initial attributes */
  attributes?: Record<string, SpanAttributeValue>;
  /** Start time (default: now) */
  startTime?: number;
}

/**
 * Create a new span
 */
export function createSpan(options: SpanOptions): Span {
  let traceContext: TraceContext;

  if (options.parent) {
    traceContext = {
      traceId: options.parent.traceId,
      spanId: generateSpanId(),
      traceFlags: options.parent.traceFlags,
    };
    if (options.parent.traceState) {
      traceContext.traceState = options.parent.traceState;
    }
  } else {
    traceContext = createTraceContext();
  }

  const span: Span = {
    name: options.name,
    kind: options.kind ?? "internal",
    traceContext,
    startTime: options.startTime ?? Date.now(),
    status: "unset",
    attributes: options.attributes ?? {},
    events: [],
  };

  if (options.parent?.spanId) {
    span.parentSpanId = options.parent.spanId;
  }

  return span;
}

// ============================================================================
// SPAN MANAGER
// ============================================================================

/**
 * Span manager for creating and managing spans
 */
export class SpanManager {
  private readonly spans: Map<string, Span> = new Map();

  /**
   * Start a new span
   */
  startSpan(options: SpanOptions): Span {
    const span = createSpan(options);
    this.spans.set(span.traceContext.spanId, span);
    return span;
  }

  /**
   * End a span
   */
  endSpan(span: Span, status?: SpanStatus): Span {
    span.endTime = Date.now();
    if (status) {
      span.status = status;
    } else if (span.status === "unset") {
      span.status = "ok";
    }
    return span;
  }

  /**
   * Set span attribute
   */
  setAttribute(span: Span, key: string, value: SpanAttributeValue): void {
    span.attributes[key] = value;
  }

  /**
   * Set multiple span attributes
   */
  setAttributes(span: Span, attributes: Record<string, SpanAttributeValue>): void {
    Object.assign(span.attributes, attributes);
  }

  /**
   * Add span event
   */
  addEvent(
    span: Span,
    name: string,
    attributes?: Record<string, SpanAttributeValue>
  ): void {
    const event: SpanEvent = {
      name,
      time: Date.now(),
    };
    if (attributes) {
      event.attributes = attributes;
    }
    span.events.push(event);
  }

  /**
   * Set span status
   */
  setStatus(span: Span, status: SpanStatus): void {
    span.status = status;
  }

  /**
   * Record exception on span
   */
  recordException(span: Span, error: Error): void {
    span.status = "error";
    this.addEvent(span, "exception", {
      "exception.type": error.name,
      "exception.message": error.message,
      "exception.stacktrace": error.stack ?? "",
    });
  }

  /**
   * Get span by ID
   */
  getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Get all completed spans and clear
   */
  flush(): Span[] {
    const completed = Array.from(this.spans.values()).filter((s) => s.endTime);
    for (const span of completed) {
      this.spans.delete(span.traceContext.spanId);
    }
    return completed;
  }

  /**
   * Clear all spans
   */
  clear(): void {
    this.spans.clear();
  }
}

// ============================================================================
// SPAN UTILITIES
// ============================================================================

/**
 * Calculate span duration in milliseconds
 */
export function getSpanDuration(span: Span): number | undefined {
  if (!span.endTime) return undefined;
  return span.endTime - span.startTime;
}

/**
 * Check if span is completed
 */
export function isSpanCompleted(span: Span): boolean {
  return span.endTime !== undefined;
}

/**
 * Get span as simplified object (for logging)
 */
export function spanToLogObject(span: Span): Record<string, unknown> {
  return {
    traceId: span.traceContext.traceId,
    spanId: span.traceContext.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: span.kind,
    status: span.status,
    startTime: new Date(span.startTime).toISOString(),
    endTime: span.endTime ? new Date(span.endTime).toISOString() : undefined,
    durationMs: getSpanDuration(span),
    attributes: span.attributes,
    events: span.events.map((e) => ({
      name: e.name,
      time: new Date(e.time).toISOString(),
      attributes: e.attributes,
    })),
  };
}

// ============================================================================
// SEMANTIC CONVENTIONS
// ============================================================================

/**
 * Common span attribute keys (OpenTelemetry semantic conventions)
 */
export const SpanAttributes = {
  // HTTP
  HTTP_METHOD: "http.method",
  HTTP_URL: "http.url",
  HTTP_STATUS_CODE: "http.status_code",
  HTTP_REQUEST_CONTENT_LENGTH: "http.request_content_length",
  HTTP_RESPONSE_CONTENT_LENGTH: "http.response_content_length",

  // RPC
  RPC_SYSTEM: "rpc.system",
  RPC_SERVICE: "rpc.service",
  RPC_METHOD: "rpc.method",

  // Database
  DB_SYSTEM: "db.system",
  DB_NAME: "db.name",
  DB_OPERATION: "db.operation",
  DB_STATEMENT: "db.statement",

  // Messaging
  MESSAGING_SYSTEM: "messaging.system",
  MESSAGING_DESTINATION: "messaging.destination",
  MESSAGING_MESSAGE_ID: "messaging.message_id",

  // Service
  SERVICE_NAME: "service.name",
  SERVICE_VERSION: "service.version",

  // Error
  EXCEPTION_TYPE: "exception.type",
  EXCEPTION_MESSAGE: "exception.message",
  EXCEPTION_STACKTRACE: "exception.stacktrace",

  // Custom Pars attributes
  PARS_TENANT_ID: "pars.tenant_id",
  PARS_USER_ID: "pars.user_id",
  PARS_REQUEST_ID: "pars.request_id",
} as const;
