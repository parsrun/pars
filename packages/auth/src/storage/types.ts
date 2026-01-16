/**
 * Multi-runtime KV Storage interface
 * Supports: Memory, Redis, Cloudflare KV, Deno KV
 */

/**
 * Base KV Storage interface that all adapters must implement
 */
export interface KVStorage {
  /**
   * Get a value by key
   * @param key - The key to retrieve
   * @returns The value or null if not found
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Set a value with optional TTL
   * @param key - The key to set
   * @param value - The value to store
   * @param ttl - Time to live in seconds (optional)
   */
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete a key
   * @param key - The key to delete
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a key exists
   * @param key - The key to check
   */
  has(key: string): Promise<boolean>;

  /**
   * Get multiple values by keys
   * @param keys - Array of keys to retrieve
   */
  getMany?<T = unknown>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set multiple values
   * @param entries - Array of [key, value, ttl?] tuples
   */
  setMany?<T = unknown>(
    entries: Array<[key: string, value: T, ttl?: number]>
  ): Promise<void>;

  /**
   * Delete multiple keys
   * @param keys - Array of keys to delete
   */
  deleteMany?(keys: string[]): Promise<void>;

  /**
   * Get all keys matching a pattern (optional)
   * @param pattern - Glob pattern to match
   */
  keys?(pattern?: string): Promise<string[]>;

  /**
   * Clear all keys (optional, mainly for testing)
   */
  clear?(): Promise<void>;

  /**
   * Close the connection (for Redis, etc.)
   */
  close?(): Promise<void>;
}

/**
 * Storage types
 */
export type StorageType =
  | 'memory'
  | 'redis'
  | 'cloudflare-kv'
  | 'deno-kv'
  | 'custom';

/**
 * Redis configuration
 */
export interface RedisConfig {
  /** Redis connection URL (redis://...) */
  url?: string;
  /** Existing Redis client instance */
  client?: unknown;
  /** Key prefix for namespacing */
  prefix?: string;
}

/**
 * Cloudflare KV configuration
 */
export interface CloudflareKVConfig {
  /** KV namespace binding */
  binding: KVNamespace;
  /** Key prefix for namespacing */
  prefix?: string;
}

/**
 * Deno KV configuration
 */
export interface DenoKVConfig {
  /** Path to KV database (optional, uses default if not provided) */
  path?: string;
  /** Key prefix for namespacing */
  prefix?: string;
}

/**
 * Memory storage configuration
 */
export interface MemoryConfig {
  /** Maximum number of entries (default: 10000) */
  maxSize?: number;
  /** Key prefix for namespacing */
  prefix?: string;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  /** Storage type */
  type?: StorageType;
  /** Redis configuration */
  redis?: RedisConfig;
  /** Cloudflare KV configuration */
  cloudflareKv?: CloudflareKVConfig;
  /** Deno KV configuration */
  denoKv?: DenoKVConfig;
  /** Memory configuration */
  memory?: MemoryConfig;
  /** Custom storage adapter */
  custom?: KVStorage;
}

/**
 * Cloudflare KV Namespace type (for type safety)
 */
export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | null>;
  get(key: string, options: { type: 'json' }): Promise<unknown | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number; expiration?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string; expiration?: number; metadata?: unknown }>; list_complete: boolean; cursor?: string }>;
}

/**
 * Deno KV types (for type safety)
 */
export interface DenoKv {
  get<T = unknown>(key: Deno.KvKey): Promise<Deno.KvEntryMaybe<T>>;
  set(key: Deno.KvKey, value: unknown, options?: { expireIn?: number }): Promise<Deno.KvCommitResult>;
  delete(key: Deno.KvKey): Promise<void>;
  list<T = unknown>(selector: Deno.KvListSelector, options?: Deno.KvListOptions): Deno.KvListIterator<T>;
  close(): void;
}

// Deno namespace types (for compatibility)
declare namespace Deno {
  type KvKey = readonly unknown[];
  interface KvEntryMaybe<T> {
    key: KvKey;
    value: T | null;
    versionstamp: string | null;
  }
  interface KvCommitResult {
    ok: true;
    versionstamp: string;
  }
  interface KvListSelector {
    prefix?: KvKey;
    start?: KvKey;
    end?: KvKey;
  }
  interface KvListOptions {
    limit?: number;
    cursor?: string;
    reverse?: boolean;
    consistency?: 'strong' | 'eventual';
  }
  interface KvListIterator<T> extends AsyncIterableIterator<KvEntry<T>> {}
  interface KvEntry<T> {
    key: KvKey;
    value: T;
    versionstamp: string;
  }
}
