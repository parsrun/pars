# Pars Basic Service Example

This example demonstrates the core features of the Pars framework:

- ✅ Service definition (queries, mutations, events)
- ✅ RPC server and client communication
- ✅ Event-driven architecture
- ✅ Cross-service event handling
- ✅ HTTP server (Hono)

## Installation

```bash
cd examples/basic-service
pnpm install
```

## Running

```bash
# Development (hot reload with tsx)
pnpm dev

# Production
pnpm build
pnpm start
```

## Project Structure

```
src/
├── index.ts                    # Entry point, HTTP server
└── services/
    ├── users/
    │   ├── definition.ts       # Service contract
    │   └── handlers.ts         # Business logic
    └── email/
        ├── definition.ts
        └── handlers.ts
```

## What Does It Do?

1. **Users Service**: User CRUD operations
   - `getUser` - Get a user
   - `listUsers` - List users
   - `createUser` - Create a new user
   - `updateUser` - Update a user
   - `deleteUser` - Delete a user

2. **Email Service**: Email sending
   - `getStatus` - Service status
   - `sendWelcome` - Welcome email
   - `send` - General email

3. **Event Flow**:
   ```
   createUser() → user.created event → sendWelcome() → email.sent event
   ```

## API Usage

### RPC Request

```bash
# Create user
curl -X POST http://localhost:3000/rpc/users \
  -H "Content-Type: application/json" \
  -d '{
    "id": "req-1",
    "service": "users",
    "method": "createUser",
    "type": "mutation",
    "input": {
      "email": "test@example.com",
      "name": "Test User"
    }
  }'

# Get user
curl -X POST http://localhost:3000/rpc/users \
  -H "Content-Type: application/json" \
  -d '{
    "id": "req-2",
    "service": "users",
    "method": "getUser",
    "type": "query",
    "input": {
      "userId": "USER_ID_HERE"
    }
  }'

# List users
curl -X POST http://localhost:3000/rpc/users \
  -H "Content-Type: application/json" \
  -d '{
    "id": "req-3",
    "service": "users",
    "method": "listUsers",
    "type": "query",
    "input": {
      "limit": 10
    }
  }'
```

## Learning Points

### 1. Service Definition

```typescript
export const usersService = defineService({
  name: "users",
  version: "1.0.0",
  queries: { /* read operations */ },
  mutations: { /* write operations */ },
  events: {
    emits: { /* events this service emits */ }
  }
});
```

### 2. RPC Handler

```typescript
const server = createRpcServer({
  service: "users",
  handlers: {
    createUser: async ({ email, name }, ctx) => {
      // Business logic
      await emitter.emit("user.created", { ... });
      return { id };
    }
  }
});
```

### 3. Event Subscription

```typescript
eventTransport.subscribe("user.created", async (event, ctx) => {
  // Handle event
  await emailClient.call("sendWelcome", event.data);
});
```

### 4. RPC Client

```typescript
const client = createRpcClient({
  service: "users",
  transport: new EmbeddedTransport(server),
});

const user = await client.call("getUser", { userId: "123" });
```

## Next Steps

- Remote service calls with HTTP transport
- Circuit breaker and retry patterns
- Distributed tracing
- Cloudflare Workers deployment
