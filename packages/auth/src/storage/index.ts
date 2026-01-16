/**
 * Multi-runtime Storage Factory
 * Auto-detects runtime and creates appropriate storage adapter
 */

import { detectRuntime, type Runtime } from '../utils/runtime.js';
import type { KVStorage, StorageConfig, StorageType } from './types.js';
import { createMemoryStorage } from './memory.js';

// Re-export types
export * from './types.js';
export { MemoryStorage, createMemoryStorage } from './memory.js';

/**
 * Lazy-loaded storage adapters to avoid bundling unused code
 */
const storageLoaders: Record<
  Exclude<StorageType, 'memory' | 'custom'>,
  () => Promise<{ create: (config: StorageConfig) => Promise<KVStorage> }>
> = {
  redis: async () => {
    const { createRedisStorage } = await import('./redis.js');
    return {
      create: (config) => createRedisStorage(config.redis!),
    };
  },
  'cloudflare-kv': async () => {
    const { createCloudflareKVStorage } = await import('./cloudflare-kv.js');
    return {
      create: async (config) => createCloudflareKVStorage(config.cloudflareKv!),
    };
  },
  'deno-kv': async () => {
    const { createDenoKVStorage } = await import('./deno-kv.js');
    return {
      create: async (config) => createDenoKVStorage(config.denoKv),
    };
  },
};

/**
 * Map runtime to default storage type
 */
function getDefaultStorageType(runtime: Runtime): StorageType {
  switch (runtime) {
    case 'cloudflare':
      return 'cloudflare-kv';
    case 'deno':
      return 'deno-kv';
    case 'node':
    case 'bun':
      // Default to memory for Node/Bun, user should configure Redis for production
      return 'memory';
    default:
      return 'memory';
  }
}

/**
 * Create a storage adapter based on configuration
 * Auto-detects runtime if type is not specified
 *
 * @example
 * ```ts
 * // Auto-detect (uses Deno KV on Deno, CF KV on Workers, Memory otherwise)
 * const storage = await createStorage();
 *
 * // Explicit Redis
 * const storage = await createStorage({
 *   type: 'redis',
 *   redis: { url: 'redis://localhost:6379' }
 * });
 *
 * // Cloudflare KV
 * const storage = await createStorage({
 *   type: 'cloudflare-kv',
 *   cloudflareKv: { binding: env.MY_KV }
 * });
 *
 * // Custom adapter
 * const storage = await createStorage({
 *   type: 'custom',
 *   custom: myCustomAdapter
 * });
 * ```
 */
export async function createStorage(config?: StorageConfig): Promise<KVStorage> {
  // Custom adapter takes precedence
  if (config?.custom) {
    return config.custom;
  }

  const runtime = detectRuntime();
  const type = config?.type ?? getDefaultStorageType(runtime);

  // Memory storage (sync)
  if (type === 'memory') {
    return createMemoryStorage(config?.memory);
  }

  // Validate runtime compatibility
  if (type === 'cloudflare-kv' && runtime !== 'cloudflare') {
    console.warn(
      '[Pars Auth] Cloudflare KV storage is only available in Cloudflare Workers. Falling back to memory storage.'
    );
    return createMemoryStorage(config?.memory);
  }

  if (type === 'deno-kv' && runtime !== 'deno') {
    console.warn(
      '[Pars Auth] Deno KV storage is only available in Deno. Falling back to memory storage.'
    );
    return createMemoryStorage(config?.memory);
  }

  // Validate config presence
  if (type === 'redis' && !config?.redis) {
    throw new Error(
      '[Pars Auth] Redis storage requires redis configuration (url or client)'
    );
  }

  if (type === 'cloudflare-kv' && !config?.cloudflareKv?.binding) {
    throw new Error(
      '[Pars Auth] Cloudflare KV storage requires cloudflareKv.binding'
    );
  }

  // Load and create the storage adapter
  const loader = storageLoaders[type as keyof typeof storageLoaders];
  if (!loader) {
    throw new Error(`[Pars Auth] Unknown storage type: ${type}`);
  }

  const { create } = await loader();
  return await create(config!);
}

/**
 * Create storage synchronously (only for memory storage)
 * Use createStorage() for other adapters
 */
export function createStorageSync(config?: StorageConfig): KVStorage {
  if (config?.custom) {
    return config.custom;
  }

  if (config?.type && config.type !== 'memory') {
    throw new Error(
      `[Pars Auth] createStorageSync only supports memory storage. Use createStorage() for ${config.type}`
    );
  }

  return createMemoryStorage(config?.memory);
}

/**
 * Storage key prefixes for different purposes
 */
export const StorageKeys = {
  /** OTP storage prefix */
  otp: (identifier: string, type: string) => `otp:${type}:${identifier}`,
  /** Rate limit storage prefix */
  rateLimit: (key: string) => `rate:${key}`,
  /** Session blocklist prefix */
  blocklist: (tokenId: string) => `block:${tokenId}`,
  /** Magic link token prefix */
  magicLink: (token: string) => `magic:${token}`,
  /** CSRF token prefix */
  csrf: (sessionId: string) => `csrf:${sessionId}`,
} as const;
