/**
 * Deno KV Storage adapter
 * For use in Deno runtime
 */

import type { KVStorage, DenoKVConfig } from './types.js';

/**
 * Deno KV instance type
 */
interface DenoKvInstance {
  get<T = unknown>(key: unknown[]): Promise<{ value: T | null; versionstamp: string | null }>;
  set(key: unknown[], value: unknown, options?: { expireIn?: number }): Promise<{ ok: boolean; versionstamp: string }>;
  delete(key: unknown[]): Promise<void>;
  list<T = unknown>(selector: { prefix: unknown[] }, options?: { limit?: number }): AsyncIterable<{ key: unknown[]; value: T; versionstamp: string }>;
  close(): void;
}

/**
 * Deno KV storage adapter
 */
export class DenoKVStorage implements KVStorage {
  private kv: DenoKvInstance | null = null;
  private readonly path?: string;
  private readonly prefix: string;
  private initPromise: Promise<void> | null = null;

  constructor(path?: string, prefix?: string) {
    this.path = path;
    this.prefix = prefix ?? 'pars';
  }

  private async ensureInit(): Promise<void> {
    if (this.kv) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.init();
    await this.initPromise;
  }

  private async init(): Promise<void> {
    // @ts-expect-error - Deno specific global
    if (typeof Deno === 'undefined' || !Deno.openKv) {
      throw new Error(
        '[Pars Auth] Deno KV storage is only available in Deno runtime'
      );
    }

    // @ts-expect-error - Deno specific API
    this.kv = await Deno.openKv(this.path) as DenoKvInstance;
  }

  private getKey(key: string): unknown[] {
    return [this.prefix, key];
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    await this.ensureInit();
    const kvKey = this.getKey(key);
    const result = await this.kv!.get<T>(kvKey);
    return result.value;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    await this.ensureInit();
    const kvKey = this.getKey(key);

    const options: { expireIn?: number } = {};
    if (ttl) {
      // Deno KV uses milliseconds for expireIn
      options.expireIn = ttl * 1000;
    }

    await this.kv!.set(kvKey, value, options);
  }

  async delete(key: string): Promise<void> {
    await this.ensureInit();
    const kvKey = this.getKey(key);
    await this.kv!.delete(kvKey);
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
    await this.ensureInit();

    const keys: string[] = [];
    const prefix = [this.prefix];

    for await (const entry of this.kv!.list({ prefix })) {
      // Extract key string from Deno KV key array
      const keyParts = entry.key as unknown[];
      if (keyParts.length >= 2) {
        const keyString = String(keyParts[1]);

        // Filter by pattern if provided
        if (pattern) {
          const regex = new RegExp(
            '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
          );
          if (regex.test(keyString)) {
            keys.push(keyString);
          }
        } else {
          keys.push(keyString);
        }
      }
    }

    return keys;
  }

  async clear(): Promise<void> {
    await this.ensureInit();

    const prefix = [this.prefix];
    const keysToDelete: unknown[][] = [];

    for await (const entry of this.kv!.list({ prefix })) {
      keysToDelete.push(entry.key as unknown[]);
    }

    await Promise.all(keysToDelete.map((key) => this.kv!.delete(key)));
  }

  async close(): Promise<void> {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
      this.initPromise = null;
    }
  }
}

/**
 * Create Deno KV storage adapter
 *
 * @example
 * ```ts
 * // Default (uses Deno.openKv())
 * const storage = await createDenoKVStorage();
 *
 * // With custom path
 * const storage = await createDenoKVStorage({
 *   path: './data/auth.db',
 *   prefix: 'auth'
 * });
 *
 * // For Deno Deploy (path is ignored)
 * const storage = await createDenoKVStorage({ prefix: 'auth' });
 * ```
 */
export function createDenoKVStorage(config?: DenoKVConfig): KVStorage {
  return new DenoKVStorage(config?.path, config?.prefix);
}
