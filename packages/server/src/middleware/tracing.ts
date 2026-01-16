/**
 * @parsrun/server - Tracing Middleware
 * Request correlation and distributed tracing support
 */

import type { HonoContext, HonoNext } from "../context.js";
import { generateRequestId } from "../context.js";

/**
 * Tracing options
 */
export interface TracingOptions {
  /**
   * Header name for request ID
   * @default "x-request-id"
   */
  headerName?: string;

  /**
   * Custom request ID generator
   * @default crypto.randomUUID()
   */
  generateId?: () => string;

  /**
   * Enable W3C Trace Context propagation
   * When enabled, parses and propagates traceparent/tracestate headers
   * @default false
   */
  propagate?: boolean;

  /**
   * Emit request ID in response headers
   * @default true
   */
  emitHeader?: boolean;

  /**
   * Trust incoming request ID from header
   * Set to false in production to always generate new IDs
   * @default true
   */
  trustIncoming?: boolean;
}

/**
 * W3C Trace Context - Parsed traceparent header
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 */
export interface TraceContext {
  /** Trace version (currently "00") */
  version: string;
  /** 32 hex character trace ID */
  traceId: string;
  /** 16 hex character parent span ID */
  parentId: string;
  /** Trace flags (sampled, etc.) */
  traceFlags: number;
}

/**
 * Parse W3C traceparent header
 * Format: 00-{trace-id}-{parent-id}-{trace-flags}
 *
 * @see https://www.w3.org/TR/trace-context/
 */
export function parseTraceparent(header: string): TraceContext | null {
  // Version 00 format: 00-<trace-id>-<parent-id>-<trace-flags>
  const match = header.match(
    /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i
  );

  if (!match) return null;

  const [, version, traceId, parentId, flags] = match;

  // Validate trace-id and parent-id are not all zeros
  if (traceId === "00000000000000000000000000000000") return null;
  if (parentId === "0000000000000000") return null;

  return {
    version: version!,
    traceId: traceId!,
    parentId: parentId!,
    traceFlags: parseInt(flags!, 16),
  };
}

/**
 * Generate a new trace ID (32 hex characters)
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a new span ID (16 hex characters)
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a traceparent header value
 */
export function createTraceparent(
  traceId: string,
  spanId: string,
  sampled: boolean = true
): string {
  const flags = sampled ? "01" : "00";
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Extended context for tracing
 * These values are set on the context for downstream middleware/handlers
 */
declare module "../context.js" {
  interface ServerContextVariables {
    /** W3C trace context (if propagation is enabled) */
    traceContext?: TraceContext;
    /** Current span ID for this request */
    spanId?: string;
    /** Tracestate header value (for forwarding) */
    traceState?: string;
  }
}

/**
 * Tracing middleware
 *
 * Handles request ID generation and W3C Trace Context propagation.
 *
 * @example Basic usage
 * ```typescript
 * app.use('*', tracing());
 *
 * // Access in handlers
 * app.get('/api/test', (c) => {
 *   const requestId = c.get('requestId');
 *   return c.json({ requestId });
 * });
 * ```
 *
 * @example With distributed tracing
 * ```typescript
 * app.use('*', tracing({
 *   propagate: true,
 *   trustIncoming: true,
 * }));
 *
 * // Access trace context
 * app.get('/api/test', (c) => {
 *   const trace = c.get('traceContext');
 *   const spanId = c.get('spanId');
 *   return c.json({ traceId: trace?.traceId, spanId });
 * });
 * ```
 *
 * @example Outgoing requests (forwarding trace context)
 * ```typescript
 * app.get('/api/proxy', async (c) => {
 *   const trace = c.get('traceContext');
 *   const spanId = c.get('spanId');
 *   const traceState = c.get('traceState');
 *
 *   const headers: Record<string, string> = {};
 *
 *   if (trace) {
 *     // Create new traceparent with our spanId as parent
 *     headers['traceparent'] = createTraceparent(trace.traceId, spanId!, true);
 *     if (traceState) {
 *       headers['tracestate'] = traceState;
 *     }
 *   }
 *
 *   const response = await fetch('https://downstream-service.com/api', { headers });
 *   return c.json(await response.json());
 * });
 * ```
 */
export function tracing(options: TracingOptions = {}) {
  const {
    headerName = "x-request-id",
    generateId = generateRequestId,
    propagate = false,
    emitHeader = true,
    trustIncoming = true,
  } = options;

  return async (c: HonoContext, next: HonoNext) => {
    let requestId: string;

    // Get or generate request ID
    if (trustIncoming) {
      requestId = c.req.header(headerName) ?? generateId();
    } else {
      requestId = generateId();
    }

    // Set request ID in context
    c.set("requestId", requestId);

    // Handle W3C Trace Context propagation
    if (propagate) {
      const traceparent = c.req.header("traceparent");
      const tracestate = c.req.header("tracestate");

      // Generate a new span ID for this request
      const spanId = generateSpanId();
      c.set("spanId", spanId);

      if (traceparent) {
        const traceContext = parseTraceparent(traceparent);

        if (traceContext) {
          c.set("traceContext", traceContext);

          if (tracestate) {
            c.set("traceState", tracestate);
          }
        }
      } else {
        // No incoming trace context - start a new trace
        const traceId = generateTraceId();
        c.set("traceContext", {
          version: "00",
          traceId,
          parentId: spanId,
          traceFlags: 1, // Sampled
        });
      }
    }

    // Emit request ID in response header
    if (emitHeader) {
      c.header(headerName, requestId);
    }

    // Process request
    await next();
  };
}

/**
 * Create tracing middleware (alias)
 */
export const tracingMiddleware = tracing;
