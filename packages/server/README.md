# @parsrun/server

Edge-compatible, multi-tenant server framework for Pars built on Hono.

## Features

- **Edge-First**: Cloudflare Workers, Deno Deploy, Vercel Edge
- **Multi-Tenant**: RLS (Row-Level Security), tenant context
- **RBAC**: Role-based access control
- **Modular**: Dynamic module loading
- **Health Checks**: Kubernetes-ready health endpoints

## Installation

```bash
pnpm add @parsrun/server hono
```

## Quick Start

```typescript
import { createApp, createContext } from '@parsrun/server';

const app = createApp({
  name: 'my-api',
  version: '1.0.0',
});

app.get('/', (c) => c.json({ status: 'ok' }));

export default app;
```

## API Overview

### App Creation

```typescript
import { createApp } from '@parsrun/server';

const app = createApp({
  name: 'my-api',
  version: '1.0.0',
  cors: true,
  logging: true,
});
```

### Context & Middleware

```typescript
import { createContext, withTenant } from '@parsrun/server/context';

// Tenant-aware context
app.use(withTenant());

app.get('/data', (c) => {
  const tenantId = c.get('tenantId');
  // ...
});
```

### Row-Level Security (RLS)

```typescript
import { createRLS } from '@parsrun/server/rls';

const rls = createRLS({
  tenantColumn: 'tenant_id',
  userColumn: 'user_id',
});

// Apply RLS to queries
const query = rls.apply(baseQuery, context);
```

### RBAC

```typescript
import { createRBAC, requireRole, requirePermission } from '@parsrun/server/rbac';

const rbac = createRBAC({
  roles: {
    admin: ['users:*', 'settings:*'],
    member: ['users:read', 'content:*'],
  },
});

app.get('/admin', requireRole('admin'), handler);
app.delete('/users/:id', requirePermission('users:delete'), handler);
```

### Health Checks

```typescript
import { createHealthRoutes } from '@parsrun/server/health';

app.route('/health', createHealthRoutes({
  checks: {
    database: async () => ({ status: 'ok' }),
    cache: async () => ({ status: 'ok' }),
  },
}));
```

### Module Loader

```typescript
import { createModuleLoader } from '@parsrun/server/module-loader';

const loader = createModuleLoader({
  modulesDir: './modules',
  autoload: true,
});

await loader.loadModules(app);
```

### Validation

```typescript
import { validate, schemas } from '@parsrun/server/validation';

app.post('/users', validate(schemas.createUser), handler);
```

## Exports

```typescript
import { ... } from '@parsrun/server';            // Main exports
import { ... } from '@parsrun/server/app';        // App creation
import { ... } from '@parsrun/server/context';    // Context utilities
import { ... } from '@parsrun/server/rls';        // Row-level security
import { ... } from '@parsrun/server/rbac';       // Role-based access
import { ... } from '@parsrun/server/health';     // Health checks
import { ... } from '@parsrun/server/middleware'; // Middleware
import { ... } from '@parsrun/server/validation'; // Validation
```

## License

MIT
