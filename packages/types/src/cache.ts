/**
 * @module
 * Caching validation schemas for key-value storage.
 * Supports memory, Redis, Upstash, and Cloudflare KV.
 *
 * @example
 * ```typescript
 * import { cacheSetOptions, cacheConfig, type CacheConfig } from '@parsrun/types';
 *
 * const config: CacheConfig = {
 *   provider: 'redis',
 *   ttl: 3600,
 *   redis: { host: 'localhost', port: 6379 }
 * };
 * ```
 */

import { type } from "arktype";

// ============================================================================
// Cache Operation Schemas
// ============================================================================

/** Cache set options */
export const cacheSetOptions = type({
  "ttl?": "number > 0",
  "tags?": "string[]",
  "metadata?": "object",
});

/** Cache get result */
export const cacheGetResult = type({
  value: "unknown",
  "ttl?": "number",
  "createdAt?": "number",
  "tags?": "string[]",
});

/** Cache stats */
export const cacheStats = type({
  hits: "number >= 0",
  misses: "number >= 0",
  keys: "number >= 0",
  "memory?": "number >= 0",
});

// ============================================================================
// Cache Config Schemas
// ============================================================================

/** Memory cache config */
export const memoryCacheConfig = type({
  "maxSize?": "number > 0",
  "ttl?": "number > 0",
  "checkInterval?": "number > 0",
  "stale?": "boolean",
});

/** Redis cache config */
export const redisCacheConfig = type({
  "host?": "string",
  "port?": "number > 0",
  "password?": "string",
  "db?": "number >= 0",
  "url?": "string",
  "tls?": "boolean | object",
  "keyPrefix?": "string",
  "ttl?": "number > 0",
});

/** Upstash cache config */
export const upstashCacheConfig = type({
  url: "string >= 1",
  token: "string >= 1",
  "keyPrefix?": "string",
  "ttl?": "number > 0",
});

/** Cloudflare KV config */
export const cloudflareKvConfig = type({
  namespaceId: "string >= 1",
  "accountId?": "string",
  "apiToken?": "string",
  "keyPrefix?": "string",
});

/** Multi-tier cache config */
export const multiTierCacheConfig = type({
  tiers: type({
    type: "'memory' | 'redis' | 'upstash' | 'cloudflare-kv'",
    "priority?": "number",
    "ttl?": "number > 0",
    "config?": "object",
  }).array(),
  "writeThrough?": "boolean",
  "readThrough?": "boolean",
});

/** Cache config */
export const cacheConfig = type({
  provider: "'memory' | 'redis' | 'upstash' | 'cloudflare-kv' | 'multi-tier'",
  "ttl?": "number > 0",
  "keyPrefix?": "string",
  "memory?": memoryCacheConfig,
  "redis?": redisCacheConfig,
  "upstash?": upstashCacheConfig,
  "cloudflareKv?": cloudflareKvConfig,
  "multiTier?": multiTierCacheConfig,
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Cache set options type.
 * Contains optional TTL, tags for invalidation, and metadata.
 */
export type CacheSetOptions = typeof cacheSetOptions.infer;

/**
 * Cache get result type.
 * Contains the cached value, remaining TTL, creation time, and tags.
 */
export type CacheGetResult = typeof cacheGetResult.infer;

/**
 * Cache stats type.
 * Contains hit/miss counts, total keys, and optional memory usage.
 */
export type CacheStats = typeof cacheStats.infer;

/**
 * Memory cache configuration type.
 * Contains max size, default TTL, cleanup interval, and stale serving options.
 */
export type MemoryCacheConfig = typeof memoryCacheConfig.infer;

/**
 * Redis cache configuration type.
 * Contains Redis connection settings, key prefix, and default TTL.
 */
export type RedisCacheConfig = typeof redisCacheConfig.infer;

/**
 * Upstash cache configuration type.
 * Contains Upstash URL, token, key prefix, and default TTL.
 */
export type UpstashCacheConfig = typeof upstashCacheConfig.infer;

/**
 * Cloudflare KV configuration type.
 * Contains namespace ID, account credentials, and key prefix.
 */
export type CloudflareKvConfig = typeof cloudflareKvConfig.infer;

/**
 * Multi-tier cache configuration type.
 * Contains array of cache tiers with priorities and write-through/read-through settings.
 */
export type MultiTierCacheConfig = typeof multiTierCacheConfig.infer;

/**
 * Cache configuration type.
 * Contains provider selection and provider-specific configuration.
 */
export type CacheConfig = typeof cacheConfig.infer;
