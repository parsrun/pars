/**
 * Cloudflare KV Storage adapter
 * For use in Cloudflare Workers
 */

import type { KVStorage, CloudflareKVConfig, KVNamespace } from './types.js';

/**
 * Cloudflare KV storage adapter
 */
export class CloudflareKVStorage implements KVStorage {
  private kv: KVNamespace;
  private readonly prefix: string;

  constructor(binding: KVNamespace, prefix?: string) {
    this.kv = binding;
    this.prefix = prefix ?? '';
  }

  private getKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    const value = await this.kv.get(fullKey, { type: 'json' });
    return value as T | null;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(value);

    const options: { expirationTtl?: number } = {};
    if (ttl) {
      // Cloudflare KV minimum TTL is 60 seconds
      options.expirationTtl = Math.max(60, ttl);
    }

    await this.kv.put(fullKey, serialized, options);
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    await this.kv.delete(fullKey);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async getMany<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    // Cloudflare KV doesn't have native batch get, use Promise.all
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
    const listOptions: { prefix?: string; limit?: number } = {
      limit: 1000,
    };

    if (pattern) {
      // Simple prefix-based filtering
      // KV list only supports prefix, not glob patterns
      const prefixPattern = pattern.replace(/\*.*$/, '');
      listOptions.prefix = this.prefix
        ? `${this.prefix}:${prefixPattern}`
        : prefixPattern;
    } else if (this.prefix) {
      listOptions.prefix = `${this.prefix}:`;
    }

    const result = await this.kv.list(listOptions);
    const prefixLength = this.prefix ? this.prefix.length + 1 : 0;

    const keys: string[] = [];
    for (const key of result.keys) {
      const unprefixedKey = prefixLength ? key.name.slice(prefixLength) : key.name;

      // If pattern has glob, filter manually
      if (pattern && pattern.includes('*')) {
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        if (regex.test(unprefixedKey)) {
          keys.push(unprefixedKey);
        }
      } else {
        keys.push(unprefixedKey);
      }
    }

    return keys;
  }

  async clear(): Promise<void> {
    if (!this.prefix) {
      console.warn(
        '[Pars Auth] Cannot clear Cloudflare KV storage without prefix. This would delete all keys.'
      );
      return;
    }

    // List and delete all keys with prefix
    let cursor: string | undefined;
    do {
      const result = await this.kv.list({
        prefix: `${this.prefix}:`,
        limit: 1000,
        cursor,
      });

      await Promise.all(result.keys.map((key) => this.kv.delete(key.name)));

      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);
  }

  async close(): Promise<void> {
    // No-op for Cloudflare KV
  }
}

/**
 * Create Cloudflare KV storage adapter
 *
 * @example
 * ```ts
 * // In Cloudflare Worker
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const storage = createCloudflareKVStorage({
 *       binding: env.AUTH_KV,
 *       prefix: 'auth'
 *     });
 *
 *     // Use storage...
 *   }
 * }
 * ```
 */
export function createCloudflareKVStorage(
  config: CloudflareKVConfig
): KVStorage {
  if (!config.binding) {
    throw new Error(
      '[Pars Auth] Cloudflare KV storage requires a KV namespace binding'
    );
  }

  return new CloudflareKVStorage(config.binding, config.prefix);
}
