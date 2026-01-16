# @parsrun/database

Database utilities for Pars with Drizzle ORM helpers and multi-runtime support.

## Features

- **Drizzle ORM**: Type-safe database operations
- **Multi-Adapter**: PostgreSQL, Neon, Cloudflare D1
- **Edge-Compatible**: Works on Cloudflare Workers, Deno
- **Migrations**: Schema migration utilities

## Installation

```bash
pnpm add @parsrun/database drizzle-orm
```

## Quick Start

```typescript
import { createDatabase } from '@parsrun/database';

const db = createDatabase({
  adapter: 'postgres',
  connectionString: process.env.DATABASE_URL,
});
```

## API Overview

### Adapters

#### PostgreSQL

```typescript
import { createPostgresAdapter } from '@parsrun/database/adapters/postgres';

const db = createPostgresAdapter({
  connectionString: 'postgres://...',
});
```

#### Neon (Serverless PostgreSQL)

```typescript
import { createNeonAdapter } from '@parsrun/database/adapters/neon';

const db = createNeonAdapter({
  connectionString: process.env.DATABASE_URL,
});
```

#### Cloudflare D1

```typescript
import { createD1Adapter } from '@parsrun/database/adapters/d1';

// In Cloudflare Worker
const db = createD1Adapter({
  database: env.DB,
});
```

### Database Operations

```typescript
import { users } from './schema';

// Insert
await db.insert(users).values({ name: 'John' });

// Select
const allUsers = await db.select().from(users);

// Update
await db.update(users).set({ name: 'Jane' }).where(eq(users.id, 1));

// Delete
await db.delete(users).where(eq(users.id, 1));
```

### With Multi-Tenancy

```typescript
import { withTenant } from '@parsrun/database';

// Automatically filter by tenant
const tenantDb = withTenant(db, tenantId);
const users = await tenantDb.select().from(users);
```

## Exports

```typescript
import { ... } from '@parsrun/database';                  // Main exports
import { ... } from '@parsrun/database/adapters/postgres'; // PostgreSQL
import { ... } from '@parsrun/database/adapters/neon';     // Neon
import { ... } from '@parsrun/database/adapters/d1';       // Cloudflare D1
```

## License

MIT
