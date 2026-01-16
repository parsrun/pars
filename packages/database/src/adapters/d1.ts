/**
 * @parsrun/database - Cloudflare D1 Adapter
 * Cloudflare D1 (SQLite) adapter - native edge database
 */

import { drizzle } from "drizzle-orm/d1";
import type {
  D1Config,
  D1Database,
  DatabaseAdapter,
  DatabaseHealth,
} from "../types.js";
import { DatabaseError, DatabaseErrorCodes } from "../types.js";

/**
 * Cloudflare D1 Database Adapter
 * Native SQLite database for Cloudflare Workers
 *
 * @example
 * ```typescript
 * // In Cloudflare Worker
 * export default {
 *   async fetch(request, env) {
 *     const db = createD1Adapter({
 *       type: 'd1',
 *       binding: env.DB, // D1 binding from wrangler.toml
 *     });
 *
 *     const users = await db.drizzle().select().from(usersTable);
 *     return new Response(JSON.stringify(users));
 *   }
 * }
 * ```
 */
export class D1Adapter implements DatabaseAdapter {
  readonly type = "d1" as const;

  private binding: D1Database;
  private db: ReturnType<typeof drizzle>;

  constructor(config: D1Config) {
    this.binding = config.binding;

    const drizzleConfig: Parameters<typeof drizzle>[1] = {};
    if (config.logging !== undefined) {
      drizzleConfig.logger = config.logging;
    }

    this.db = drizzle(this.binding as Parameters<typeof drizzle>[0], drizzleConfig);
  }

  async execute<T = unknown>(sql: string): Promise<T[]> {
    try {
      const result = await this.binding.exec<T>(sql);
      return result.results ?? [];
    } catch (err) {
      throw new DatabaseError(
        `Query failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        DatabaseErrorCodes.QUERY_FAILED,
        err
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.binding.prepare("SELECT 1").first();
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<DatabaseHealth> {
    const start = Date.now();

    try {
      await this.binding.prepare("SELECT 1").first();
      const latencyMs = Date.now() - start;

      // Get SQLite version
      const versionResult = await this.binding
        .prepare("SELECT sqlite_version() as version")
        .first<{ version: string }>();

      return {
        healthy: true,
        latencyMs,
        version: versionResult ? `SQLite ${versionResult.version}` : undefined,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  drizzle(): ReturnType<typeof drizzle> {
    return this.db;
  }

  async close(): Promise<void> {
    // D1 bindings are managed by Cloudflare, nothing to close
  }

  /**
   * Get the raw D1 binding
   */
  getBinding(): D1Database {
    return this.binding;
  }

  /**
   * Execute a batch of statements
   */
  async batch<T = unknown>(
    statements: Array<{ sql: string; params?: unknown[] }>
  ): Promise<T[][]> {
    try {
      const prepared = statements.map((stmt) => {
        const p = this.binding.prepare(stmt.sql);
        return stmt.params ? p.bind(...stmt.params) : p;
      });

      const results = await this.binding.batch<T>(prepared);
      return results.map((r) => r.results ?? []);
    } catch (err) {
      throw new DatabaseError(
        `Batch execution failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        DatabaseErrorCodes.QUERY_FAILED,
        err
      );
    }
  }
}

/**
 * Create a D1 adapter
 */
export function createD1Adapter(config: D1Config): D1Adapter {
  return new D1Adapter(config);
}
