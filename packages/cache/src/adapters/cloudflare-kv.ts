/**
 * @parsrun/cache - Cloudflare KV Adapter
 * Cache adapter for Cloudflare Workers KV
 */

import type {
  CacheAdapter,
  CacheGetOptions,
  CacheSetOptions,
  CloudflareKVCacheConfig,
  KVNamespace,
} from "../types.js";
import { CacheError, CacheErrorCodes } from "../types.js";

/**
 * Cloudflare KV Cache Adapter
 * Uses Cloudflare Workers KV for edge caching
 *
 * @example
 * ```typescript
 * // In Cloudflare Workers
 * export default {
 *   async fetch(request, env) {
 *     const cache = new CloudflareKVCacheAdapter({
 *       namespace: env.CACHE_KV,
 *     });
 *
 *     await cache.set('user:123', { name: 'John' }, { ttl: 3600 });
 *     const user = await cache.get('user:123');
 *   }
 * }
 * ```
 */
export class CloudflareKVCacheAdapter implements CacheAdapter {
  readonly type = "cloudflare-kv" as const;

  private kv: KVNamespace;
  private keyPrefix: string;

  constructor(config: CloudflareKVCacheConfig) {
    this.kv = config.namespace;
    this.keyPrefix = config.keyPrefix ?? "";
  }

  private prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  async get<T = unknown>(key: string, _options?: CacheGetOptions): Promise<T | null> {
    try {
      const data = await this.kv.get(this.prefixKey(key), { type: "json" }) as { value: T; tags?: string[] } | null;

      if (!data) {
        return null;
      }

      return data.value;
    } catch (err) {
      throw new CacheError(
        `Cloudflare KV get failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    try {
      const data = {
        value,
        tags: options?.tags,
        metadata: options?.metadata,
      };

      const putOptions: { expirationTtl?: number; metadata?: unknown } = {};

      if (options?.ttl) {
        putOptions.expirationTtl = options.ttl;
      }

      // Store metadata in KV metadata field
      if (options?.tags || options?.metadata) {
        putOptions.metadata = {
          tags: options.tags,
          ...options.metadata,
        };
      }

      await this.kv.put(this.prefixKey(key), JSON.stringify(data), putOptions);

      // Store tag-to-key mappings
      if (options?.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          const tagKey = this.prefixKey(`__tag:${tag}`);
          const existing = await this.kv.get(tagKey, { type: "json" }) as string[] | null;
          const keys = existing ? [...new Set([...existing, key])] : [key];
          await this.kv.put(tagKey, JSON.stringify(keys));
        }
      }
    } catch (err) {
      throw new CacheError(
        `Cloudflare KV set failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(this.prefixKey(key));
    } catch (err) {
      throw new CacheError(
        `Cloudflare KV delete failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const value = await this.kv.get(this.prefixKey(key));
      return value !== null;
    } catch (err) {
      throw new CacheError(
        `Cloudflare KV has failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async clear(): Promise<void> {
    try {
      const prefix = this.keyPrefix ? `${this.keyPrefix}:` : "";
      let cursor: string | undefined;

      do {
        const result = await this.kv.list({
          prefix,
          limit: 1000,
          cursor,
        });

        for (const key of result.keys) {
          await this.kv.delete(key.name);
        }

        cursor = result.list_complete ? undefined : result.cursor;
      } while (cursor);
    } catch (err) {
      throw new CacheError(
        `Cloudflare KV clear failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T | null>> {
    const map = new Map<string, T | null>();

    // KV doesn't support batch get, so we do parallel fetches
    const promises = keys.map(async (key) => {
      const value = await this.get<T>(key);
      return { key, value };
    });

    const results = await Promise.all(promises);

    for (const { key, value } of results) {
      map.set(key, value);
    }

    return map;
  }

  async setMany<T = unknown>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void> {
    // KV doesn't support batch write, so we do parallel writes
    const promises: Promise<void>[] = [];

    for (const [key, value] of entries) {
      promises.push(this.set(key, value, options));
    }

    await Promise.all(promises);
  }

  async deleteMany(keys: string[]): Promise<void> {
    // KV doesn't support batch delete, so we do parallel deletes
    const promises = keys.map((key) => this.delete(key));
    await Promise.all(promises);
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keysToDelete = new Set<string>();

      for (const tag of tags) {
        const tagKey = this.prefixKey(`__tag:${tag}`);
        const keys = await this.kv.get(tagKey, { type: "json" }) as string[] | null;

        if (keys) {
          for (const key of keys) {
            keysToDelete.add(key);
          }
          // Delete tag mapping
          await this.kv.delete(tagKey);
        }
      }

      if (keysToDelete.size > 0) {
        await this.deleteMany([...keysToDelete]);
      }
    } catch (err) {
      throw new CacheError(
        `Cloudflare KV invalidate by tags failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async ttl(_key: string): Promise<number> {
    // Cloudflare KV doesn't expose TTL, return -1 (unknown)
    return -1;
  }

  async close(): Promise<void> {
    // No-op for KV
  }
}

/**
 * Create a Cloudflare KV cache adapter
 */
export function createCloudflareKVCacheAdapter(config: CloudflareKVCacheConfig): CloudflareKVCacheAdapter {
  return new CloudflareKVCacheAdapter(config);
}
