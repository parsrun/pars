/**
 * @parsrun/service - Tracer
 * High-level tracing API
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type { Span, TraceContext, SpanKind, SpanAttributeValue } from "../types.js";
import type { TracingConfig } from "../types.js";
import {
  TraceContextManager,
  shouldSample,
  type Sampler,
} from "./context.js";
import { SpanManager, SpanAttributes } from "./spans.js";
import type { SpanExporter } from "./exporters.js";
import { ConsoleExporter } from "./exporters.js";

// ============================================================================
// TRACER
// ============================================================================

export interface TracerOptions {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Tracing config */
  config?: TracingConfig;
  /** Span exporter */
  exporter?: SpanExporter;
  /** Logger */
  logger?: Logger;
}

/**
 * Main tracer class for distributed tracing
 */
export class Tracer {
  private readonly serviceName: string;
  private readonly serviceVersion: string;
  private readonly sampler: Sampler;
  private readonly exporter: SpanExporter;
  private readonly logger: Logger;
  private readonly contextManager: TraceContextManager;
  private readonly spanManager: SpanManager;
  private readonly enabled: boolean;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: TracerOptions) {
    this.serviceName = options.serviceName;
    this.serviceVersion = options.serviceVersion ?? "1.0.0";
    this.enabled = options.config?.enabled ?? true;
    this.sampler = options.config?.sampler ?? { ratio: 0.1 };
    this.exporter = options.exporter ?? new ConsoleExporter();
    this.logger = options.logger ?? createLogger({ name: `tracer:${options.serviceName}` });
    this.contextManager = new TraceContextManager();
    this.spanManager = new SpanManager();

    // Auto-flush spans periodically
    if (this.enabled) {
      this.flushTimer = setInterval(() => this.flush(), 5000);
    }
  }

  /**
   * Start a new span
   */
  startSpan(
    name: string,
    options?: {
      kind?: SpanKind;
      parent?: TraceContext;
      attributes?: Record<string, SpanAttributeValue>;
    }
  ): Span | null {
    if (!this.enabled) return null;

    // Get parent from options or current context
    const parent = options?.parent ?? this.contextManager.current();

    // Check sampling
    if (!parent && !shouldSample(this.sampler)) {
      return null;
    }

    const spanOptions: Parameters<typeof this.spanManager.startSpan>[0] = {
      name,
      kind: options?.kind ?? "internal",
      attributes: {
        [SpanAttributes.SERVICE_NAME]: this.serviceName,
        [SpanAttributes.SERVICE_VERSION]: this.serviceVersion,
        ...options?.attributes,
      },
    };

    if (parent) {
      spanOptions.parent = parent;
    }

    const span = this.spanManager.startSpan(spanOptions);

    return span;
  }

  /**
   * End a span
   */
  endSpan(span: Span | null, error?: Error): void {
    if (!span) return;

    if (error) {
      this.spanManager.recordException(span, error);
    }

    this.spanManager.endSpan(span, error ? "error" : "ok");
  }

  /**
   * Run a function with automatic span creation
   */
  async trace<T>(
    name: string,
    fn: (span: Span | null) => Promise<T>,
    options?: {
      kind?: SpanKind;
      attributes?: Record<string, SpanAttributeValue>;
    }
  ): Promise<T> {
    const span = this.startSpan(name, options);

    if (!span) {
      return fn(null);
    }

    try {
      const result = await this.contextManager.run(span.traceContext, () => fn(span));
      this.endSpan(span);
      return result;
    } catch (error) {
      this.endSpan(span, error as Error);
      throw error;
    }
  }

  /**
   * Add attribute to current span
   */
  setAttribute(key: string, value: SpanAttributeValue): void {
    const ctx = this.contextManager.current();
    if (!ctx) return;

    const span = this.spanManager.getSpan(ctx.spanId);
    if (span) {
      this.spanManager.setAttribute(span, key, value);
    }
  }

  /**
   * Add event to current span
   */
  addEvent(name: string, attributes?: Record<string, SpanAttributeValue>): void {
    const ctx = this.contextManager.current();
    if (!ctx) return;

    const span = this.spanManager.getSpan(ctx.spanId);
    if (span) {
      this.spanManager.addEvent(span, name, attributes);
    }
  }

  /**
   * Get current trace context
   */
  currentContext(): TraceContext | undefined {
    return this.contextManager.current();
  }

  /**
   * Get context manager for advanced use
   */
  getContextManager(): TraceContextManager {
    return this.contextManager;
  }

  /**
   * Extract trace context from incoming request
   */
  extract(headers: Headers | Record<string, string>): TraceContext | undefined {
    return this.contextManager.fromHeaders(headers);
  }

  /**
   * Inject trace context into outgoing request headers
   */
  inject(ctx?: TraceContext): Record<string, string> {
    const context = ctx ?? this.contextManager.current();
    if (!context) return {};
    return this.contextManager.toHeaders(context);
  }

  /**
   * Flush completed spans to exporter
   */
  async flush(): Promise<void> {
    const spans = this.spanManager.flush();
    if (spans.length > 0) {
      try {
        await this.exporter.export(spans);
      } catch (error) {
        this.logger.error("Failed to export spans", error as Error);
      }
    }
  }

  /**
   * Shutdown tracer
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    await this.exporter.shutdown();
    this.spanManager.clear();
    this.contextManager.clear();
  }
}

/**
 * Create a tracer
 */
export function createTracer(options: TracerOptions): Tracer {
  return new Tracer(options);
}

// ============================================================================
// GLOBAL TRACER
// ============================================================================

let globalTracer: Tracer | null = null;

/**
 * Get the global tracer instance
 */
export function getGlobalTracer(): Tracer | null {
  return globalTracer;
}

/**
 * Set the global tracer instance
 */
export function setGlobalTracer(tracer: Tracer): void {
  globalTracer = tracer;
}

/**
 * Reset the global tracer (for testing)
 */
export function resetGlobalTracer(): void {
  globalTracer = null;
}

// ============================================================================
// MIDDLEWARE HELPERS
// ============================================================================

/**
 * Create HTTP server tracing middleware
 */
export function createTracingMiddleware(tracer: Tracer) {
  return async (
    request: Request,
    next: () => Promise<Response>
  ): Promise<Response> => {
    // Extract trace context from incoming request
    const parentCtx = tracer.extract(request.headers);

    // Start server span
    const url = new URL(request.url);
    const spanOpts: {
      kind: SpanKind;
      parent?: TraceContext;
      attributes: Record<string, SpanAttributeValue>;
    } = {
      kind: "server",
      attributes: {
        [SpanAttributes.HTTP_METHOD]: request.method,
        [SpanAttributes.HTTP_URL]: request.url,
      },
    };
    if (parentCtx) {
      spanOpts.parent = parentCtx;
    }
    const span = tracer.startSpan(`${request.method} ${url.pathname}`, spanOpts);

    if (!span) {
      return next();
    }

    try {
      const response = await tracer.getContextManager().run(span.traceContext, next);

      tracer.endSpan(span);
      span.attributes[SpanAttributes.HTTP_STATUS_CODE] = response.status;

      return response;
    } catch (error) {
      tracer.endSpan(span, error as Error);
      throw error;
    }
  };
}

/**
 * Create RPC tracing helpers
 */
export function createRpcTracing(tracer: Tracer) {
  return {
    /**
     * Trace an outgoing RPC call
     */
    async traceCall<T>(
      service: string,
      method: string,
      fn: () => Promise<T>
    ): Promise<T> {
      return tracer.trace(
        `rpc.${service}.${method}`,
        fn,
        {
          kind: "client",
          attributes: {
            [SpanAttributes.RPC_SYSTEM]: "pars",
            [SpanAttributes.RPC_SERVICE]: service,
            [SpanAttributes.RPC_METHOD]: method,
          },
        }
      );
    },

    /**
     * Trace an incoming RPC request
     */
    async traceHandler<T>(
      service: string,
      method: string,
      fn: () => Promise<T>,
      parentCtx?: TraceContext
    ): Promise<T> {
      const handlerOpts: {
        kind: SpanKind;
        parent?: TraceContext;
        attributes: Record<string, SpanAttributeValue>;
      } = {
        kind: "server",
        attributes: {
          [SpanAttributes.RPC_SYSTEM]: "pars",
          [SpanAttributes.RPC_SERVICE]: service,
          [SpanAttributes.RPC_METHOD]: method,
        },
      };
      if (parentCtx) {
        handlerOpts.parent = parentCtx;
      }
      const span = tracer.startSpan(`rpc.${service}.${method}`, handlerOpts);

      if (!span) {
        return fn();
      }

      try {
        const result = await tracer.getContextManager().run(span.traceContext, fn);
        tracer.endSpan(span);
        return result;
      } catch (error) {
        tracer.endSpan(span, error as Error);
        throw error;
      }
    },
  };
}
