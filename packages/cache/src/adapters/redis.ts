/**
 * @parsrun/cache - Redis Adapter
 * Redis cache adapter using ioredis (Node.js)
 */

import type {
  CacheAdapter,
  CacheGetOptions,
  CacheSetOptions,
  RedisCacheConfig,
} from "../types.js";
import { CacheError, CacheErrorCodes } from "../types.js";

/**
 * Redis client interface (ioredis compatible)
 */
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  ttl(key: string): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  keys(pattern: string): Promise<string[]>;
  flushdb(): Promise<"OK">;
  quit(): Promise<"OK">;
  pipeline(): RedisPipeline;
}

interface RedisPipeline {
  set(key: string, value: string, ...args: (string | number)[]): this;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

/**
 * Redis Cache Adapter
 * Uses ioredis for Node.js environments
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const cache = new RedisCacheAdapter({ client: redis });
 *
 * await cache.set('user:123', { name: 'John' }, { ttl: 3600 });
 * const user = await cache.get('user:123');
 * ```
 */
export class RedisCacheAdapter implements CacheAdapter {
  readonly type = "redis" as const;

  private client: RedisClient;
  private keyPrefix: string;
  private isExternalClient: boolean;

  constructor(config: RedisCacheConfig & { client: RedisClient }) {
    this.client = config.client;
    this.keyPrefix = config.keyPrefix ?? "";
    this.isExternalClient = true;
  }

  private prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  async get<T = unknown>(key: string, _options?: CacheGetOptions): Promise<T | null> {
    try {
      const data = await this.client.get(this.prefixKey(key));

      if (!data) {
        return null;
      }

      const parsed = JSON.parse(data) as { value: T; tags?: string[] };
      return parsed.value;
    } catch (err) {
      throw new CacheError(
        `Redis get failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    try {
      const data = JSON.stringify({
        value,
        tags: options?.tags,
        metadata: options?.metadata,
      });

      const prefixedKey = this.prefixKey(key);

      if (options?.ttl) {
        await this.client.set(prefixedKey, data, "EX", options.ttl);
      } else {
        await this.client.set(prefixedKey, data);
      }

      // Store tag-to-key mappings
      if (options?.tags && options.tags.length > 0) {
        const pipeline = this.client.pipeline();
        for (const tag of options.tags) {
          const tagKey = this.prefixKey(`__tag:${tag}`);
          pipeline.set(tagKey, JSON.stringify([...(await this.getTagKeys(tag)), key]));
        }
        await pipeline.exec();
      }
    } catch (err) {
      throw new CacheError(
        `Redis set failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.prefixKey(key));
    } catch (err) {
      throw new CacheError(
        `Redis delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(this.prefixKey(key));
      return exists > 0;
    } catch (err) {
      throw new CacheError(
        `Redis exists failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async clear(): Promise<void> {
    try {
      if (this.keyPrefix) {
        // Only delete keys with our prefix
        const keys = await this.client.keys(`${this.keyPrefix}:*`);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } else {
        await this.client.flushdb();
      }
    } catch (err) {
      throw new CacheError(
        `Redis clear failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T | null>> {
    try {
      const prefixedKeys = keys.map((k) => this.prefixKey(k));
      const results = await this.client.mget(...prefixedKeys);

      const map = new Map<string, T | null>();
      for (let i = 0; i < keys.length; i++) {
        const data = results[i];
        if (data) {
          const parsed = JSON.parse(data) as { value: T };
          map.set(keys[i] ?? "", parsed.value);
        } else {
          map.set(keys[i] ?? "", null);
        }
      }

      return map;
    } catch (err) {
      throw new CacheError(
        `Redis mget failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async setMany<T = unknown>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void> {
    try {
      const pipeline = this.client.pipeline();

      for (const [key, value] of entries) {
        const data = JSON.stringify({
          value,
          tags: options?.tags,
          metadata: options?.metadata,
        });

        const prefixedKey = this.prefixKey(key);

        if (options?.ttl) {
          pipeline.set(prefixedKey, data, "EX", options.ttl);
        } else {
          pipeline.set(prefixedKey, data);
        }
      }

      await pipeline.exec();
    } catch (err) {
      throw new CacheError(
        `Redis mset failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    try {
      const prefixedKeys = keys.map((k) => this.prefixKey(k));
      await this.client.del(...prefixedKeys);
    } catch (err) {
      throw new CacheError(
        `Redis mdel failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keysToDelete: string[] = [];

      for (const tag of tags) {
        const keys = await this.getTagKeys(tag);
        keysToDelete.push(...keys);
      }

      if (keysToDelete.length > 0) {
        await this.deleteMany(keysToDelete);
      }

      // Clean up tag mappings
      const tagKeys = tags.map((tag) => this.prefixKey(`__tag:${tag}`));
      await this.client.del(...tagKeys);
    } catch (err) {
      throw new CacheError(
        `Redis invalidate by tags failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(this.prefixKey(key));
    } catch (err) {
      throw new CacheError(
        `Redis ttl failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async close(): Promise<void> {
    if (!this.isExternalClient) {
      await this.client.quit();
    }
  }

  private async getTagKeys(tag: string): Promise<string[]> {
    const tagKey = this.prefixKey(`__tag:${tag}`);
    const data = await this.client.get(tagKey);
    if (data) {
      return JSON.parse(data) as string[];
    }
    return [];
  }
}

/**
 * Create a Redis cache adapter
 */
export function createRedisCacheAdapter(
  config: RedisCacheConfig & { client: RedisClient }
): RedisCacheAdapter {
  return new RedisCacheAdapter(config);
}
