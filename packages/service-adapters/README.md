# @parsrun/service-adapters

Service definitions for Pars microservices - type-safe RPC contracts for email and payments.

## Features

- **Type-Safe**: Full TypeScript support for service contracts
- **RPC Ready**: Compatible with @parsrun/service
- **Reusable**: Share definitions between client and server
- **Versioned**: Service versioning support

## Installation

```bash
pnpm add @parsrun/service-adapters
```

## Quick Start

```typescript
import { emailService } from '@parsrun/service-adapters/email';
import { createRpcClient } from '@parsrun/service/rpc';

// Create type-safe client
const email = createRpcClient({
  service: emailService,
  transport: httpTransport,
});

// Call with full type safety
await email.call('send', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'World',
});
```

## API Overview

### Email Service

```typescript
import { emailService, type EmailService } from '@parsrun/service-adapters/email';

// Service definition
emailService.name;      // 'email'
emailService.version;   // '1.0.0'
emailService.queries;   // { getStatus, ... }
emailService.mutations; // { send, sendBatch, ... }
emailService.events;    // { sent, failed, ... }
```

#### Queries

| Method | Input | Output |
|--------|-------|--------|
| `getStatus` | `void` | `{ status, provider }` |
| `getQuota` | `void` | `{ used, limit, resetAt }` |

#### Mutations

| Method | Input | Output |
|--------|-------|--------|
| `send` | `{ to, subject, body, ... }` | `{ messageId, status }` |
| `sendBatch` | `{ messages[] }` | `{ results[] }` |
| `sendTemplate` | `{ to, template, data }` | `{ messageId }` |

#### Events

| Event | Payload |
|-------|---------|
| `email.sent` | `{ messageId, to, subject }` |
| `email.failed` | `{ messageId, error }` |
| `email.bounced` | `{ messageId, reason }` |

### Payments Service

```typescript
import { paymentsService, type PaymentsService } from '@parsrun/service-adapters/payments';

// Service definition
paymentsService.name;      // 'payments'
paymentsService.version;   // '1.0.0'
paymentsService.queries;   // { getSubscription, ... }
paymentsService.mutations; // { createCheckout, ... }
paymentsService.events;    // { subscriptionCreated, ... }
```

#### Queries

| Method | Input | Output |
|--------|-------|--------|
| `getSubscription` | `{ subscriptionId }` | `Subscription` |
| `getCustomer` | `{ customerId }` | `Customer` |
| `listInvoices` | `{ customerId, limit? }` | `Invoice[]` |

#### Mutations

| Method | Input | Output |
|--------|-------|--------|
| `createCheckout` | `{ priceId, customerId, ... }` | `{ sessionId, url }` |
| `cancelSubscription` | `{ subscriptionId }` | `{ success }` |
| `updateSubscription` | `{ subscriptionId, priceId }` | `Subscription` |

#### Events

| Event | Payload |
|-------|---------|
| `subscription.created` | `{ subscriptionId, customerId }` |
| `subscription.cancelled` | `{ subscriptionId, reason }` |
| `payment.succeeded` | `{ paymentId, amount }` |
| `payment.failed` | `{ paymentId, error }` |

### Creating RPC Server

```typescript
import { emailService } from '@parsrun/service-adapters/email';
import { createRpcServer } from '@parsrun/service/rpc';

const server = createRpcServer({
  service: emailService,
  handlers: {
    getStatus: async () => {
      return { status: 'healthy', provider: 'resend' };
    },
    send: async ({ to, subject, body }) => {
      const result = await emailProvider.send({ to, subject, body });
      return { messageId: result.id, status: 'sent' };
    },
  },
});
```

### Creating RPC Client

```typescript
import { emailService } from '@parsrun/service-adapters/email';
import { createRpcClient, HttpTransport } from '@parsrun/service/rpc';

const client = createRpcClient({
  service: emailService,
  transport: new HttpTransport({
    baseUrl: 'https://api.example.com/rpc/email',
  }),
});

// Type-safe calls
const status = await client.query('getStatus');
const result = await client.mutation('send', {
  to: 'user@example.com',
  subject: 'Hello',
  body: 'World',
});
```

## Exports

```typescript
import { ... } from '@parsrun/service-adapters';          // Main exports
import { ... } from '@parsrun/service-adapters/email';    // Email service
import { ... } from '@parsrun/service-adapters/payments'; // Payments service
```

## License

MIT
