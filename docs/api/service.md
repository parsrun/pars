# @parsrun/service API Reference

## Table of Contents

- [Service Definition](#service-definition)
- [Client API](#client-api)
- [RPC Module](#rpc-module)
- [Events Module](#events-module)
- [Resilience Module](#resilience-module)
- [Tracing Module](#tracing-module)
- [Configuration](#configuration)

---

## Service Definition

### `defineService(definition)`

Define a service with its queries, mutations, and events.

```typescript
function defineService<T extends ServiceDefinition>(definition: T): T;
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `definition.name` | `string` | Unique service name |
| `definition.version` | `string` | Semantic version (e.g., "1.0.0") |
| `definition.queries` | `Record<string, QueryDefinition>` | Read operations |
| `definition.mutations` | `Record<string, MutationDefinition>` | Write operations |
| `definition.events` | `EventDefinition` | Event definitions |

**Example:**

```typescript
import { defineService } from "@parsrun/service";

export const userService = defineService({
  name: "users",
  version: "1.0.0",
  queries: {
    getUser: {
      input: { userId: "string" },
      output: { id: "string", email: "string", name: "string?" },
      timeout: 5000,
    },
    listUsers: {
      input: { limit: "number?", offset: "number?" },
      output: { users: "array", total: "number" },
    },
  },
  mutations: {
    createUser: {
      input: { email: "string", name: "string" },
      output: { id: "string" },
    },
    updateUser: {
      input: { userId: "string", name: "string?" },
      output: { success: "boolean" },
    },
    deleteUser: {
      input: { userId: "string" },
      output: { success: "boolean" },
      deprecated: "Use deactivateUser instead",
    },
  },
  events: {
    emits: {
      "user.created": {
        data: { userId: "string", email: "string" },
        delivery: "at-least-once",
      },
      "user.updated": {
        data: { userId: "string", changes: "object" },
      },
      "user.deleted": {
        data: { userId: "string" },
      },
    },
    handles: {
      "subscription.canceled": {
        handler: "deactivateUser",
        retries: 3,
        backoff: "exponential",
      },
    },
  },
});
```

---

### `getServiceMethods(definition)`

Get all methods (queries + mutations) from a service definition.

```typescript
function getServiceMethods(definition: ServiceDefinition): string[];
```

### `getServiceEvents(definition)`

Get all event types that a service emits.

```typescript
function getServiceEvents(definition: ServiceDefinition): string[];
```

### `satisfiesVersion(requested, available)`

Check if available version satisfies requested version.

```typescript
function satisfiesVersion(requested: string, available: string): boolean;
```

### `isMethodDeprecated(definition, method)`

Check if a method is marked as deprecated.

```typescript
function isMethodDeprecated(definition: ServiceDefinition, method: string): boolean;
```

### `getMethodTimeout(definition, method)`

Get timeout for a method (returns default if not specified).

```typescript
function getMethodTimeout(definition: ServiceDefinition, method: string): number;
```

---

## Client API

### `useService(name, options?)`

Get a typed service client for making RPC calls and subscribing to events.

```typescript
function useService<T extends ServiceDefinition>(
  name: string,
  options?: ServiceClientOptions
): ServiceClient<T>;
```

**Options:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `"embedded" \| "http"` | `"embedded"` | Transport mode |
| `baseUrl` | `string` | - | Base URL for HTTP mode |
| `version` | `string` | - | Required service version |
| `timeout` | `number` | `30000` | Request timeout in ms |
| `resilience` | `ResilienceConfig` | - | Resilience configuration |
| `tracing` | `TracingConfig` | - | Tracing configuration |

**ServiceClient Methods:**

```typescript
interface ServiceClient<T> {
  // Execute a query
  query<K extends keyof T["queries"]>(
    name: K,
    input: QueryInput<T, K>
  ): Promise<QueryOutput<T, K>>;

  // Execute a mutation
  mutate<K extends keyof T["mutations"]>(
    name: K,
    input: MutationInput<T, K>
  ): Promise<MutationOutput<T, K>>;

  // Emit an event
  emit<K extends keyof T["events"]["emits"]>(
    type: K,
    data: EventData<T, K>
  ): Promise<string>;

  // Subscribe to events
  on<K extends keyof T["events"]["emits"]>(
    type: K,
    handler: (event: ParsEvent<EventData<T, K>>) => Promise<void>
  ): () => void;

  // Close the client
  close(): Promise<void>;
}
```

**Example:**

```typescript
import { useService } from "@parsrun/service";

// Embedded mode (same process)
const users = useService("users");

// HTTP mode (remote service)
const users = useService("users", {
  mode: "http",
  baseUrl: "https://users.api.example.com",
});

// Make calls
const user = await users.query("getUser", { userId: "123" });
const { id } = await users.mutate("createUser", { email: "a@b.com", name: "Test" });

// Subscribe to events
const unsubscribe = users.on("user.created", async (event) => {
  console.log("New user:", event.data.userId);
});

// Cleanup
unsubscribe();
await users.close();
```

---

### `useTypedService(definition, options?)`

Create a typed service client from a service definition.

```typescript
function useTypedService<T extends ServiceDefinition>(
  definition: T,
  options?: ServiceClientOptions
): ServiceClient<T>;
```

---

### `ServiceRegistry`

Manage multiple service instances.

```typescript
class ServiceRegistry {
  register(name: string, instance: ServiceInstance): void;
  unregister(name: string): boolean;
  get(name: string): ServiceInstance | undefined;
  has(name: string): boolean;
  getNames(): string[];
  clear(): void;
}

function createServiceRegistry(): ServiceRegistry;
```

---

## RPC Module

Import: `@parsrun/service/rpc`

### `RpcClient`

Client for making RPC calls.

```typescript
class RpcClient {
  constructor(options: RpcClientOptions);

  call<TInput, TOutput>(
    method: string,
    input: TInput,
    options?: CallOptions
  ): Promise<TOutput>;

  close(): Promise<void>;
}

interface RpcClientOptions {
  service: string;
  version?: string;
  transport: RpcTransport;
  timeout?: number;
  resilience?: ResilienceConfig;
}

interface CallOptions {
  timeout?: number;
  traceContext?: TraceContext;
  tenantId?: string;
}
```

### `RpcServer`

Server for handling RPC requests.

```typescript
class RpcServer {
  constructor(options: RpcServerOptions);

  handle<TInput, TOutput>(
    request: RpcRequest<TInput>
  ): Promise<RpcResponse<TOutput>>;

  use(middleware: RpcMiddleware): void;
}

interface RpcServerOptions {
  service: string;
  version?: string;
  handlers: RpcHandlers;
  middleware?: RpcMiddleware[];
}

type RpcHandler<TInput, TOutput> = (
  input: TInput,
  context: RpcHandlerContext
) => Promise<TOutput>;

interface RpcHandlerContext {
  service: string;
  method: string;
  type: "query" | "mutation";
  requestId: string;
  tenantId?: string;
  traceContext?: TraceContext;
  logger: Logger;
}
```

### Middlewares

```typescript
// Logging middleware
function loggingMiddleware(): RpcMiddleware;

// Validation middleware
function validationMiddleware(validators: Record<string, Validator>): RpcMiddleware;

// Tenant middleware
function tenantMiddleware(): RpcMiddleware;
```

### Transports

```typescript
// Embedded (in-process)
class EmbeddedTransport implements RpcTransport {
  constructor(server: RpcServer);
}

// HTTP
class HttpTransport implements RpcTransport {
  constructor(options: HttpTransportOptions);
}

interface HttpTransportOptions {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
  serializer?: Serializer;
}

// Create HTTP handler for server
function createHttpHandler(server: RpcServer): (request: Request) => Promise<Response>;
```

### Errors

```typescript
class RpcError extends ParsError {
  retryable: boolean;
  retryAfter?: number;
}

class ServiceNotFoundError extends RpcError {}
class MethodNotFoundError extends RpcError {}
class VersionMismatchError extends RpcError {}
class TimeoutError extends RpcError {}
class CircuitOpenError extends RpcError {}
class BulkheadRejectedError extends RpcError {}
class TransportError extends RpcError {}
class SerializationError extends RpcError {}

function toRpcError(error: unknown): RpcError;
```

---

## Events Module

Import: `@parsrun/service/events`

### `EventEmitter`

Emit CloudEvents-compatible events.

```typescript
class EventEmitter {
  constructor(options: EventEmitterOptions);

  emit<T>(type: string, data: T, options?: EmitOptions): Promise<string>;
  emitBatch<T>(events: Array<{ type: string; data: T }>): Promise<string[]>;
  scoped(options: Partial<EmitOptions>): ScopedEmitter;
}

interface EventEmitterOptions {
  service: string;
  definition?: ServiceDefinition;
  transport: EventTransport;
  logger?: Logger;
  defaultTenantId?: string;
  validateEvents?: boolean;
}

interface EmitOptions {
  eventId?: string;
  subject?: string;
  tenantId?: string;
  requestId?: string;
  traceContext?: TraceContext;
  delivery?: "at-most-once" | "at-least-once";
}
```

### `EventHandlerRegistry`

Register and manage event handlers.

```typescript
class EventHandlerRegistry {
  constructor(options?: EventHandlerRegistryOptions);

  register(
    pattern: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): Unsubscribe;

  handle(event: ParsEvent): Promise<void>;
  getPatterns(): string[];
  hasHandlers(pattern: string): boolean;
  clear(): void;
}

type EventHandler = (
  event: ParsEvent,
  context: EventHandlerContext
) => Promise<void>;

interface EventHandlerContext {
  logger: Logger;
  attempt: number;
  maxAttempts: number;
  isRetry: boolean;
  traceContext?: TraceContext;
}
```

### Event Format

```typescript
// Create CloudEvents-compatible event
function createEvent<T>(options: CreateEventOptions<T>): ParsEvent<T>;

// Convert between formats
function toCloudEvent<T>(event: ParsEvent<T>): ParsEvent<T>;
function toCompactEvent<T>(event: ParsEvent<T>): CompactEvent<T>;
function fromCompactEvent<T>(compact: CompactEvent<T>): ParsEvent<T>;

// Event type utilities
function formatEventType(source: string, type: string): string;
function parseEventType(fullType: string): { source: string; type: string } | null;
function matchEventType(type: string, pattern: string): boolean;

// Validation
function validateEvent(event: unknown): event is ParsEvent;
function validateCompactEvent(event: unknown): event is CompactEvent;
```

### Transports

```typescript
// Memory transport
class MemoryEventTransport implements EventTransport {
  constructor(options?: MemoryEventTransportOptions);
  emit<T>(event: ParsEvent<T>): Promise<void>;
  subscribe(pattern: string, handler: EventHandler): Unsubscribe;
  flush(): Promise<void>;
  clear(): void;
}

// Global event bus
class GlobalEventBus {
  static getInstance(): GlobalEventBus;
  register(serviceName: string, transport: MemoryEventTransport): void;
  unregister(serviceName: string): boolean;
  broadcast(event: ParsEvent, excludeSource?: string): Promise<void>;
  send(serviceName: string, event: ParsEvent): Promise<void>;
  getServices(): string[];
  clear(): void;
}

function getGlobalEventBus(): GlobalEventBus;
```

### Dead Letter Queue

```typescript
class DeadLetterQueue {
  constructor(options?: DeadLetterQueueOptions);

  add(options: AddEntryOptions): Promise<string>;
  get(id: string): DeadLetterEntry | undefined;
  getAll(): DeadLetterEntry[];
  getByEventType(eventType: string): DeadLetterEntry[];
  getByPattern(pattern: string): DeadLetterEntry[];
  remove(id: string): boolean;
  retry(id: string): ParsEvent | undefined;
  clear(): void;
  close(): void;
}
```

---

## Resilience Module

Import: `@parsrun/service/resilience`

### `CircuitBreaker`

Prevent cascading failures.

```typescript
class CircuitBreaker {
  constructor(options: CircuitBreakerOptions);

  get state(): CircuitState; // "closed" | "open" | "half-open"
  execute<T>(fn: () => Promise<T>): Promise<T>;
  reset(): void;
  getStats(): CircuitBreakerStats;
}

interface CircuitBreakerOptions {
  failureThreshold: number;  // Failures before opening
  resetTimeout: number;      // Ms before half-open
  successThreshold: number;  // Successes to close from half-open
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}
```

### `Bulkhead`

Limit concurrent requests.

```typescript
class Bulkhead {
  constructor(options: BulkheadOptions);

  execute<T>(fn: () => Promise<T>): Promise<T>;
}

interface BulkheadOptions {
  maxConcurrent: number;  // Max concurrent executions
  maxQueue: number;       // Max queued requests (0 = reject immediately)
}
```

### Retry

```typescript
// Wrap function with retry
function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): () => Promise<T>;

// Execute with retry immediately
function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T>;

// Create reusable retry wrapper
function createRetryWrapper(
  defaultOptions: Partial<RetryOptions>
): <T>(fn: () => Promise<T>, options?: Partial<RetryOptions>) => Promise<T>;

interface RetryOptions {
  attempts: number;
  backoff: "linear" | "exponential";
  initialDelay: number;
  maxDelay: number;
  jitter?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}
```

### Timeout

```typescript
// Wrap function with timeout
function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): () => Promise<T>;

// Execute with timeout immediately
function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T>;

// Create reusable timeout wrapper
function createTimeoutWrapper(
  defaultTimeoutMs: number
): <T>(fn: () => Promise<T>, timeoutMs?: number) => Promise<T>;

// Race multiple promises with timeout
function raceWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<T>;

// Execute with absolute deadline
function executeWithDeadline<T>(
  fn: () => Promise<T>,
  deadline: Date
): Promise<T>;

class TimeoutExceededError extends Error {
  timeout: number;
}
```

---

## Tracing Module

Import: `@parsrun/service/tracing`

### `Tracer`

Main tracing class.

```typescript
class Tracer {
  constructor(options: TracerOptions);

  startSpan(name: string, options?: SpanStartOptions): Span | null;
  endSpan(span: Span | null, error?: Error): void;

  trace<T>(
    name: string,
    fn: (span: Span | null) => Promise<T>,
    options?: SpanStartOptions
  ): Promise<T>;

  setAttribute(key: string, value: SpanAttributeValue): void;
  addEvent(name: string, attributes?: Record<string, SpanAttributeValue>): void;

  currentContext(): TraceContext | undefined;
  extract(headers: Headers | Record<string, string>): TraceContext | undefined;
  inject(ctx?: TraceContext): Record<string, string>;

  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

interface TracerOptions {
  serviceName: string;
  serviceVersion?: string;
  config?: TracingConfig;
  exporter?: SpanExporter;
  logger?: Logger;
}
```

### Trace Context

```typescript
interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

function createTraceContext(options?: Partial<TraceContext>): TraceContext;
function createChildContext(parent: TraceContext): TraceContext;
function generateTraceId(): string;
function generateSpanId(): string;
function formatTraceparent(ctx: TraceContext): string;
function parseTraceparent(header: string): TraceContext | null;
function formatTracestate(state: Record<string, string>): string;
function parseTracestate(header: string): Record<string, string>;
```

### Spans

```typescript
interface Span {
  name: string;
  kind: SpanKind;
  traceContext: TraceContext;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: Record<string, SpanAttributeValue>;
  events: SpanEvent[];
}

type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
type SpanStatus = "unset" | "ok" | "error";

function createSpan(options: SpanOptions): Span;
function getSpanDuration(span: Span): number | undefined;
function isSpanCompleted(span: Span): boolean;
function spanToLogObject(span: Span): Record<string, unknown>;

// Standard attribute names
const SpanAttributes: {
  HTTP_METHOD: "http.method";
  HTTP_URL: "http.url";
  HTTP_STATUS_CODE: "http.status_code";
  RPC_SYSTEM: "rpc.system";
  RPC_SERVICE: "rpc.service";
  RPC_METHOD: "rpc.method";
  // ... more
};
```

### Exporters

```typescript
interface SpanExporter {
  name: string;
  export(spans: Span[]): Promise<void>;
  shutdown(): Promise<void>;
}

// Console exporter (development)
class ConsoleExporter implements SpanExporter {
  constructor(options?: ConsoleExporterOptions);
}

// OTLP exporter (production)
class OtlpExporter implements SpanExporter {
  constructor(options: OtlpExporterOptions);
}

interface OtlpExporterOptions {
  endpoint: string;
  serviceName: string;
  serviceVersion?: string;
  headers?: Record<string, string>;
  timeout?: number;
  batchSize?: number;
  flushInterval?: number;
}
```

### Sampling

```typescript
type Sampler = "always" | "never" | { ratio: number };

function shouldSample(sampler: Sampler, traceId?: string): boolean;
```

### Global Tracer

```typescript
function getGlobalTracer(): Tracer | null;
function setGlobalTracer(tracer: Tracer): void;
function resetGlobalTracer(): void;
```

### Middleware Helpers

```typescript
// HTTP tracing middleware
function createTracingMiddleware(tracer: Tracer): (
  request: Request,
  next: () => Promise<Response>
) => Promise<Response>;

// RPC tracing helpers
function createRpcTracing(tracer: Tracer): {
  traceCall<T>(service: string, method: string, fn: () => Promise<T>): Promise<T>;
  traceHandler<T>(service: string, method: string, fn: () => Promise<T>, parentCtx?: TraceContext): Promise<T>;
};
```

---

## Configuration

### Default Configs

```typescript
import {
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_EVENT_CONFIG,
  DEFAULT_SERIALIZATION_CONFIG,
  DEFAULT_TRACING_CONFIG,
  DEFAULT_VERSIONING_CONFIG,
  DEFAULT_RESILIENCE_CONFIG,
  DEFAULT_DEAD_LETTER_CONFIG,
} from "@parsrun/service";
```

### Config Helpers

```typescript
// Merge configs
function mergeConfig(
  base: ServiceConfig,
  override: Partial<ServiceConfig>
): ServiceConfig;

// Create development config
function createDevConfig(
  overrides?: Partial<ServiceConfig>
): ServiceConfig;

// Create production config
function createProdConfig(
  overrides?: Partial<ServiceConfig>
): ServiceConfig;

// Validate config
function validateConfig(config: unknown): config is ServiceConfig;
```

### Types

```typescript
interface ServiceConfig {
  events?: EventFormatConfig;
  serialization?: SerializationConfig;
  tracing?: TracingConfig;
  versioning?: VersioningConfig;
  resilience?: ResilienceConfig;
  deadLetter?: DeadLetterConfig;
}

interface ResilienceConfig {
  circuitBreaker?: CircuitBreakerConfig;
  bulkhead?: BulkheadConfig;
  retry?: RetryConfig;
  timeout?: number;
}

interface TracingConfig {
  enabled?: boolean;
  sampler?: Sampler;
  exporterEndpoint?: string;
}
```
