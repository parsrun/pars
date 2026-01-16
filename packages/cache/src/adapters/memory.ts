/**
 * @parsrun/cache - Memory Adapter
 * In-memory cache adapter for development and testing
 */

import type {
  CacheAdapter,
  CacheEntry,
  CacheGetOptions,
  CacheSetOptions,
  MemoryCacheConfig,
} from "../types.js";

/**
 * Memory Cache Adapter
 * Uses in-memory storage with automatic expiration cleanup
 *
 * @example
 * ```typescript
 * const cache = new MemoryCacheAdapter({
 *   maxEntries: 1000,
 *   cleanupInterval: 60000,
 * });
 *
 * await cache.set('user:123', { name: 'John' }, { ttl: 3600 });
 * const user = await cache.get('user:123');
 * ```
 */
export class MemoryCacheAdapter implements CacheAdapter {
  readonly type = "memory" as const;

  private cache = new Map<string, CacheEntry>();
  private tagIndex = new Map<string, Set<string>>();
  private maxEntries: number;
  private cleanupInterval: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: MemoryCacheConfig) {
    this.maxEntries = config?.maxEntries ?? 10000;
    this.cleanupInterval = config?.cleanupInterval ?? 60000;

    // Start cleanup timer
    if (this.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupInterval);
    }
  }

  async get<T = unknown>(key: string, options?: CacheGetOptions): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromTagIndex(key, entry.tags);
      return null;
    }

    // Refresh TTL if requested (sliding expiration)
    if (options?.refresh && entry.expiresAt && entry.ttlSeconds) {
      entry.expiresAt = Date.now() + entry.ttlSeconds * 1000;
    }

    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    // Enforce max entries (LRU-like: remove oldest)
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const oldEntry = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        if (oldEntry?.tags) {
          this.removeFromTagIndex(oldestKey, oldEntry.tags);
        }
      }
    }

    const entry: CacheEntry<T> = {
      value,
      metadata: options?.metadata,
    };

    if (options?.ttl) {
      entry.expiresAt = Date.now() + options.ttl * 1000;
      entry.ttlSeconds = options.ttl;
    }

    if (options?.tags && options.tags.length > 0) {
      entry.tags = options.tags;
      this.addToTagIndex(key, options.tags);
    }

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry?.tags) {
      this.removeFromTagIndex(key, entry.tags);
    }
    this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromTagIndex(key, entry.tags);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.tagIndex.clear();
  }

  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();

    for (const key of keys) {
      result.set(key, await this.get<T>(key));
    }

    return result;
  }

  async setMany<T = unknown>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void> {
    for (const [key, value] of entries) {
      await this.set(key, value, options);
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.delete(key);
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    const keysToDelete = new Set<string>();

    for (const tag of tags) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        for (const key of keys) {
          keysToDelete.add(key);
        }
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }
  }

  async ttl(key: string): Promise<number> {
    const entry = this.cache.get(key);

    if (!entry) {
      return -2; // Key doesn't exist
    }

    if (!entry.expiresAt) {
      return -1; // No expiration
    }

    const remaining = entry.expiresAt - Date.now();
    if (remaining <= 0) {
      return -2; // Expired
    }

    return Math.ceil(remaining / 1000);
  }

  async close(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await this.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxEntries: number } {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
    };
  }

  private addToTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      let keys = this.tagIndex.get(tag);
      if (!keys) {
        keys = new Set();
        this.tagIndex.set(tag, keys);
      }
      keys.add(key);
    }
  }

  private removeFromTagIndex(key: string, tags?: string[]): void {
    if (!tags) return;

    for (const tag of tags) {
      const keys = this.tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.removeFromTagIndex(key, entry.tags);
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Create a memory cache adapter
 */
export function createMemoryCacheAdapter(config?: MemoryCacheConfig): MemoryCacheAdapter {
  return new MemoryCacheAdapter(config);
}
