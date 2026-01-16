/**
 * @module
 * Unified service layer for extracted microservices.
 *
 * Provides:
 * - RPC (synchronous request-response)
 * - Events (asynchronous messaging)
 * - Distributed tracing
 * - Resilience patterns (circuit breaker, retry, timeout)
 *
 * @example
 * ```typescript
 * // Define a service
 * const paymentsService = defineService({
 *   name: 'payments',
 *   version: '1.0.0',
 *   queries: {
 *     getSubscription: {
 *       input: { subscriptionId: 'string' },
 *       output: { status: 'string', plan: 'string' },
 *     },
 *   },
 *   mutations: {
 *     subscribe: {
 *       input: { email: 'string', planId: 'string' },
 *       output: { checkoutUrl: 'string' },
 *     },
 *   },
 *   events: {
 *     emits: {
 *       'subscription.created': { data: { customerId: 'string' } },
 *     },
 *   },
 * });
 *
 * // Use the service (client side)
 * const payments = useService('payments');
 * const sub = await payments.query('getSubscription', { subscriptionId: '123' });
 * await payments.emit('subscription.created', { customerId: '456' });
 *
 * // Handle events
 * payments.on('subscription.created', async (event) => {
 *   console.log('New subscription:', event.data);
 * });
 * ```
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type {
  // Service Definition
  ServiceDefinition,
  QueryDefinition,
  MutationDefinition,
  EventDefinition,
  EventHandlerDefinition,
  EventHandlerOptions,

  // RPC Types
  RpcRequest,
  RpcResponse,
  RpcErrorData,
  RpcMetadata,

  // Event Types
  ParsEvent,
  CompactEvent,
  EventHandler,
  EventHandlerContext,
  EventLogger,

  // Tracing Types
  TraceContext,
  Span,
  SpanKind,
  SpanStatus,
  SpanAttributeValue,
  SpanEvent,

  // Transport Types
  RpcTransport,
  EventTransport,
  Unsubscribe,

  // Config Types
  ServiceConfig,
  EventFormatConfig,
  SerializationConfig,
  TracingConfig,
  VersioningConfig,
  ResilienceConfig,
  CircuitBreakerConfig,
  BulkheadConfig,
  RetryConfig,
  DeadLetterConfig,

  // Client Types
  ServiceClientOptions,
  ServiceClient,
  ServiceInstance,
  Fetcher,

  // Utility Types
  QueryInput,
  QueryOutput,
  MutationInput,
  MutationOutput,
  EventData,
} from "./types.js";

// ============================================================================
// SERVICE DEFINITION
// ============================================================================

export {
  defineService,
  getServiceMethods,
  getServiceEvents,
  satisfiesVersion,
  isMethodDeprecated,
  getMethodTimeout,
} from "./define.js";

// ============================================================================
// CLIENT API
// ============================================================================

export {
  useService,
  useTypedService,
  ServiceRegistry,
  createServiceRegistry,
} from "./client.js";

// ============================================================================
// CONFIGURATION
// ============================================================================

export {
  mergeConfig,
  createDevConfig,
  createProdConfig,
  validateConfig,
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_EVENT_CONFIG,
  DEFAULT_SERIALIZATION_CONFIG,
  DEFAULT_TRACING_CONFIG,
  DEFAULT_VERSIONING_CONFIG,
  DEFAULT_RESILIENCE_CONFIG,
  DEFAULT_DEAD_LETTER_CONFIG,
} from "./config.js";

// ============================================================================
// RPC (Re-exports from submodule)
// ============================================================================

export {
  RpcClient,
  createRpcClient,
  RpcServer,
  createRpcServer,
  loggingMiddleware,
  validationMiddleware,
  tenantMiddleware,
  type RpcHandler,
  type RpcHandlers,
  type RpcMiddleware,
  type RpcHandlerContext,
  type CallOptions,
} from "./rpc/index.js";

export {
  EmbeddedTransport,
  createEmbeddedTransport,
  EmbeddedRegistry,
  getEmbeddedRegistry,
} from "./rpc/transports/embedded.js";

export {
  HttpTransport,
  createHttpTransport,
  createHttpHandler,
  parseTraceparent,
  type HttpTransportOptions,
} from "./rpc/transports/http.js";

export {
  RpcError,
  ServiceNotFoundError,
  MethodNotFoundError,
  VersionMismatchError,
  TimeoutError,
  CircuitOpenError,
  BulkheadRejectedError,
  TransportError,
  SerializationError,
  toRpcError,
} from "./rpc/errors.js";

// ============================================================================
// EVENTS (Re-exports from submodule)
// ============================================================================

export {
  createEvent,
  toCloudEvent,
  toCompactEvent,
  fromCompactEvent,
  formatEventType,
  parseEventType,
  matchEventType,
  validateEvent,
  validateCompactEvent,
} from "./events/format.js";

export {
  EventEmitter,
  createEventEmitter,
  createTypedEmitter,
  ScopedEmitter,
  type EventEmitterOptions,
  type EmitOptions,
  type TypedEventEmitter,
} from "./events/emitter.js";

export {
  EventHandlerRegistry,
  createEventHandlerRegistry,
  type HandlerRegistration,
  type EventHandlerRegistryOptions,
} from "./events/handler.js";

export {
  MemoryEventTransport,
  createMemoryEventTransport,
  GlobalEventBus,
  getGlobalEventBus,
  type MemoryEventTransportOptions,
} from "./events/transports/memory.js";

export {
  DeadLetterQueue,
  createDeadLetterQueue,
  type DeadLetterEntry,
  type DeadLetterQueueOptions,
  type AddEntryOptions,
} from "./events/dead-letter.js";

// ============================================================================
// RESILIENCE (Re-exports from submodule)
// ============================================================================

export {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitState,
} from "./resilience/circuit-breaker.js";

export {
  Bulkhead,
  type BulkheadOptions,
} from "./resilience/bulkhead.js";

export {
  withRetry,
  executeWithRetry,
  createRetryWrapper,
  type RetryOptions,
} from "./resilience/retry.js";

export {
  withTimeout,
  executeWithTimeout,
  createTimeoutWrapper,
  raceWithTimeout,
  executeWithDeadline,
  TimeoutExceededError,
} from "./resilience/timeout.js";

// ============================================================================
// TRACING (Re-exports from submodule)
// ============================================================================

export {
  TraceContextManager,
  createTraceContext,
  createChildContext,
  generateTraceId,
  generateSpanId,
  formatTraceparent,
  formatTracestate,
  parseTracestate,
  shouldSample,
  type Sampler,
} from "./tracing/context.js";

export {
  SpanManager,
  createSpan,
  getSpanDuration,
  isSpanCompleted,
  spanToLogObject,
  SpanAttributes,
  type SpanOptions,
} from "./tracing/spans.js";

export {
  ConsoleExporter,
  createConsoleExporter,
  OtlpExporter,
  createOtlpExporter,
  type SpanExporter,
  type ExporterOptions,
  type ConsoleExporterOptions,
  type OtlpExporterOptions,
} from "./tracing/exporters.js";

export {
  Tracer,
  createTracer,
  getGlobalTracer,
  setGlobalTracer,
  resetGlobalTracer,
  createTracingMiddleware,
  createRpcTracing,
  type TracerOptions,
} from "./tracing/tracer.js";

// ============================================================================
// SERIALIZATION (Re-exports from submodule)
// ============================================================================

export {
  jsonSerializer,
  msgpackSerializer,
  getSerializer,
  createSerializer,
  type Serializer,
} from "./serialization/index.js";
