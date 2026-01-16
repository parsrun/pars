# Pars Basic Service Example

Bu örnek, Pars framework'ünün temel özelliklerini gösterir:

- ✅ Service definition (queries, mutations, events)
- ✅ RPC server ve client iletişimi
- ✅ Event-driven architecture
- ✅ Cross-service event handling
- ✅ HTTP server (Hono)

## Kurulum

```bash
cd examples/basic-service
pnpm install
```

## Çalıştırma

```bash
# Development (tsx ile hot reload)
pnpm dev

# Production
pnpm build
pnpm start
```

## Proje Yapısı

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

## Ne Yapar?

1. **Users Service**: Kullanıcı CRUD işlemleri
   - `getUser` - Kullanıcı getir
   - `listUsers` - Kullanıcıları listele
   - `createUser` - Yeni kullanıcı oluştur
   - `updateUser` - Kullanıcı güncelle
   - `deleteUser` - Kullanıcı sil

2. **Email Service**: E-posta gönderimi
   - `getStatus` - Servis durumu
   - `sendWelcome` - Hoşgeldin e-postası
   - `send` - Genel e-posta

3. **Event Flow**:
   ```
   createUser() → user.created event → sendWelcome() → email.sent event
   ```

## API Kullanımı

### RPC İsteği

```bash
# Kullanıcı oluştur
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

# Kullanıcı getir
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

# Kullanıcıları listele
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

## Öğrenme Noktaları

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

## Sonraki Adımlar

- HTTP transport ile uzak servis çağrısı
- Circuit breaker ve retry pattern'leri
- Distributed tracing
- Cloudflare Workers deployment
