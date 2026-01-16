/**
 * @parsrun/service - Tracing Module
 * Lightweight distributed tracing with W3C Trace Context
 */

export {
  TraceContextManager,
  createTraceContext,
  createChildContext,
  generateTraceId,
  generateSpanId,
  formatTraceparent,
  parseTraceparent,
  formatTracestate,
  parseTracestate,
  shouldSample,
  type Sampler,
} from "./context.js";

export {
  SpanManager,
  createSpan,
  getSpanDuration,
  isSpanCompleted,
  spanToLogObject,
  SpanAttributes,
  type SpanOptions,
} from "./spans.js";

export {
  ConsoleExporter,
  createConsoleExporter,
  OtlpExporter,
  createOtlpExporter,
  type SpanExporter,
  type ExporterOptions,
  type ConsoleExporterOptions,
  type OtlpExporterOptions,
} from "./exporters.js";

export {
  Tracer,
  createTracer,
  getGlobalTracer,
  setGlobalTracer,
  resetGlobalTracer,
  createTracingMiddleware,
  createRpcTracing,
  type TracerOptions,
} from "./tracer.js";
