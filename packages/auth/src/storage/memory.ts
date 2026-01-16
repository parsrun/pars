/**
 * In-memory KV Storage adapter
 * Suitable for development, testing, and single-instance deployments
 */

import type { KVStorage, MemoryConfig } from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

/**
 * In-memory storage with TTL support and LRU eviction
 */
export class MemoryStorage implements KVStorage {
  private cache: Map<string, CacheEntry<unknown>>;
  private readonly maxSize: number;
  private readonly prefix: string;

  constructor(config?: MemoryConfig) {
    this.cache = new Map();
    this.maxSize = config?.maxSize ?? 10000;
    this.prefix = config?.prefix ?? '';
  }

  private getKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    if (entry.expiresAt === null) return false;
    return Date.now() > entry.expiresAt;
  }

  private cleanup(): void {
    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  private evictOldest(): void {
    // Simple FIFO eviction (Map maintains insertion order)
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const entry = this.cache.get(fullKey) as CacheEntry<T> | undefined;

    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.cache.delete(fullKey);
      return null;
    }

    return entry.value;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);

    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(fullKey)) {
      this.cleanup();
      if (this.cache.size >= this.maxSize) {
        this.evictOldest();
      }
    }

    const expiresAt = ttl ? Date.now() + ttl * 1000 : null;

    this.cache.set(fullKey, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    this.cache.delete(fullKey);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async getMany<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map((key) => this.get<T>(key)));
  }

  async setMany<T = unknown>(
    entries: Array<[key: string, value: T, ttl?: number]>
  ): Promise<void> {
    await Promise.all(
      entries.map(([key, value, ttl]) => this.set(key, value, ttl))
    );
  }

  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  async keys(pattern?: string): Promise<string[]> {
    this.cleanup();

    const allKeys: string[] = [];
    const prefixLength = this.prefix ? this.prefix.length + 1 : 0;

    for (const key of this.cache.keys()) {
      const unprefixedKey = prefixLength ? key.slice(prefixLength) : key;

      if (!pattern || this.matchPattern(unprefixedKey, pattern)) {
        allKeys.push(unprefixedKey);
      }
    }

    return allKeys;
  }

  private matchPattern(key: string, pattern: string): boolean {
    // Simple glob pattern matching (* = any characters)
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(key);
  }

  async clear(): Promise<void> {
    if (this.prefix) {
      // Only clear keys with our prefix
      for (const key of this.cache.keys()) {
        if (key.startsWith(this.prefix + ':')) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  async close(): Promise<void> {
    // No-op for memory storage
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Create a new memory storage instance
 */
export function createMemoryStorage(config?: MemoryConfig): KVStorage {
  return new MemoryStorage(config);
}
