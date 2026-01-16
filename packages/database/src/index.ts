/**
 * @module
 * Database utilities for Pars - Drizzle ORM helpers, multi-runtime support.
 *
 * Supports:
 * - PostgreSQL (via postgres.js)
 * - Neon Serverless (edge-compatible)
 * - Cloudflare D1 (SQLite)
 *
 * @example
 * ```typescript
 * import { createDatabase } from '@parsrun/database';
 *
 * // PostgreSQL
 * const db = await createDatabase({
 *   type: 'postgres',
 *   host: 'localhost',
 *   port: 5432,
 *   user: 'postgres',
 *   password: 'password',
 *   database: 'mydb',
 * });
 *
 * // Neon Serverless
 * const db = await createDatabase({
 *   type: 'neon',
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * // Cloudflare D1
 * const db = createDatabase({
 *   type: 'd1',
 *   binding: env.DB,
 * });
 *
 * // Use with Drizzle ORM
 * const users = await db.drizzle().select().from(usersTable);
 * ```
 */

// Types
export {
  type DatabaseAdapterType,
  type BaseDatabaseConfig,
  type PostgresConfig,
  type NeonConfig,
  type D1Config,
  type D1Database,
  type DatabaseConfig,
  type MigrationStatus,
  type MigrationResult,
  type TransactionOptions,
  type QueryOptions,
  type DatabaseHealth,
  type DatabaseAdapter,
  DatabaseError,
  DatabaseErrorCodes,
} from "./types.js";

// Adapters
export {
  PostgresAdapter,
  createPostgresAdapter,
  createPostgresFromUrl,
} from "./adapters/postgres.js";

export {
  NeonAdapter,
  createNeonAdapter,
  createNeonFromUrl,
} from "./adapters/neon.js";

export { D1Adapter, createD1Adapter } from "./adapters/d1.js";

// Utilities
export {
  sleep,
  retry,
  isRetryableError,
  parseConnectionString,
  buildConnectionString,
  snakeToCamel,
  camelToSnake,
  transformToCamelCase,
  transformToSnakeCase,
  generateUUID,
  generateShortId,
  getPaginationOffset,
  createPaginatedResult,
  escapeLike,
  buildSearchPattern,
  type PaginationOptions,
  type PaginatedResult,
} from "./utils.js";

import type { DatabaseAdapter, DatabaseConfig } from "./types.js";
import { DatabaseError, DatabaseErrorCodes } from "./types.js";

/**
 * Create a database adapter based on configuration
 *
 * @param config - Database configuration
 * @returns Database adapter instance
 */
export async function createDatabase(
  config: DatabaseConfig
): Promise<DatabaseAdapter> {
  switch (config.type) {
    case "postgres": {
      const { createPostgresAdapter } = await import("./adapters/postgres.js");
      return createPostgresAdapter(config);
    }

    case "neon": {
      const { createNeonAdapter } = await import("./adapters/neon.js");
      return createNeonAdapter(config);
    }

    case "d1": {
      const { createD1Adapter } = await import("./adapters/d1.js");
      return createD1Adapter(config);
    }

    default:
      throw new DatabaseError(
        `Unknown database type: ${(config as DatabaseConfig).type}`,
        DatabaseErrorCodes.INVALID_CONFIG
      );
  }
}

/**
 * Create a database adapter from connection string
 *
 * @param connectionString - Database connection URL
 * @param options - Additional options
 * @returns Database adapter instance
 */
export async function createDatabaseFromUrl(
  connectionString: string,
  options?: { logging?: boolean; poolSize?: number }
): Promise<DatabaseAdapter> {
  const url = new URL(connectionString);

  // Detect database type from URL scheme
  switch (url.protocol) {
    case "postgresql:":
    case "postgres:": {
      // Check if it's a Neon URL
      if (url.hostname.includes("neon.tech")) {
        const { createNeonFromUrl } = await import("./adapters/neon.js");
        return createNeonFromUrl(connectionString, options);
      }

      const { createPostgresFromUrl } = await import("./adapters/postgres.js");
      return createPostgresFromUrl(connectionString, options);
    }

    default:
      throw new DatabaseError(
        `Unsupported database URL scheme: ${url.protocol}`,
        DatabaseErrorCodes.INVALID_CONFIG
      );
  }
}

/**
 * Re-export drizzle-orm for convenience
 */
export * from "drizzle-orm";
