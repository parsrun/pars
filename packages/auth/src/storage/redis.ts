/**
 * Redis KV Storage adapter
 * Supports both ioredis and Upstash Redis
 */

import type { KVStorage, RedisConfig } from './types.js';

/**
 * Generic Redis client interface
 * Compatible with both ioredis and Upstash Redis
 */
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  exists(key: string | string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  expire(key: string, seconds: number): Promise<number>;
  quit?(): Promise<unknown>;
  disconnect?(): Promise<void>;
}

/**
 * Redis storage adapter
 */
export class RedisStorage implements KVStorage {
  private client: RedisClient;
  private readonly prefix: string;

  constructor(client: RedisClient, prefix?: string) {
    this.client = client;
    this.prefix = prefix ?? '';
  }

  private getKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const value = await this.client.get(fullKey);

    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      // Return as string if not valid JSON
      return value as unknown as T;
    }
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(value);

    if (ttl) {
      // Use EX for seconds TTL
      await this.client.set(fullKey, serialized, 'EX', ttl);
    } else {
      await this.client.set(fullKey, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    await this.client.del(fullKey);
  }

  async has(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    const exists = await this.client.exists(fullKey);
    return exists > 0;
  }

  async getMany<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    const fullKeys = keys.map((k) => this.getKey(k));
    const values = await this.client.mget(...fullKeys);

    return values.map((value) => {
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    });
  }

  async setMany<T = unknown>(
    entries: Array<[key: string, value: T, ttl?: number]>
  ): Promise<void> {
    // Redis doesn't have native MSET with TTL, so we use individual sets
    await Promise.all(
      entries.map(([key, value, ttl]) => this.set(key, value, ttl))
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const fullKeys = keys.map((k) => this.getKey(k));
    await this.client.del(fullKeys);
  }

  async keys(pattern?: string): Promise<string[]> {
    const searchPattern = pattern
      ? this.getKey(pattern)
      : this.prefix
        ? `${this.prefix}:*`
        : '*';

    const keys = await this.client.keys(searchPattern);
    const prefixLength = this.prefix ? this.prefix.length + 1 : 0;

    return keys.map((k) => (prefixLength ? k.slice(prefixLength) : k));
  }

  async clear(): Promise<void> {
    if (this.prefix) {
      const keys = await this.client.keys(`${this.prefix}:*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } else {
      console.warn(
        '[Pars Auth] Cannot clear Redis storage without prefix. Use Redis FLUSHDB command directly if needed.'
      );
    }
  }

  async close(): Promise<void> {
    if (this.client.quit) {
      await this.client.quit();
    } else if (this.client.disconnect) {
      await this.client.disconnect();
    }
  }
}

/**
 * Create Redis storage from URL
 * Dynamically imports ioredis or @upstash/redis
 */
async function createRedisClientFromUrl(url: string): Promise<RedisClient> {
  // Try ioredis first (Node.js)
  try {
    const { Redis } = await import('ioredis');
    return new Redis(url) as unknown as RedisClient;
  } catch {
    // ioredis not available
  }

  // Try @upstash/redis (Edge/Serverless)
  try {
    const { Redis } = await import('@upstash/redis');
    // Upstash Redis v2+ accepts url and token as separate config
    // Type assertion needed for compatibility with different Upstash versions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new Redis({ url, token: '' } as any);
    return client as unknown as RedisClient;
  } catch {
    // Upstash not available
  }

  throw new Error(
    '[Pars Auth] No Redis client available. Install either "ioredis" or "@upstash/redis"'
  );
}

/**
 * Create Redis storage adapter
 *
 * @example
 * ```ts
 * // With URL (auto-detects client)
 * const storage = await createRedisStorage({ url: 'redis://localhost:6379' });
 *
 * // With existing client
 * import Redis from 'ioredis';
 * const client = new Redis();
 * const storage = await createRedisStorage({ client });
 *
 * // With prefix
 * const storage = await createRedisStorage({
 *   url: 'redis://localhost:6379',
 *   prefix: 'pars:auth'
 * });
 * ```
 */
export async function createRedisStorage(
  config: RedisConfig
): Promise<KVStorage> {
  let client: RedisClient;

  if (config.client) {
    client = config.client as RedisClient;
  } else if (config.url) {
    client = await createRedisClientFromUrl(config.url);
  } else {
    throw new Error(
      '[Pars Auth] Redis storage requires either url or client configuration'
    );
  }

  return new RedisStorage(client, config.prefix);
}
