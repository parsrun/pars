/**
 * @parsrun/cache - Upstash Adapter
 * Edge-compatible Upstash Redis adapter using fetch API
 */

import type {
  CacheAdapter,
  CacheGetOptions,
  CacheSetOptions,
  UpstashCacheConfig,
} from "../types.js";
import { CacheError, CacheErrorCodes } from "../types.js";

/**
 * Upstash Cache Adapter
 * Edge-compatible using HTTP API
 *
 * @example
 * ```typescript
 * const cache = new UpstashCacheAdapter({
 *   url: process.env.UPSTASH_REDIS_REST_URL,
 *   token: process.env.UPSTASH_REDIS_REST_TOKEN,
 * });
 *
 * await cache.set('user:123', { name: 'John' }, { ttl: 3600 });
 * const user = await cache.get('user:123');
 * ```
 */
export class UpstashCacheAdapter implements CacheAdapter {
  readonly type = "upstash" as const;

  private url: string;
  private token: string;
  private keyPrefix: string;

  constructor(config: UpstashCacheConfig) {
    this.url = config.url.replace(/\/$/, ""); // Remove trailing slash
    this.token = config.token;
    this.keyPrefix = config.keyPrefix ?? "";
  }

  private prefixKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  private async command<T = unknown>(...args: (string | number)[]): Promise<T> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upstash API error: ${error}`);
      }

      const data = await response.json() as { result: T; error?: string };

      if (data.error) {
        throw new Error(data.error);
      }

      return data.result;
    } catch (err) {
      throw new CacheError(
        `Upstash command failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  private async pipeline<T = unknown>(commands: (string | number)[][]): Promise<T[]> {
    try {
      const response = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commands),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upstash API error: ${error}`);
      }

      const data = await response.json() as Array<{ result: T; error?: string }>;
      return data.map((item) => {
        if (item.error) {
          throw new Error(item.error);
        }
        return item.result;
      });
    } catch (err) {
      throw new CacheError(
        `Upstash pipeline failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        CacheErrorCodes.OPERATION_FAILED,
        err
      );
    }
  }

  async get<T = unknown>(key: string, _options?: CacheGetOptions): Promise<T | null> {
    const data = await this.command<string | null>("GET", this.prefixKey(key));

    if (!data) {
      return null;
    }

    try {
      const parsed = JSON.parse(data) as { value: T };
      return parsed.value;
    } catch {
      // Return raw string if not JSON
      return data as T;
    }
  }

  async set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const data = JSON.stringify({
      value,
      tags: options?.tags,
      metadata: options?.metadata,
    });

    const prefixedKey = this.prefixKey(key);

    if (options?.ttl) {
      await this.command("SET", prefixedKey, data, "EX", options.ttl);
    } else {
      await this.command("SET", prefixedKey, data);
    }

    // Store tag-to-key mappings
    if (options?.tags && options.tags.length > 0) {
      const commands: (string | number)[][] = [];
      for (const tag of options.tags) {
        commands.push(["SADD", this.prefixKey(`__tag:${tag}`), key]);
      }
      await this.pipeline(commands);
    }
  }

  async delete(key: string): Promise<void> {
    await this.command("DEL", this.prefixKey(key));
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.command<number>("EXISTS", this.prefixKey(key));
    return exists > 0;
  }

  async clear(): Promise<void> {
    if (this.keyPrefix) {
      // Scan and delete keys with our prefix
      let cursor = "0";
      do {
        const result = await this.command<[string, string[]]>(
          "SCAN",
          cursor,
          "MATCH",
          `${this.keyPrefix}:*`,
          "COUNT",
          100
        );
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          await this.command("DEL", ...keys);
        }
      } while (cursor !== "0");
    } else {
      await this.command("FLUSHDB");
    }
  }

  async getMany<T = unknown>(keys: string[]): Promise<Map<string, T | null>> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));
    const results = await this.command<(string | null)[]>("MGET", ...prefixedKeys);

    const map = new Map<string, T | null>();
    for (let i = 0; i < keys.length; i++) {
      const data = results[i];
      const key = keys[i];
      if (key !== undefined) {
        if (data) {
          try {
            const parsed = JSON.parse(data) as { value: T };
            map.set(key, parsed.value);
          } catch {
            map.set(key, data as T);
          }
        } else {
          map.set(key, null);
        }
      }
    }

    return map;
  }

  async setMany<T = unknown>(entries: Map<string, T>, options?: CacheSetOptions): Promise<void> {
    const commands: (string | number)[][] = [];

    for (const [key, value] of entries) {
      const data = JSON.stringify({
        value,
        tags: options?.tags,
        metadata: options?.metadata,
      });

      const prefixedKey = this.prefixKey(key);

      if (options?.ttl) {
        commands.push(["SET", prefixedKey, data, "EX", options.ttl]);
      } else {
        commands.push(["SET", prefixedKey, data]);
      }
    }

    await this.pipeline(commands);
  }

  async deleteMany(keys: string[]): Promise<void> {
    const prefixedKeys = keys.map((k) => this.prefixKey(k));
    await this.command("DEL", ...prefixedKeys);
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    const keysToDelete: string[] = [];

    // Get all keys for each tag
    for (const tag of tags) {
      const keys = await this.command<string[]>("SMEMBERS", this.prefixKey(`__tag:${tag}`));
      keysToDelete.push(...keys);
    }

    if (keysToDelete.length > 0) {
      await this.deleteMany(keysToDelete);
    }

    // Clean up tag sets
    const tagKeys = tags.map((tag) => this.prefixKey(`__tag:${tag}`));
    await this.command("DEL", ...tagKeys);
  }

  async ttl(key: string): Promise<number> {
    return await this.command<number>("TTL", this.prefixKey(key));
  }

  async close(): Promise<void> {
    // No-op for HTTP client
  }
}

/**
 * Create an Upstash cache adapter
 */
export function createUpstashCacheAdapter(config: UpstashCacheConfig): UpstashCacheAdapter {
  return new UpstashCacheAdapter(config);
}
