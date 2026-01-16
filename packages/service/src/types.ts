/**
 * @parsrun/service - Core Types
 * Type definitions for the unified service layer
 */

// ============================================================================
// SERVICE DEFINITION TYPES
// ============================================================================

/**
 * Query method definition
 * Synchronous request-response pattern
 */
export interface QueryDefinition<TInput = unknown, TOutput = unknown> {
  /** Input schema/type */
  input?: TInput;
  /** Output schema/type */
  output?: TOutput;
  /** Version when this query was added */
  since?: string;
  /** Version when deprecated */
  deprecated?: string;
  /** Replacement method name */
  replacement?: string;
  /** Description for documentation */
  description?: string;
  /** Timeout override in ms */
  timeout?: number;
}

/**
 * Mutation method definition
 * Synchronous request-response pattern that modifies state
 */
export interface MutationDefinition<TInput = unknown, TOutput = unknown> {
  /** Input schema/type */
  input?: TInput;
  /** Output schema/type */
  output?: TOutput;
  /** Version when this mutation was added */
  since?: string;
  /** Version when deprecated */
  deprecated?: string;
  /** Replacement method name */
  replacement?: string;
  /** Description for documentation */
  description?: string;
  /** Timeout override in ms */
  timeout?: number;
  /** Whether this mutation is idempotent */
  idempotent?: boolean;
}

/**
 * Event definition
 */
export interface EventDefinition<TData = unknown> {
  /** Event data schema/type */
  data?: TData;
  /** Delivery guarantee */
  delivery?: "at-most-once" | "at-least-once";
  /** Version when this event was added */
  since?: string;
  /** Description for documentation */
  description?: string;
}

/**
 * Event handler definition
 */
export interface EventHandlerDefinition {
  /** Event type to handle */
  event: string;
  /** Handler options */
  options?: EventHandlerOptions;
}

/**
 * Event handler options
 */
export interface EventHandlerOptions {
  /** Number of retry attempts */
  retries?: number;
  /** Backoff strategy */
  backoff?: "linear" | "exponential";
  /** Maximum delay between retries in ms */
  maxDelay?: number;
  /** Dead letter queue name */
  deadLetter?: string;
  /** Action when retries exhausted */
  onExhausted?: "alert" | "log" | "discard";
}

/**
 * Complete service definition
 */
export interface ServiceDefinition<
  TQueries extends Record<string, QueryDefinition> = Record<string, QueryDefinition>,
  TMutations extends Record<string, MutationDefinition> = Record<string, MutationDefinition>,
  TEmits extends Record<string, EventDefinition> = Record<string, EventDefinition>,
  THandles extends string[] = string[],
> {
  /** Unique service name */
  name: string;
  /** Service version (semver) */
  version: string;
  /** Service description */
  description?: string;

  /** Query methods (read-only, sync) */
  queries?: TQueries;
  /** Mutation methods (write, sync) */
  mutations?: TMutations;

  /** Events this service emits */
  events?: {
    emits?: TEmits;
    handles?: THandles;
  };
}

// ============================================================================
// RPC TYPES
// ============================================================================

/**
 * RPC request envelope
 */
export interface RpcRequest<T = unknown> {
  /** Request ID for correlation */
  id: string;
  /** Service name */
  service: string;
  /** Method name */
  method: string;
  /** Method type */
  type: "query" | "mutation";
  /** Client version requirement */
  version?: string;
  /** Request payload */
  input: T;
  /** Trace context */
  traceContext?: TraceContext;
  /** Request metadata */
  metadata?: RpcMetadata;
}

/**
 * RPC response envelope
 */
export interface RpcResponse<T = unknown> {
  /** Correlation ID */
  id: string;
  /** Whether request succeeded */
  success: boolean;
  /** Service version that handled the request */
  version: string;
  /** Response payload (if success) */
  output?: T;
  /** Error details (if failure) */
  error?: RpcErrorData;
  /** Trace context */
  traceContext?: TraceContext;
  /** Response metadata */
  metadata?: RpcMetadata;
}

/**
 * RPC error data structure (in RPC response)
 */
export interface RpcErrorData {
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Whether client should retry */
  retryable?: boolean;
  /** Suggested retry delay in ms */
  retryAfter?: number;
}

/**
 * RPC metadata
 */
export interface RpcMetadata {
  /** Tenant ID */
  tenantId?: string;
  /** User ID */
  userId?: string;
  /** Request ID */
  requestId?: string;
  /** Custom metadata */
  [key: string]: unknown;
}

// ============================================================================
// EVENT TYPES (CloudEvents compatible)
// ============================================================================

/**
 * CloudEvents-compatible event structure
 */
export interface ParsEvent<T = unknown> {
  /** CloudEvents spec version */
  specversion: "1.0";
  /** Event type (e.g., "subscription.created") */
  type: string;
  /** Event source (service name/path) */
  source: string;
  /** Unique event ID */
  id: string;
  /** Event timestamp (ISO 8601) */
  time: string;
  /** Content type */
  datacontenttype?: string;
  /** Subject (optional context) */
  subject?: string;

  // Pars extensions
  /** Tenant ID */
  parstenantid?: string;
  /** Request ID for correlation */
  parsrequestid?: string;
  /** Trace context (W3C format) */
  parstracecontext?: string;
  /** Delivery guarantee */
  parsdelivery?: "at-most-once" | "at-least-once";

  /** Event payload */
  data: T;
}

/**
 * Compact internal event format (for service bindings)
 */
export interface CompactEvent<T = unknown> {
  /** Event type */
  e: string;
  /** Source service */
  s: string;
  /** Event ID */
  i: string;
  /** Timestamp (unix ms) */
  t: number;
  /** Trace context */
  ctx?: string;
  /** Tenant ID */
  tid?: string;
  /** Data */
  d: T;
}

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (
  event: ParsEvent<T>,
  context: EventHandlerContext
) => Promise<void>;

/**
 * Event handler context
 */
export interface EventHandlerContext {
  /** Logger instance */
  logger: EventLogger;
  /** Current attempt number (1-based) */
  attempt: number;
  /** Maximum attempts */
  maxAttempts: number;
  /** Whether this is a retry */
  isRetry: boolean;
  /** Trace context */
  traceContext?: TraceContext;
}

/**
 * Minimal logger interface for event handlers
 */
export interface EventLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

// ============================================================================
// TRACING TYPES
// ============================================================================

/**
 * W3C Trace Context
 */
export interface TraceContext {
  /** Trace ID (32 hex chars) */
  traceId: string;
  /** Span ID (16 hex chars) */
  spanId: string;
  /** Trace flags */
  traceFlags: number;
  /** Trace state (vendor-specific) */
  traceState?: string;
}

/**
 * Span for tracing
 */
export interface Span {
  /** Span name */
  name: string;
  /** Span kind */
  kind: SpanKind;
  /** Trace context */
  traceContext: TraceContext;
  /** Parent span ID */
  parentSpanId?: string;
  /** Start time (unix ms) */
  startTime: number;
  /** End time (unix ms) */
  endTime?: number;
  /** Span status */
  status: SpanStatus;
  /** Span attributes */
  attributes: Record<string, SpanAttributeValue>;
  /** Span events */
  events: SpanEvent[];
}

export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
export type SpanStatus = "unset" | "ok" | "error";
export type SpanAttributeValue = string | number | boolean | string[] | number[] | boolean[];

export interface SpanEvent {
  name: string;
  time: number;
  attributes?: Record<string, SpanAttributeValue>;
}

// ============================================================================
// TRANSPORT TYPES
// ============================================================================

/**
 * RPC transport interface
 */
export interface RpcTransport {
  /** Transport name */
  readonly name: string;

  /** Send RPC request and get response */
  call<TInput, TOutput>(request: RpcRequest<TInput>): Promise<RpcResponse<TOutput>>;

  /** Close transport connection */
  close?(): Promise<void>;
}

/**
 * Event transport interface
 */
export interface EventTransport {
  /** Transport name */
  readonly name: string;

  /** Emit an event */
  emit<T>(event: ParsEvent<T>): Promise<void>;

  /** Subscribe to events */
  subscribe(
    eventType: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): Unsubscribe;

  /** Close transport connection */
  close?(): Promise<void>;
}

/**
 * Unsubscribe function
 */
export type Unsubscribe = () => void;

// ============================================================================
// CONFIG TYPES
// ============================================================================

/**
 * Service configuration
 */
export interface ServiceConfig {
  /** Event format options */
  events?: EventFormatConfig;
  /** Serialization options */
  serialization?: SerializationConfig;
  /** Tracing options */
  tracing?: TracingConfig;
  /** Versioning options */
  versioning?: VersioningConfig;
  /** Resilience options */
  resilience?: ResilienceConfig;
  /** Dead letter queue options */
  deadLetter?: DeadLetterConfig;
}

export interface EventFormatConfig {
  /** Use CloudEvents format (default: true) */
  format?: "cloudevents" | "compact";
  /** Use compact format for internal communication */
  internalCompact?: boolean;
}

export interface SerializationConfig {
  /** Serialization format */
  format?: "json" | "msgpack";
}

export interface TracingConfig {
  /** Enable tracing */
  enabled?: boolean;
  /** Sampling strategy */
  sampler?: "always" | "never" | { ratio: number };
  /** Exporter type */
  exporter?: "otlp" | "console" | "none";
  /** OTLP endpoint */
  endpoint?: string;
  /** Service name for traces */
  serviceName?: string;
}

export interface VersioningConfig {
  /** Versioning strategy */
  strategy?: "header" | "url" | "none";
  /** Default version to use */
  defaultVersion?: string;
}

export interface ResilienceConfig {
  /** Circuit breaker config */
  circuitBreaker?: CircuitBreakerConfig;
  /** Bulkhead config */
  bulkhead?: BulkheadConfig;
  /** Default timeout in ms */
  timeout?: number;
  /** Retry config */
  retry?: RetryConfig;
}

export interface CircuitBreakerConfig {
  /** Enable circuit breaker */
  enabled?: boolean;
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time to wait before half-open state (ms) */
  resetTimeout?: number;
  /** Number of successes in half-open to close circuit */
  successThreshold?: number;
}

export interface BulkheadConfig {
  /** Maximum concurrent requests */
  maxConcurrent?: number;
  /** Maximum queue size */
  maxQueue?: number;
}

export interface RetryConfig {
  /** Number of retry attempts */
  attempts?: number;
  /** Backoff strategy */
  backoff?: "linear" | "exponential";
  /** Initial delay in ms */
  initialDelay?: number;
  /** Maximum delay in ms */
  maxDelay?: number;
}

export interface DeadLetterConfig {
  /** Enable DLQ */
  enabled?: boolean;
  /** Retention period */
  retention?: string;
  /** Action on DLQ write */
  onFail?: "alert" | "log" | "none";
  /** Alert threshold (number of messages) */
  alertThreshold?: number;
}

// ============================================================================
// CLIENT TYPES
// ============================================================================

/**
 * Service client options
 */
export interface ServiceClientOptions {
  /** Transport mode */
  mode?: "embedded" | "binding" | "http";
  /** HTTP base URL (for http mode) */
  baseUrl?: string;
  /** Cloudflare service binding (for binding mode) */
  binding?: Fetcher;
  /** Embedded service instance (for embedded mode) */
  instance?: ServiceInstance;
  /** Service configuration */
  config?: ServiceConfig;
  /** Custom RPC transport */
  rpcTransport?: RpcTransport;
  /** Custom event transport */
  eventTransport?: EventTransport;
}

/**
 * Cloudflare Fetcher interface (service binding)
 */
export interface Fetcher {
  fetch(input: string | Request | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Service instance (for embedded mode)
 */
export interface ServiceInstance {
  /** Handle RPC request */
  handleRpc<TInput, TOutput>(request: RpcRequest<TInput>): Promise<RpcResponse<TOutput>>;
  /** Handle event */
  handleEvent<T>(event: ParsEvent<T>): Promise<void>;
}

/**
 * Service client interface
 */
export interface ServiceClient<TDef extends ServiceDefinition = ServiceDefinition> {
  /** Service name */
  readonly name: string;

  /** Execute a query */
  query<K extends keyof TDef["queries"]>(
    method: K,
    input: QueryInput<TDef["queries"], K>
  ): Promise<QueryOutput<TDef["queries"], K>>;

  /** Execute a mutation */
  mutate<K extends keyof TDef["mutations"]>(
    method: K,
    input: MutationInput<TDef["mutations"], K>
  ): Promise<MutationOutput<TDef["mutations"], K>>;

  /** Emit an event */
  emit<K extends keyof NonNullable<TDef["events"]>["emits"]>(
    eventType: K,
    data: EventData<NonNullable<TDef["events"]>["emits"], K>
  ): Promise<void>;

  /** Subscribe to events */
  on<T = unknown>(
    eventType: string,
    handler: EventHandler<T>,
    options?: EventHandlerOptions
  ): Unsubscribe;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Extract input type from queries record */
export type QueryInput<
  TQueries extends Record<string, QueryDefinition> | undefined,
  K extends keyof NonNullable<TQueries>,
> = NonNullable<TQueries>[K] extends QueryDefinition<infer TInput, unknown>
  ? TInput
  : never;

/** Extract output type from queries record */
export type QueryOutput<
  TQueries extends Record<string, QueryDefinition> | undefined,
  K extends keyof NonNullable<TQueries>,
> = NonNullable<TQueries>[K] extends QueryDefinition<unknown, infer TOutput>
  ? TOutput
  : never;

/** Extract input type from mutations record */
export type MutationInput<
  TMutations extends Record<string, MutationDefinition> | undefined,
  K extends keyof NonNullable<TMutations>,
> = NonNullable<TMutations>[K] extends MutationDefinition<infer TInput, unknown>
  ? TInput
  : never;

/** Extract output type from mutations record */
export type MutationOutput<
  TMutations extends Record<string, MutationDefinition> | undefined,
  K extends keyof NonNullable<TMutations>,
> = NonNullable<TMutations>[K] extends MutationDefinition<unknown, infer TOutput>
  ? TOutput
  : never;

/** Extract data type from events record */
export type EventData<
  TEvents extends Record<string, EventDefinition> | undefined,
  K extends keyof NonNullable<TEvents>,
> = NonNullable<TEvents>[K] extends EventDefinition<infer TData>
  ? TData
  : never;
