/**
 * @parsrun/database - PostgreSQL Adapter
 * PostgreSQL adapter using postgres.js
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type {
  DatabaseAdapter,
  DatabaseHealth,
  PostgresConfig,
} from "../types.js";
import { DatabaseError, DatabaseErrorCodes } from "../types.js";

/**
 * PostgreSQL Database Adapter
 *
 * @example
 * ```typescript
 * const db = await createPostgresAdapter({
 *   type: 'postgres',
 *   host: 'localhost',
 *   port: 5432,
 *   user: 'postgres',
 *   password: 'password',
 *   database: 'mydb',
 * });
 *
 * // Execute queries
 * const users = await db.drizzle().select().from(usersTable);
 *
 * // Close when done
 * await db.close();
 * ```
 */
export class PostgresAdapter implements DatabaseAdapter {
  readonly type = "postgres" as const;

  private client: unknown = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: PostgresJsDatabase<any> | null = null;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  /**
   * Initialize the connection
   */
  async connect(): Promise<void> {
    if (this.client) return;

    try {
      const postgresModule = await import("postgres");
      const postgres = postgresModule.default;

      // Build SSL config
      type SSLMode = boolean | "require" | "allow" | "prefer" | "verify-full" | { rejectUnauthorized: boolean };
      let sslConfig: SSLMode = false;

      if (this.config.ssl === true) {
        sslConfig = "require";
      } else if (typeof this.config.ssl === "object") {
        sslConfig = this.config.ssl;
      }

      this.client = postgres({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        ssl: sslConfig,
        max: this.config.poolSize ?? 10,
      });

      // Build drizzle config - use any to avoid complex type issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const drizzleOpts: any = {};
      if (this.config.logging !== undefined) {
        drizzleOpts.logger = this.config.logging;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.db = drizzle(this.client as any, drizzleOpts);
    } catch (err) {
      throw new DatabaseError(
        `Failed to connect to PostgreSQL: ${err instanceof Error ? err.message : "Unknown error"}`,
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
      const client = this.client as { unsafe: (sql: string) => Promise<unknown[]> };
      const result = await client.unsafe(sql);
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
  drizzle(): PostgresJsDatabase<any> {
    if (!this.db) {
      throw new DatabaseError(
        "Database not connected. Call connect() first.",
        DatabaseErrorCodes.CONNECTION_FAILED
      );
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.client) {
      const client = this.client as { end: () => Promise<void> };
      await client.end();
      this.client = null;
      this.db = null;
    }
  }

  /**
   * Get the raw postgres client
   */
  getClient(): unknown {
    return this.client;
  }
}

/**
 * Create a PostgreSQL adapter
 */
export async function createPostgresAdapter(
  config: PostgresConfig
): Promise<PostgresAdapter> {
  const adapter = new PostgresAdapter(config);
  await adapter.connect();
  return adapter;
}

/**
 * Create a PostgreSQL adapter from connection string
 */
export async function createPostgresFromUrl(
  connectionString: string,
  options?: Omit<PostgresConfig, "type" | "host" | "port" | "user" | "password" | "database">
): Promise<PostgresAdapter> {
  const url = new URL(connectionString);

  const config: PostgresConfig = {
    type: "postgres",
    host: url.hostname,
    port: parseInt(url.port || "5432", 10),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: url.searchParams.get("sslmode") === "require",
    ...options,
  };

  return createPostgresAdapter(config);
}
