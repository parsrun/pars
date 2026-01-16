/**
 * @module
 * Edge-compatible caching for Pars.
 *
 * Supports multiple adapters:
 * - Memory (development)
 * - Redis/ioredis (Node.js)
 * - Upstash (Edge)
 * - Cloudflare KV (Workers)
 *
 * @example
 * ```typescript
 * import { createCacheService, createMemoryCacheAdapter } from '@parsrun/cache';
 *
 * const cache = createCacheService({
 *   adapter: createMemoryCacheAdapter(),
 *   defaultTtl: 3600,
 *   keyPrefix: 'myapp',
 * });
 *
 * await cache.set('user:123', { name: 'John' });
 * const user = await cache.get('user:123');
 * ```
 */

// Re-export types
export * from "./types.js";

// Re-export adapters
export {
  MemoryCacheAdapter,
  createMemoryCacheAdapter,
} from "./adapters/memory.js";

export {
  RedisCacheAdapter,
  createRedisCacheAdapter,
} from "./adapters/redis.js";

export {
  UpstashCacheAdapter,
  createUpstashCacheAdapter,
} from "./adapters/upstash.js";

export {
  CloudflareKVCacheAdapter,
  createCloudflareKVCacheAdapter,
} from "./adapters/cloudflare-kv.js";

import type {
  CacheAdapter,
  CacheGetOptions,
  CacheServiceConfig,
  CacheSetOptions,
} from "./types.js";

/**
 * Cache Service
 * High-level cache service with prefix and default TTL support
 */
export class CacheService {
  private adapter: CacheAdapter;
  private defaultTtl: number | undefined;
  private keyPrefix: string;
  private debug: boolean;

  constructor(config: CacheServiceConfig) {
    this.adapter = config.adapter;
    this.defaultTtl = config.defaultTtl;
    this.keyPrefix = config.keyPrefix ?? "";
    this.debug = config.debug ?? false;
  }

  private prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  /**
   * Get adapter type
   */
  get adapterType(): string {
    return this.adapter.type;
  }

  /**
   * Get a value from cache
   */
  async get<T = unknown>(key: string, options?: CacheGetOptions): Promise<T | null> {
    const prefixedKey = this.prefixKey(key);

    if (this.debug) {
      console.log(`[Cache] GET ${prefixedKey}`);
    }

    return this.adapter.get<T>(prefixedKey, options);
  }

  /**
   * Set a value in cache
   */
  async set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    const ttl = options?.ttl ?? this.defaultTtl;

    if (this.debug) {
      console.log(`[Cache] SET ${prefixedKey} (ttl: ${ttl ?? "none"})`);
    }

    await this.adapter.set(prefixedKey, value, { ...options, ttl });
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    const prefixedKey = this.prefixKey(key);

    if (this.debug) {
      console.log(`[Cache] DELETE ${prefixedKey}`);
    }

    await this.adapter.delete(prefixedKey);
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string): Promise<boolean> {
    return this.adapter.has(this.prefixKey(key));
  }

  /**
   * Clear all entries from cache
   */
  async clear(): Promise<void> {
    if (this.adapter.clear) {
      await this.adapter.clear();
    }
  }

  /**
   * Get multiple values at once
   */
  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T | null>> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));

    if (this.adapter.getMany) {
      const results = await this.adapter.getMany<T>(prefixedKeys);
      // Unprefix keys in result
      const unprefixed = new Map<string, T | null>();
      let i = 0;
      for (const key of keys) {
        const prefixedKey = prefixedKeys[i];
        if (prefixedKey) {
          unprefixed.set(key, results.get(prefixedKey) ?? null);
        }
        i++;
      }
      return unprefixed;
    }

    // Fallback to sequential gets
    const results = new Map<string, T | null>();
    for (const key of keys) {
      results.set(key, await this.get<T>(key));
    }
    return results;
  }

  /**
   * Set multiple values at once
   */
  async setMany<T = unknown>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void> {
    const prefixedEntries = new Map<string, T>();
    for (const [key, value] of entries) {
      prefixedEntries.set(this.prefixKey(key), value);
    }

    const ttl = options?.ttl ?? this.defaultTtl;
    const opts = { ...options, ttl };

    if (this.adapter.setMany) {
      await this.adapter.setMany(prefixedEntries, opts);
      return;
    }

    // Fallback to sequential sets
    for (const [key, value] of entries) {
      await this.set(key, value, opts);
    }
  }

  /**
   * Delete multiple keys
   */
  async deleteMany(keys: string[]): Promise<void> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));

    if (this.adapter.deleteMany) {
      await this.adapter.deleteMany(prefixedKeys);
      return;
    }

    // Fallback to sequential deletes
    for (const key of keys) {
      await this.delete(key);
    }
  }

  /**
   * Invalidate entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    if (this.adapter.invalidateByTags) {
      await this.adapter.invalidateByTags(tags);
    }
  }

  /**
   * Get TTL for a key (in seconds)
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    if (this.adapter.ttl) {
      return this.adapter.ttl(this.prefixKey(key));
    }
    return -1;
  }

  /**
   * Get or set a value with callback
   * @param key Cache key
   * @param fn Function to compute value if not cached
   * @param options Set options (applied if value is computed)
   */
  async getOrSet<T>(
    key: string,
    fn: () => T | Promise<T>,
    options?: CacheSetOptions
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Wrap a function with caching
   */
  wrap<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    keyFn: (...args: TArgs) => string,
    options?: CacheSetOptions
  ): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
      const key = keyFn(...args);
      return this.getOrSet(key, () => fn(...args), options);
    };
  }

  /**
   * Close/cleanup cache resources
   */
  async close(): Promise<void> {
    if (this.adapter.close) {
      await this.adapter.close();
    }
  }
}

/**
 * Create a cache service
 *
 * @example
 * ```typescript
 * // With Memory (development)
 * const cache = createCacheService({
 *   adapter: createMemoryCacheAdapter(),
 *   defaultTtl: 3600,
 * });
 *
 * // With Upstash (Edge)
 * const cache = createCacheService({
 *   adapter: createUpstashCacheAdapter({
 *     url: process.env.UPSTASH_REDIS_REST_URL,
 *     token: process.env.UPSTASH_REDIS_REST_TOKEN,
 *   }),
 *   defaultTtl: 3600,
 * });
 *
 * // With Cloudflare KV (Workers)
 * const cache = createCacheService({
 *   adapter: createCloudflareKVCacheAdapter({
 *     namespace: env.CACHE_KV,
 *   }),
 * });
 * ```
 */
export function createCacheService(config: CacheServiceConfig): CacheService {
  return new CacheService(config);
}

// Default export
export default {
  CacheService,
  createCacheService,
};
