# @parsrun/service

> Unified service layer for building microservices with RPC, Events, and Distributed Tracing.

## Features

- **RPC Layer** - Type-safe request-response communication
- **Event Layer** - CloudEvents-compatible async messaging
- **Resilience** - Circuit breaker, bulkhead, retry, timeout
- **Tracing** - W3C Trace Context compatible distributed tracing
- **Multi-Transport** - Embedded, HTTP, Cloudflare (Workers, DO, Queues)

## Installation

```bash
pnpm add @parsrun/service @parsrun/core
```

## Quick Start

### Define a Service

```typescript
import { defineService } from "@parsrun/service";

export const emailService = defineService({
  name: "email",
  version: "1.0.0",
  queries: {
    getTemplates: {
      input: undefined,
      output: { templates: "array" },
    },
  },
  mutations: {
    send: {
      input: {
        to: "string",
        subject: "string",
        html: "string",
      },
      output: {
        success: "boolean",
        messageId: "string?",
      },
    },
  },
  events: {
    emits: {
      "email.sent": {
        data: { messageId: "string", to: "string" },
      },
      "email.failed": {
        data: { error: "string", to: "string" },
      },
    },
  },
});
```

### Use a Service (Client)

```typescript
import { useService } from "@parsrun/service";

// Get service client
const email = useService("email");

// Make RPC calls
const result = await email.mutate("send", {
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hello World</p>",
});

// Subscribe to events
email.on("email.sent", async (event) => {
  console.log("Email sent:", event.data.messageId);
});
```

## Modules

### RPC

Request-response communication between services.

```typescript
import {
  RpcClient,
  RpcServer,
  createRpcClient,
  createRpcServer,
  EmbeddedTransport,
  HttpTransport,
} from "@parsrun/service/rpc";

// Create server
const server = createRpcServer({
  service: "email",
  handlers: {
    send: async (input, ctx) => {
      // Handle request
      return { success: true, messageId: "123" };
    },
  },
});

// Create client
const client = createRpcClient({
  service: "email",
  transport: new EmbeddedTransport(server),
});

// Call method
const result = await client.call("send", {
  to: "user@example.com",
  subject: "Hello",
  html: "<p>Hello</p>",
});
```

### Events

Asynchronous event-driven communication.

```typescript
import {
  EventEmitter,
  createEventEmitter,
  MemoryEventTransport,
  createMemoryEventTransport,
} from "@parsrun/service/events";

// Create transport
const transport = createMemoryEventTransport();

// Create emitter
const emitter = createEventEmitter({
  service: "email",
  transport,
});

// Emit event
await emitter.emit("email.sent", {
  messageId: "123",
  to: "user@example.com",
});

// Subscribe to events
transport.subscribe("email.*", async (event, ctx) => {
  console.log("Event received:", event.type, event.data);
});
```

### Resilience

Patterns for building resilient systems.

```typescript
import {
  CircuitBreaker,
  Bulkhead,
  withRetry,
  withTimeout,
  TimeoutExceededError,
} from "@parsrun/service/resilience";

// Circuit Breaker
const cb = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 30000,
  successThreshold: 2,
});

const result = await cb.execute(async () => {
  return await fetch("https://api.example.com/data");
});

// Bulkhead (concurrency limiting)
const bulkhead = new Bulkhead({
  maxConcurrent: 10,
  maxQueue: 100,
});

await bulkhead.execute(async () => {
  // Limited concurrent execution
});

// Retry with backoff
const fetchWithRetry = withRetry(
  async () => fetch("https://api.example.com/data"),
  {
    attempts: 3,
    backoff: "exponential",
    initialDelay: 100,
    maxDelay: 5000,
    shouldRetry: (error) => error.retryable !== false,
  }
);

// Timeout
const fetchWithTimeout = withTimeout(
  async () => fetch("https://api.example.com/data"),
  5000
);
```

### Tracing

W3C Trace Context compatible distributed tracing.

```typescript
import {
  Tracer,
  createTracer,
  ConsoleExporter,
  OtlpExporter,
} from "@parsrun/service/tracing";

// Create tracer
const tracer = createTracer({
  serviceName: "email-service",
  serviceVersion: "1.0.0",
  exporter: new ConsoleExporter(),
});

// Trace an operation
const result = await tracer.trace("send-email", async (span) => {
  span?.attributes["email.to"] = "user@example.com";
  // ... send email
  return { success: true };
});

// Manual span management
const span = tracer.startSpan("process-webhook", { kind: "server" });
try {
  // Process webhook
  tracer.endSpan(span);
} catch (error) {
  tracer.endSpan(span, error);
  throw error;
}
```

### Cloudflare Transports

Native Cloudflare Workers integration.

```typescript
import {
  WorkerRpcTransport,
  DurableObjectTransport,
  QueueEventTransport,
} from "@parsrun/service/transports/cloudflare";

// Service Binding (Worker-to-Worker RPC)
const transport = new WorkerRpcTransport({
  binding: env.EMAIL_SERVICE, // Service binding
});

// Durable Object RPC
const doTransport = new DurableObjectTransport({
  namespace: env.EMAIL_DO,
  idGenerator: (req) => req.tenantId,
});

// Queue-based Events
const queueTransport = new QueueEventTransport({
  queue: env.EVENTS_QUEUE,
});
```

## Configuration

```typescript
import { mergeConfig, createDevConfig, createProdConfig } from "@parsrun/service";

// Development config
const devConfig = createDevConfig({
  resilience: {
    circuitBreaker: { enabled: false }, // Disable for debugging
  },
  tracing: {
    enabled: true,
    sampler: "always", // Trace everything
  },
});

// Production config
const prodConfig = createProdConfig({
  resilience: {
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000,
    },
    bulkhead: {
      maxConcurrent: 100,
    },
  },
  tracing: {
    enabled: true,
    sampler: { ratio: 0.1 }, // Sample 10% of requests
  },
});
```

## Sub-path Imports

```typescript
// Main entry (everything)
import { defineService, useService } from "@parsrun/service";

// Specific modules
import { RpcClient, RpcServer } from "@parsrun/service/rpc";
import { EventEmitter, MemoryEventTransport } from "@parsrun/service/events";
import { CircuitBreaker, withRetry } from "@parsrun/service/resilience";
import { Tracer, createTracer } from "@parsrun/service/tracing";
import { jsonSerializer } from "@parsrun/service/serialization";
import { WorkerRpcTransport } from "@parsrun/service/transports/cloudflare";
```

## API Reference

### Core

| Export | Description |
|--------|-------------|
| `defineService(def)` | Define a service with queries, mutations, events |
| `useService(name, options?)` | Get a service client |
| `ServiceRegistry` | Manage multiple service instances |

### RPC

| Export | Description |
|--------|-------------|
| `RpcClient` | Client for making RPC calls |
| `RpcServer` | Server for handling RPC requests |
| `EmbeddedTransport` | In-process transport (testing/monolith) |
| `HttpTransport` | HTTP-based transport |
| `createHttpHandler(server)` | Create HTTP request handler |

### Events

| Export | Description |
|--------|-------------|
| `EventEmitter` | Emit CloudEvents-compatible events |
| `EventHandlerRegistry` | Register event handlers |
| `MemoryEventTransport` | In-memory transport |
| `GlobalEventBus` | Cross-service event bus |
| `DeadLetterQueue` | Store failed events |

### Resilience

| Export | Description |
|--------|-------------|
| `CircuitBreaker` | Fail fast when service is unhealthy |
| `Bulkhead` | Limit concurrent requests |
| `withRetry(fn, options)` | Retry failed operations |
| `withTimeout(fn, ms)` | Add timeout to operations |
| `TimeoutExceededError` | Timeout error class |

### Tracing

| Export | Description |
|--------|-------------|
| `Tracer` | Main tracing class |
| `createTraceContext()` | Create W3C trace context |
| `ConsoleExporter` | Export spans to console |
| `OtlpExporter` | Export spans to OTLP endpoint |
| `SpanAttributes` | Standard span attribute names |

## License

MIT
