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

export type CacheSetOptions = typeof cacheSetOptions.infer;
export type CacheGetResult = typeof cacheGetResult.infer;
export type CacheStats = typeof cacheStats.infer;
export type MemoryCacheConfig = typeof memoryCacheConfig.infer;
export type RedisCacheConfig = typeof redisCacheConfig.infer;
export type UpstashCacheConfig = typeof upstashCacheConfig.infer;
export type CloudflareKvConfig = typeof cloudflareKvConfig.infer;
export type MultiTierCacheConfig = typeof multiTierCacheConfig.infer;
export type CacheConfig = typeof cacheConfig.infer;
