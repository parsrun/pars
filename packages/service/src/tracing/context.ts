/**
 * @parsrun/service - Trace Context
 * W3C Trace Context implementation
 */

import type { TraceContext } from "../types.js";

// ============================================================================
// TRACE ID GENERATION
// ============================================================================

/**
 * Generate a trace ID (32 hex characters)
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a span ID (16 hex characters)
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================================
// TRACE CONTEXT
// ============================================================================

/**
 * Create a new trace context
 */
export function createTraceContext(options?: {
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
  traceState?: string;
}): TraceContext {
  const ctx: TraceContext = {
    traceId: options?.traceId ?? generateTraceId(),
    spanId: options?.spanId ?? generateSpanId(),
    traceFlags: options?.traceFlags ?? 1, // Default: sampled
  };

  if (options?.traceState) {
    ctx.traceState = options.traceState;
  }

  return ctx;
}

/**
 * Create child trace context (new span in same trace)
 */
export function createChildContext(parent: TraceContext): TraceContext {
  const ctx: TraceContext = {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    traceFlags: parent.traceFlags,
  };

  if (parent.traceState) {
    ctx.traceState = parent.traceState;
  }

  return ctx;
}

// ============================================================================
// W3C TRACEPARENT HEADER
// ============================================================================

/**
 * Format trace context as W3C traceparent header
 *
 * Format: {version}-{trace-id}-{span-id}-{trace-flags}
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
export function formatTraceparent(ctx: TraceContext): string {
  const version = "00";
  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `${version}-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Parse W3C traceparent header
 */
export function parseTraceparent(header: string): TraceContext | null {
  const parts = header.trim().split("-");
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  // Validate version
  if (version !== "00") {
    return null;
  }

  // Validate trace ID (32 hex chars)
  if (!traceId || traceId.length !== 32 || !/^[0-9a-f]+$/i.test(traceId)) {
    return null;
  }

  // Validate span ID (16 hex chars)
  if (!spanId || spanId.length !== 16 || !/^[0-9a-f]+$/i.test(spanId)) {
    return null;
  }

  // Validate flags (2 hex chars)
  if (!flags || flags.length !== 2 || !/^[0-9a-f]+$/i.test(flags)) {
    return null;
  }

  return {
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    traceFlags: parseInt(flags, 16),
  };
}

// ============================================================================
// W3C TRACESTATE HEADER
// ============================================================================

/**
 * Format trace state as W3C tracestate header
 *
 * Format: key1=value1,key2=value2
 */
export function formatTracestate(state: Record<string, string>): string {
  return Object.entries(state)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

/**
 * Parse W3C tracestate header
 */
export function parseTracestate(header: string): Record<string, string> {
  const state: Record<string, string> = {};

  for (const pair of header.split(",")) {
    const [key, value] = pair.trim().split("=");
    if (key && value) {
      state[key] = value;
    }
  }

  return state;
}

// ============================================================================
// TRACE CONTEXT MANAGER
// ============================================================================

/**
 * Async-local-storage-like context manager for tracing
 * Uses a simple stack for edge compatibility
 */
export class TraceContextManager {
  private readonly stack: TraceContext[] = [];

  /**
   * Get current trace context
   */
  current(): TraceContext | undefined {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Run a function with a trace context
   */
  async run<T>(ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
    this.stack.push(ctx);
    try {
      return await fn();
    } finally {
      this.stack.pop();
    }
  }

  /**
   * Run a function with a new child context
   */
  async runChild<T>(fn: () => Promise<T>): Promise<T> {
    const parent = this.current();
    const child = parent ? createChildContext(parent) : createTraceContext();
    return this.run(child, fn);
  }

  /**
   * Create context from incoming request headers
   */
  fromHeaders(headers: Headers | Record<string, string>): TraceContext | undefined {
    const traceparent =
      headers instanceof Headers
        ? headers.get("traceparent")
        : headers["traceparent"];

    if (!traceparent) {
      return undefined;
    }

    const ctx = parseTraceparent(traceparent);
    if (!ctx) {
      return undefined;
    }

    const tracestate =
      headers instanceof Headers
        ? headers.get("tracestate")
        : headers["tracestate"];

    if (tracestate) {
      ctx.traceState = tracestate;
    }

    return ctx;
  }

  /**
   * Add trace context to outgoing request headers
   */
  toHeaders(ctx: TraceContext): Record<string, string> {
    const headers: Record<string, string> = {
      traceparent: formatTraceparent(ctx),
    };

    if (ctx.traceState) {
      headers["tracestate"] = ctx.traceState;
    }

    return headers;
  }

  /**
   * Check if current context is sampled
   */
  isSampled(): boolean {
    const ctx = this.current();
    return ctx ? (ctx.traceFlags & 0x01) === 1 : false;
  }

  /**
   * Clear all contexts (for testing)
   */
  clear(): void {
    this.stack.length = 0;
  }
}

// ============================================================================
// SAMPLING
// ============================================================================

/**
 * Sampling configuration for tracing.
 * - "always": Sample all traces
 * - "never": Never sample traces
 * - { ratio: number }: Sample a percentage of traces (0-1)
 */
export type Sampler = "always" | "never" | { ratio: number };

/**
 * Determine if a trace should be sampled based on the sampler configuration.
 *
 * @param sampler - Sampling configuration
 * @param traceId - Optional trace ID for deterministic sampling
 * @returns Whether the trace should be sampled
 */
export function shouldSample(sampler: Sampler, traceId?: string): boolean {
  if (sampler === "always") {
    return true;
  }

  if (sampler === "never") {
    return false;
  }

  // Ratio-based sampling
  if (traceId) {
    // Use trace ID for deterministic sampling
    const hash = parseInt(traceId.slice(-8), 16);
    const threshold = Math.floor(sampler.ratio * 0xffffffff);
    return hash < threshold;
  }

  // Random sampling
  return Math.random() < sampler.ratio;
}
