# Getting Started with Pars

Bu rehber, Pars framework'ü ile hızlıca başlamanızı sağlar.

## Kurulum

```bash
# Core paketler
pnpm add @parsrun/core @parsrun/server @parsrun/service

# Veritabanı (opsiyonel)
pnpm add @parsrun/database drizzle-orm

# Auth (opsiyonel)
pnpm add @parsrun/auth

# Cache (opsiyonel)
pnpm add @parsrun/cache
```

## Proje Yapısı

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
└── wrangler.toml         # Cloudflare için
```

## Temel Kavramlar

### 1. Service Definition

Her servis, queries (okuma), mutations (yazma) ve events (async iletişim) tanımlar:

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

Handler'lar service definition'a karşılık gelen iş mantığını içerir:

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

Diğer servislerden çağrı yapmak için client kullanın:

```typescript
// Başka bir servisten users servisini kullan
import { useService } from "@parsrun/service";

async function handleSubscriptionCanceled(customerId: string) {
  const users = useService("users");

  // Query çağır
  const user = await users.query("getUser", { userId: customerId });

  // Mutation çağır
  await users.mutate("updateUser", { userId: customerId, name: "Canceled User" });
}
```

## Adım Adım Örnek

### 1. Entry Point

```typescript
// src/index.ts
import { Hono } from "hono";
import { createMemoryEventTransport } from "@parsrun/service/events";
import { createHttpHandler } from "@parsrun/service/rpc";
import { createUsersHandlers } from "./services/users/handlers";
import { createEmailHandlers } from "./services/email/handlers";

// Event transport (tüm servisler paylaşır)
const eventTransport = createMemoryEventTransport();

// Database (örnek)
const db = createDatabase();

// Servisleri oluştur
const users = createUsersHandlers({ db, eventTransport });
const email = createEmailHandlers({ eventTransport });

// Event dinleyicileri kaydet
eventTransport.subscribe("user.created", async (event) => {
  // Hoşgeldin e-postası gönder
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

// RPC endpoint'leri
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

### 2. Cloudflare Workers için

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
  // Service binding ile RPC
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
  failureThreshold: 5,    // 5 hata sonrası aç
  resetTimeout: 30000,    // 30 saniye sonra half-open
  successThreshold: 2,    // 2 başarı ile kapat
});

// Kullanım
try {
  const result = await circuitBreaker.execute(async () => {
    return await externalApi.call();
  });
} catch (error) {
  if (error.message === "Circuit breaker open") {
    // Fallback davranış
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
  5000 // 5 saniye
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

// Otomatik span oluşturma
const result = await tracer.trace("process-order", async (span) => {
  span?.attributes["order.id"] = orderId;

  // Alt işlemler
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

## Sonraki Adımlar

1. **Auth Entegrasyonu**: `@parsrun/auth` ile passwordless authentication ekleyin
2. **Database**: `@parsrun/database` ile Drizzle ORM kullanın
3. **Caching**: `@parsrun/cache` ile Redis/Upstash cache ekleyin
4. **Payments**: `@parsrun/payments` ile Stripe entegrasyonu yapın
5. **Email**: `@parsrun/email` ile transactional email gönderin

Detaylı API dokümantasyonu için [API Reference](./api/service.md) sayfasına bakın.
