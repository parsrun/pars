# @parsrun/cache

Edge-compatible caching for Pars with multiple adapter support.

## Features

- **Multi-Adapter**: Memory, Redis, Upstash, Cloudflare KV
- **Edge-Compatible**: Works on all runtimes
- **TTL Support**: Automatic expiration
- **Namespace**: Isolated cache spaces
- **Tags**: Cache invalidation by tags

## Installation

```bash
pnpm add @parsrun/cache
```

## Quick Start

```typescript
import { createCache } from '@parsrun/cache';

const cache = createCache({
  adapter: 'memory', // or 'redis', 'upstash', 'cloudflare-kv'
});

// Set value
await cache.set('key', { data: 'value' }, { ttl: 3600 });

// Get value
const value = await cache.get('key');

// Delete
await cache.delete('key');
```

## API Overview

### Adapters

#### Memory (Development)

```typescript
import { createMemoryCache } from '@parsrun/cache/adapters/memory';

const cache = createMemoryCache({
  maxSize: 1000,
  defaultTTL: 3600,
});
```

#### Redis

```typescript
import { createRedisCache } from '@parsrun/cache/adapters/redis';

const cache = createRedisCache({
  url: 'redis://localhost:6379',
  prefix: 'myapp:',
});
```

#### Upstash (Serverless Redis)

```typescript
import { createUpstashCache } from '@parsrun/cache/adapters/upstash';

const cache = createUpstashCache({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});
```

#### Cloudflare KV

```typescript
import { createCloudflareKVCache } from '@parsrun/cache/adapters/cloudflare-kv';

// In Cloudflare Worker
const cache = createCloudflareKVCache({
  namespace: env.CACHE_KV,
});
```

### Cache Operations

```typescript
// Set with TTL (seconds)
await cache.set('user:1', userData, { ttl: 3600 });

// Set with tags
await cache.set('user:1', userData, {
  ttl: 3600,
  tags: ['users', 'user:1'],
});

// Get
const user = await cache.get<User>('user:1');

// Get or set
const user = await cache.getOrSet('user:1', async () => {
  return await fetchUser(1);
}, { ttl: 3600 });

// Delete
await cache.delete('user:1');

// Delete by tag
await cache.deleteByTag('users');

// Clear all
await cache.clear();
```

### With Namespace

```typescript
const userCache = cache.namespace('users');
await userCache.set('1', userData); // Key: users:1
```

## Exports

```typescript
import { ... } from '@parsrun/cache';                     // Main exports
import { ... } from '@parsrun/cache/adapters/memory';     // Memory adapter
import { ... } from '@parsrun/cache/adapters/redis';      // Redis adapter
import { ... } from '@parsrun/cache/adapters/upstash';    // Upstash adapter
import { ... } from '@parsrun/cache/adapters/cloudflare-kv'; // Cloudflare KV
```

## License

MIT
