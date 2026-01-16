# Pars Framework

> Modern, edge-compatible TypeScript framework for building scalable multi-tenant applications.

## Overview

Pars is a modular framework built for multi-runtime environments (Node.js, Cloudflare Workers, Deno, Bun). It provides:

- **Microservice Architecture** - RPC + Event-driven communication
- **Multi-Tenant Support** - Row-Level Security, tenant isolation
- **Edge Compatibility** - Works on Cloudflare Workers, Deno Deploy, Vercel Edge
- **Provider-based Design** - Pluggable adapters for databases, cache, queues, storage

## Packages

### Core

| Package | Description |
|---------|-------------|
| `@parsrun/core` | Core utilities, logging, error handling |
| `@parsrun/types` | Shared type definitions and validation schemas (ArkType) |
| `@parsrun/server` | Edge-compatible HTTP server built on Hono |

### Service Layer

| Package | Description |
|---------|-------------|
| `@parsrun/service` | Unified service layer - RPC + Events + Tracing |
| `@parsrun/service-adapters` | Pre-built service definitions (Email, Payments) |

### Infrastructure

| Package | Description |
|---------|-------------|
| `@parsrun/database` | Drizzle ORM helpers (Postgres, Neon, D1) |
| `@parsrun/cache` | Caching (Memory, Redis, Upstash, Cloudflare KV) |
| `@parsrun/queue` | Message queues (Memory, Cloudflare Queues, QStash) |
| `@parsrun/storage` | File storage (S3, R2, DO Spaces) |

### Features

| Package | Description |
|---------|-------------|
| `@parsrun/auth` | Passwordless-first authentication |
| `@parsrun/email` | Email sending (Resend, SendGrid, Postmark, SES) |
| `@parsrun/payments` | Payment processing (Stripe, Paddle, iyzico) |
| `@parsrun/realtime` | Realtime (SSE, WebSocket, Durable Objects) |

## Quick Start

```bash
# Install the framework
pnpm add @parsrun/core @parsrun/server @parsrun/service

# Or with specific features
pnpm add @parsrun/auth @parsrun/database @parsrun/cache
```

### Basic Server

```typescript
import { createServer } from "@parsrun/server";
import { createAuth } from "@parsrun/auth";

const server = createServer({
  name: "my-app",
  auth: createAuth({
    secret: process.env.AUTH_SECRET,
    providers: {
      otp: { email: { enabled: true } },
    },
  }),
});

export default server;
```

### Service Definition

```typescript
import { defineService, useService } from "@parsrun/service";

// Define a service
export const paymentsService = defineService({
  name: "payments",
  version: "1.0.0",
  queries: {
    getSubscription: {
      input: { customerId: "string" },
      output: { status: "string", plan: "string" },
    },
  },
  mutations: {
    createCheckout: {
      input: { email: "string", planId: "string" },
      output: { checkoutUrl: "string" },
    },
  },
  events: {
    emits: {
      "subscription.created": { data: { customerId: "string" } },
    },
  },
});

// Use the service
const payments = useService("payments");
const sub = await payments.query("getSubscription", { customerId: "123" });

// Subscribe to events
payments.on("subscription.created", async (event) => {
  console.log("New subscription:", event.data);
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                      │
├─────────────────────────────────────────────────────────┤
│  @parsrun/server     │  @parsrun/auth    │  @parsrun/service     │
├───────────────────┴────────────────┴────────────────────┤
│                    @parsrun/core                            │
├─────────────────────────────────────────────────────────┤
│ @parsrun/database │ @parsrun/cache │ @parsrun/queue │ @parsrun/storage│
├─────────────────────────────────────────────────────────┤
│        Adapters (Postgres, Redis, S3, Cloudflare)       │
└─────────────────────────────────────────────────────────┘
```

## Design Principles

1. **Edge-First** - Every package works on edge runtimes
2. **Passwordless-First** - Password auth is opt-in, not default
3. **Provider-Based** - Swap implementations without code changes
4. **Type-Safe** - Full TypeScript support with strict types
5. **Multi-Tenant** - Built-in support for tenant isolation

## Environment Support

| Runtime | Status |
|---------|--------|
| Node.js 18+ | Full Support |
| Cloudflare Workers | Full Support |
| Deno | Full Support |
| Bun | Full Support |

## Development

```bash
# Clone and install
git clone https://github.com/your-org/pars.git
cd pars
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## License

MIT
