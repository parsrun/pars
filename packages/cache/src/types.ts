/**
 * @parsrun/cache - Type Definitions
 * Cache types and interfaces
 */

// Re-export types from @parsrun/types for convenience
export {
  type,
  cacheSetOptions as parsCacheSetOptions,
  cacheGetResult,
  cacheStats,
  memoryCacheConfig,
  redisCacheConfig,
  upstashCacheConfig,
  cloudflareKvConfig,
  multiTierCacheConfig,
  cacheConfig,
  type CacheSetOptions as ParsCacheSetOptions,
  type CacheGetResult,
  type CacheStats,
  type MemoryCacheConfig as ParsMemoryCacheConfig,
  type RedisCacheConfig as ParsRedisCacheConfig,
  type UpstashCacheConfig as ParsUpstashCacheConfig,
  type CloudflareKvConfig as ParsCloudflareKvConfig,
  type MultiTierCacheConfig,
  type CacheConfig,
} from "@parsrun/types";

/**
 * Cache adapter type
 */
export type CacheAdapterType = "memory" | "redis" | "upstash" | "cloudflare-kv";

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T = unknown> {
  /** Cached value */
  value: T;
  /** Expiration timestamp (ms) */
  expiresAt?: number | undefined;
  /** Original TTL in seconds (for refresh/sliding expiration) */
  ttlSeconds?: number | undefined;
  /** Cache entry tags for invalidation */
  tags?: string[] | undefined;
  /** Cache entry metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Cache get options
 */
export interface CacheGetOptions {
  /** Whether to update TTL on access (sliding expiration) */
  refresh?: boolean | undefined;
}

/**
 * Cache set options
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  ttl?: number | undefined;
  /** Tags for cache invalidation */
  tags?: string[] | undefined;
  /** Additional metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Cache delete options
 */
export interface CacheDeleteOptions {
  /** Delete all entries with matching tags */
  tags?: string[] | undefined;
}

/**
 * Cache adapter interface
 */
export interface CacheAdapter {
  /** Adapter type */
  readonly type: CacheAdapterType;

  /**
   * Get a value from cache
   * @param key Cache key
   * @param options Get options
   * @returns Cached value or null if not found/expired
   */
  get<T = unknown>(key: string, options?: CacheGetOptions): Promise<T | null>;

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param options Set options
   */
  set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void>;

  /**
   * Delete a value from cache
   * @param key Cache key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a key exists in cache
   * @param key Cache key
   */
  has(key: string): Promise<boolean>;

  /**
   * Clear all entries from cache
   */
  clear?(): Promise<void>;

  /**
   * Get multiple values at once
   * @param keys Cache keys
   */
  getMany?<T = unknown>(keys: string[]): Promise<Map<string, T | null>>;

  /**
   * Set multiple values at once
   * @param entries Key-value pairs
   * @param options Set options (applied to all)
   */
  setMany?<T = unknown>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void>;

  /**
   * Delete multiple keys
   * @param keys Cache keys
   */
  deleteMany?(keys: string[]): Promise<void>;

  /**
   * Invalidate entries by tags
   * @param tags Tags to invalidate
   */
  invalidateByTags?(tags: string[]): Promise<void>;

  /**
   * Get TTL for a key (in seconds)
   * @param key Cache key
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  ttl?(key: string): Promise<number>;

  /**
   * Close/cleanup adapter resources
   */
  close?(): Promise<void>;
}

/**
 * Cache service configuration
 */
export interface CacheServiceConfig {
  /** Cache adapter to use */
  adapter: CacheAdapter;
  /** Default TTL in seconds */
  defaultTtl?: number | undefined;
  /** Key prefix for namespacing */
  keyPrefix?: string | undefined;
  /** Enable debug logging */
  debug?: boolean | undefined;
}

/**
 * Memory adapter configuration
 */
export interface MemoryCacheConfig {
  /** Maximum number of entries */
  maxEntries?: number | undefined;
  /** Cleanup interval in ms (default: 60000) */
  cleanupInterval?: number | undefined;
}

/**
 * Redis adapter configuration
 */
export interface RedisCacheConfig {
  /** Redis connection URL */
  url?: string | undefined;
  /** Redis host */
  host?: string | undefined;
  /** Redis port */
  port?: number | undefined;
  /** Redis password */
  password?: string | undefined;
  /** Redis database number */
  db?: number | undefined;
  /** Key prefix */
  keyPrefix?: string | undefined;
  /** Use TLS */
  tls?: boolean | undefined;
}

/**
 * Upstash adapter configuration
 */
export interface UpstashCacheConfig {
  /** Upstash Redis URL */
  url: string;
  /** Upstash Redis token */
  token: string;
  /** Key prefix */
  keyPrefix?: string | undefined;
}

/**
 * Cloudflare KV adapter configuration
 */
export interface CloudflareKVCacheConfig {
  /** KV namespace binding */
  namespace: KVNamespace;
  /** Key prefix */
  keyPrefix?: string | undefined;
}

/**
 * KVNamespace interface (Cloudflare Workers)
 */
export interface KVNamespace {
  get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<string | null>;
  get(key: string, options: { type: "json" }): Promise<unknown>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string | undefined; limit?: number | undefined; cursor?: string | undefined }): Promise<{ keys: Array<{ name: string; expiration?: number; metadata?: unknown }>; list_complete: boolean; cursor?: string }>;
  getWithMetadata<T = unknown>(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<{ value: string | null; metadata: T | null }>;
}

/**
 * Cache error
 */
export class CacheError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CacheError";
  }
}

/**
 * Common cache error codes
 */
export const CacheErrorCodes = {
  CONNECTION_FAILED: "CONNECTION_FAILED",
  OPERATION_FAILED: "OPERATION_FAILED",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
  INVALID_CONFIG: "INVALID_CONFIG",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
} as const;
