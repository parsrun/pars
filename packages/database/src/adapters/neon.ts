/**
 * @parsrun/database - Neon Serverless Adapter
 * Neon serverless PostgreSQL adapter - perfect for edge environments
 */

import { drizzle } from "drizzle-orm/neon-http";
import type {
  DatabaseAdapter,
  DatabaseHealth,
  NeonConfig,
} from "../types.js";
import { DatabaseError, DatabaseErrorCodes } from "../types.js";

// Type for Neon client
type NeonClient = ReturnType<typeof import("@neondatabase/serverless").neon>;

/**
 * Neon Serverless Database Adapter
 * Optimized for edge environments (Cloudflare Workers, Vercel Edge, etc.)
 *
 * @example
 * ```typescript
 * const db = await createNeonAdapter({
 *   type: 'neon',
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * // Execute queries
 * const users = await db.drizzle().select().from(usersTable);
 * ```
 */
export class NeonAdapter implements DatabaseAdapter {
  readonly type = "neon" as const;

  private client: NeonClient | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null;
  private config: NeonConfig;

  constructor(config: NeonConfig) {
    this.config = config;
  }

  /**
   * Initialize the connection
   */
  async connect(): Promise<void> {
    if (this.client) return;

    try {
      const { neon } = await import("@neondatabase/serverless");

      this.client = neon(this.config.connectionString, {
        fetchOptions: {
          cache: "no-store",
        },
      });

      // Build drizzle config - use any to avoid complex type issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const drizzleOpts: any = {};
      if (this.config.logging !== undefined) {
        drizzleOpts.logger = this.config.logging;
      }

      this.db = drizzle(this.client, drizzleOpts);
    } catch (err) {
      throw new DatabaseError(
        `Failed to connect to Neon: ${err instanceof Error ? err.message : "Unknown error"}`,
        DatabaseErrorCodes.CONNECTION_FAILED,
        err
      );
    }
  }

  async execute<T = unknown>(sql: string): Promise<T[]> {
    if (!this.client) {
      await this.connect();
    }

    try {
      const result = await this.client!(sql);
      // Neon can return different formats depending on how it's called
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (Array.isArray(result) && (result as any).rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (result as any).rows as T[];
      }
      return result as T[];
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
      await this.execute("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<DatabaseHealth> {
    const start = Date.now();

    try {
      if (!this.client) {
        await this.connect();
      }

      const result = await this.execute<{ version: string }>("SELECT version()");
      const latencyMs = Date.now() - start;

      return {
        healthy: true,
        latencyMs,
        version: result[0]?.version,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drizzle(): any {
    if (!this.db) {
      throw new DatabaseError(
        "Database not connected. Call connect() first.",
        DatabaseErrorCodes.CONNECTION_FAILED
      );
    }
    return this.db;
  }

  async close(): Promise<void> {
    // Neon serverless connections are stateless, nothing to close
    this.client = null;
    this.db = null;
  }

  /**
   * Get the raw Neon client
   */
  getClient(): NeonClient | null {
    return this.client;
  }
}

/**
 * Create a Neon adapter
 */
export async function createNeonAdapter(
  config: NeonConfig
): Promise<NeonAdapter> {
  const adapter = new NeonAdapter(config);
  await adapter.connect();
  return adapter;
}

/**
 * Create a Neon adapter from connection string
 */
export async function createNeonFromUrl(
  connectionString: string,
  options?: Omit<NeonConfig, "type" | "connectionString">
): Promise<NeonAdapter> {
  return createNeonAdapter({
    type: "neon",
    connectionString,
    ...options,
  });
}
