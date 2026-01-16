/**
 * @parsrun/service - Trace Exporters
 * Console and OTLP exporters for spans
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type { Span } from "../types.js";
import { spanToLogObject, getSpanDuration } from "./spans.js";

// ============================================================================
// EXPORTER INTERFACE
// ============================================================================

/**
 * Interface for span exporters.
 * Exporters receive completed spans and send them to a backend.
 */
export interface SpanExporter {
  /** Exporter name */
  readonly name: string;
  /** Export spans to the backend */
  export(spans: Span[]): Promise<void>;
  /** Shutdown exporter and flush pending spans */
  shutdown(): Promise<void>;
}

/**
 * Base options for span exporters.
 */
export interface ExporterOptions {
  /** Logger */
  logger?: Logger;
}

// ============================================================================
// CONSOLE EXPORTER
// ============================================================================

/**
 * Options for the console exporter.
 */
export interface ConsoleExporterOptions extends ExporterOptions {
  /** Pretty print (default: true in dev) */
  pretty?: boolean;
  /** Include attributes (default: true) */
  includeAttributes?: boolean;
  /** Include events (default: true) */
  includeEvents?: boolean;
}

/**
 * Console exporter for development and debugging.
 * Outputs spans to the console with optional pretty formatting.
 */
export class ConsoleExporter implements SpanExporter {
  readonly name = "console";
  private readonly logger: Logger;
  private readonly pretty: boolean;
  private readonly includeAttributes: boolean;
  private readonly includeEvents: boolean;

  constructor(options: ConsoleExporterOptions = {}) {
    this.logger = options.logger ?? createLogger({ name: "trace-exporter" });
    this.pretty = options.pretty ?? true;
    this.includeAttributes = options.includeAttributes ?? true;
    this.includeEvents = options.includeEvents ?? true;
  }

  async export(spans: Span[]): Promise<void> {
    for (const span of spans) {
      const duration = getSpanDuration(span);
      const status = span.status === "error" ? "ERROR" : span.status === "ok" ? "OK" : "UNSET";

      if (this.pretty) {
        const indent = span.parentSpanId ? "  └─" : "──";
        const statusIcon = span.status === "error" ? "✗" : span.status === "ok" ? "✓" : "○";
        const durationStr = duration !== undefined ? `${duration}ms` : "?ms";

        console.log(
          `${indent} ${statusIcon} [${span.kind}] ${span.name} (${durationStr}) trace=${span.traceContext.traceId.slice(0, 8)}`
        );

        if (this.includeAttributes && Object.keys(span.attributes).length > 0) {
          console.log(`     attributes:`, span.attributes);
        }

        if (this.includeEvents && span.events.length > 0) {
          for (const event of span.events) {
            console.log(`     event: ${event.name}`, event.attributes ?? "");
          }
        }
      } else {
        const logObj = spanToLogObject(span);
        this.logger.info(`Span: ${span.name}`, {
          ...logObj,
          status,
          durationMs: duration,
        });
      }
    }
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Create a console exporter for local development.
 *
 * @param options - Exporter configuration options
 * @returns A new console exporter instance
 */
export function createConsoleExporter(options?: ConsoleExporterOptions): ConsoleExporter {
  return new ConsoleExporter(options);
}

// ============================================================================
// OTLP EXPORTER
// ============================================================================

/**
 * Options for the OTLP exporter.
 */
export interface OtlpExporterOptions extends ExporterOptions {
  /** OTLP endpoint URL */
  endpoint: string;
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Timeout in ms */
  timeout?: number;
  /** Batch size */
  batchSize?: number;
  /** Flush interval in ms */
  flushInterval?: number;
}

/**
 * OTLP exporter for production tracing.
 * Sends spans to an OpenTelemetry-compatible backend via HTTP.
 */
export class OtlpExporter implements SpanExporter {
  readonly name = "otlp";
  private readonly endpoint: string;
  private readonly serviceName: string;
  private readonly serviceVersion: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly logger: Logger;
  private readonly buffer: Span[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: OtlpExporterOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.serviceName = options.serviceName;
    this.serviceVersion = options.serviceVersion ?? "1.0.0";
    this.headers = options.headers ?? {};
    this.timeout = options.timeout ?? 10_000;
    this.batchSize = options.batchSize ?? 100;
    this.flushInterval = options.flushInterval ?? 5_000;
    this.logger = options.logger ?? createLogger({ name: "otlp-exporter" });

    // Start flush timer
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  async export(spans: Span[]): Promise<void> {
    this.buffer.push(...spans);

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const spansToExport = this.buffer.splice(0, this.batchSize);

    try {
      const payload = this.buildOtlpPayload(spansToExport);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(`${this.endpoint}/v1/traces`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.headers,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
        }

        this.logger.debug(`Exported ${spansToExport.length} spans to OTLP`);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      this.logger.error(`Failed to export spans to OTLP`, error as Error);
      // Put spans back in buffer for retry
      this.buffer.unshift(...spansToExport);
    }
  }

  private buildOtlpPayload(spans: Span[]): OtlpTracePayload {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
              { key: "service.version", value: { stringValue: this.serviceVersion } },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "@parsrun/service",
                version: "0.1.0",
              },
              spans: spans.map((span) => this.convertSpan(span)),
            },
          ],
        },
      ],
    };
  }

  private convertSpan(span: Span): OtlpSpan {
    const otlpSpan: OtlpSpan = {
      traceId: span.traceContext.traceId,
      spanId: span.traceContext.spanId,
      name: span.name,
      kind: this.convertSpanKind(span.kind),
      startTimeUnixNano: String(span.startTime * 1_000_000),
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: this.convertAttributeValue(value),
      })),
      events: span.events.map((event) => ({
        name: event.name,
        timeUnixNano: String(event.time * 1_000_000),
        attributes: event.attributes
          ? Object.entries(event.attributes).map(([key, value]) => ({
              key,
              value: this.convertAttributeValue(value),
            }))
          : [],
      })),
      status: {
        code: span.status === "error" ? 2 : span.status === "ok" ? 1 : 0,
      },
    };

    if (span.parentSpanId) {
      otlpSpan.parentSpanId = span.parentSpanId;
    }
    if (span.endTime) {
      otlpSpan.endTimeUnixNano = String(span.endTime * 1_000_000);
    }

    return otlpSpan;
  }

  private convertSpanKind(kind: string): number {
    switch (kind) {
      case "internal":
        return 1;
      case "server":
        return 2;
      case "client":
        return 3;
      case "producer":
        return 4;
      case "consumer":
        return 5;
      default:
        return 0;
    }
  }

  private convertAttributeValue(value: unknown): OtlpAttributeValue {
    if (typeof value === "string") {
      return { stringValue: value };
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { intValue: String(value) };
      }
      return { doubleValue: value };
    }
    if (typeof value === "boolean") {
      return { boolValue: value };
    }
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((v) => this.convertAttributeValue(v)),
        },
      };
    }
    return { stringValue: String(value) };
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

/**
 * Create an OTLP exporter for production tracing.
 *
 * @param options - Exporter configuration options
 * @returns A new OTLP exporter instance
 *
 * @example
 * ```typescript
 * const exporter = createOtlpExporter({
 *   endpoint: 'https://otel-collector.example.com:4318',
 *   serviceName: 'payments',
 * });
 * ```
 */
export function createOtlpExporter(options: OtlpExporterOptions): OtlpExporter {
  return new OtlpExporter(options);
}

// ============================================================================
// OTLP TYPES
// ============================================================================

interface OtlpTracePayload {
  resourceSpans: Array<{
    resource: {
      attributes: OtlpAttribute[];
    };
    scopeSpans: Array<{
      scope: {
        name: string;
        version: string;
      };
      spans: OtlpSpan[];
    }>;
  }>;
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: OtlpAttribute[];
  events: Array<{
    name: string;
    timeUnixNano: string;
    attributes: OtlpAttribute[];
  }>;
  status: {
    code: number;
  };
}

interface OtlpAttribute {
  key: string;
  value: OtlpAttributeValue;
}

interface OtlpAttributeValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: {
    values: OtlpAttributeValue[];
  };
}
