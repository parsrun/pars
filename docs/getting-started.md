# Getting Started with Pars

This guide will help you get started quickly with the Pars framework.

## Installation

```bash
# Core packages
pnpm add @parsrun/core @parsrun/server @parsrun/service

# Database (optional)
pnpm add @parsrun/database drizzle-orm

# Auth (optional)
pnpm add @parsrun/auth

# Cache (optional)
pnpm add @parsrun/cache
```

## Project Structure

```
my-app/
├── src/
│   ├── index.ts          # Entry point
│   ├── server.ts         # Server setup
│   ├── services/
│   │   ├── users/
│   │   │   ├── definition.ts
│   │   │   ├── handlers.ts
│   │   │   └── index.ts
│   │   └── email/
│   │       ├── definition.ts
│   │       ├── handlers.ts
│   │       └── index.ts
│   └── lib/
│       ├── db.ts
│       └── cache.ts
├── package.json
├── tsconfig.json
└── wrangler.toml         # For Cloudflare
```

## Core Concepts

### 1. Service Definition

Each service defines queries (read), mutations (write), and events (async communication):

```typescript
// src/services/users/definition.ts
import { defineService } from "@parsrun/service";

export const usersService = defineService({
  name: "users",
  version: "1.0.0",

  queries: {
    getUser: {
      input: { userId: "string" },
      output: { id: "string", email: "string", name: "string" },
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
  },

  events: {
    emits: {
      "user.created": { data: { userId: "string", email: "string" } },
      "user.updated": { data: { userId: "string" } },
    },
  },
});
```

### 2. Service Handlers

Handlers contain the business logic corresponding to the service definition:

```typescript
// src/services/users/handlers.ts
import { createRpcServer } from "@parsrun/service/rpc";
import { createEventEmitter } from "@parsrun/service/events";
import { usersService } from "./definition";

export function createUsersHandlers(deps: { db: Database; eventTransport: EventTransport }) {
  const { db, eventTransport } = deps;

  const emitter = createEventEmitter({
    service: "users",
    definition: usersService,
    transport: eventTransport,
  });

  const server = createRpcServer({
    service: "users",
    version: "1.0.0",
    handlers: {
      // Queries
      getUser: async ({ userId }, ctx) => {
        const user = await db.users.findById(userId);
        if (!user) throw new Error("User not found");
        return { id: user.id, email: user.email, name: user.name };
      },

      listUsers: async ({ limit = 10, offset = 0 }, ctx) => {
        const [users, total] = await Promise.all([
          db.users.findMany({ limit, offset }),
          db.users.count(),
        ]);
        return { users, total };
      },

      // Mutations
      createUser: async ({ email, name }, ctx) => {
        const user = await db.users.create({ email, name });

        // Emit event
        await emitter.emit("user.created", { userId: user.id, email });

        return { id: user.id };
      },

      updateUser: async ({ userId, name }, ctx) => {
        await db.users.update(userId, { name });

        await emitter.emit("user.updated", { userId });

        return { success: true };
      },
    },
  });

  return { server, emitter };
}
```

### 3. Service Client

Use the client to make calls from other services:

```typescript
// Use users service from another service
import { useService } from "@parsrun/service";

async function handleSubscriptionCanceled(customerId: string) {
  const users = useService("users");

  // Call query
  const user = await users.query("getUser", { userId: customerId });

  // Call mutation
  await users.mutate("updateUser", { userId: customerId, name: "Canceled User" });
}
```

## Step-by-Step Example

### 1. Entry Point

```typescript
// src/index.ts
import { Hono } from "hono";
import { createMemoryEventTransport } from "@parsrun/service/events";
import { createHttpHandler } from "@parsrun/service/rpc";
import { createUsersHandlers } from "./services/users/handlers";
import { createEmailHandlers } from "./services/email/handlers";

// Event transport (shared by all services)
const eventTransport = createMemoryEventTransport();

// Database (example)
const db = createDatabase();

// Create services
const users = createUsersHandlers({ db, eventTransport });
const email = createEmailHandlers({ eventTransport });

// Register event listeners
eventTransport.subscribe("user.created", async (event) => {
  // Send welcome email
  await email.server.handle({
    id: crypto.randomUUID(),
    service: "email",
    method: "sendWelcome",
    type: "mutation",
    input: { userId: event.data.userId, email: event.data.email },
  });
});

// HTTP app
const app = new Hono();

// RPC endpoints
app.post("/rpc/users", async (c) => {
  const handler = createHttpHandler(users.server);
  return handler(c.req.raw);
});

app.post("/rpc/email", async (c) => {
  const handler = createHttpHandler(email.server);
  return handler(c.req.raw);
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
```

### 2. For Cloudflare Workers

```typescript
// src/index.ts (Cloudflare Workers)
import { Hono } from "hono";
import { WorkerRpcTransport, QueueEventTransport } from "@parsrun/service/transports/cloudflare";

interface Env {
  USERS_SERVICE: Fetcher;  // Service binding
  EVENTS_QUEUE: Queue;     // Queue binding
  DB: D1Database;          // D1 binding
}

const app = new Hono<{ Bindings: Env }>();

app.post("/api/users", async (c) => {
  // RPC via service binding
  const transport = new WorkerRpcTransport({ binding: c.env.USERS_SERVICE });

  const response = await transport.call({
    id: crypto.randomUUID(),
    service: "users",
    method: "createUser",
    type: "mutation",
    input: await c.req.json(),
  });

  return c.json(response);
});

// Queue consumer
export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch, env: Env) {
    const eventTransport = new QueueEventTransport({ queue: env.EVENTS_QUEUE });

    for (const message of batch.messages) {
      await eventTransport.handleMessage(message);
    }
  },
};
```

## Resilience Patterns

### Circuit Breaker

```typescript
import { CircuitBreaker } from "@parsrun/service/resilience";

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  resetTimeout: 30000,    // Half-open after 30 seconds
  successThreshold: 2,    // Close after 2 successes
});

// Usage
try {
  const result = await circuitBreaker.execute(async () => {
    return await externalApi.call();
  });
} catch (error) {
  if (error.message === "Circuit breaker open") {
    // Fallback behavior
    return cachedResult;
  }
  throw error;
}
```

### Retry with Backoff

```typescript
import { withRetry } from "@parsrun/service/resilience";

const fetchWithRetry = withRetry(
  async () => {
    const response = await fetch("https://api.example.com/data");
    if (!response.ok) throw new Error("Failed");
    return response.json();
  },
  {
    attempts: 3,
    backoff: "exponential",
    initialDelay: 100,
    maxDelay: 5000,
    shouldRetry: (error) => error.message !== "Not Found",
  }
);

const data = await fetchWithRetry();
```

### Timeout

```typescript
import { withTimeout, TimeoutExceededError } from "@parsrun/service/resilience";

const fetchWithTimeout = withTimeout(
  async () => fetch("https://slow-api.com/data"),
  5000 // 5 seconds
);

try {
  const response = await fetchWithTimeout();
} catch (error) {
  if (error instanceof TimeoutExceededError) {
    console.log("Request timed out");
  }
}
```

## Tracing

```typescript
import { createTracer, ConsoleExporter } from "@parsrun/service/tracing";

const tracer = createTracer({
  serviceName: "my-service",
  serviceVersion: "1.0.0",
  exporter: new ConsoleExporter({ pretty: true }),
});

// Automatic span creation
const result = await tracer.trace("process-order", async (span) => {
  span?.attributes["order.id"] = orderId;

  // Child operations
  await tracer.trace("validate-order", async () => {
    // ...
  });

  await tracer.trace("charge-payment", async () => {
    // ...
  });

  return { success: true };
});

// Cleanup
await tracer.shutdown();
```

## Environment Variables

```bash
# .env
NODE_ENV=development

# Auth
AUTH_SECRET=your-secret-key-at-least-32-chars

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# Redis (cache/queue)
REDIS_URL=redis://localhost:6379

# Tracing (production)
OTLP_ENDPOINT=https://otel.example.com

# Email
RESEND_API_KEY=re_xxxxx

# Payments
STRIPE_SECRET_KEY=sk_test_xxxxx
```

## Next Steps

1. **Auth Integration**: Add passwordless authentication with `@parsrun/auth`
2. **Database**: Use Drizzle ORM with `@parsrun/database`
3. **Caching**: Add Redis/Upstash cache with `@parsrun/cache`
4. **Payments**: Integrate Stripe with `@parsrun/payments`
5. **Email**: Send transactional emails with `@parsrun/email`

For detailed API documentation, see the [API Reference](./api/service.md) page.
