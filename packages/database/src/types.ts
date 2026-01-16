/**
 * @parsrun/database - Type Definitions
 * Database types and interfaces
 */

/**
 * Database adapter type
 */
export type DatabaseAdapterType = "postgres" | "neon" | "d1" | "custom";

/**
 * Base database configuration
 */
export interface BaseDatabaseConfig {
  /** Adapter type */
  type: DatabaseAdapterType;
  /** Enable query logging */
  logging?: boolean | undefined;
  /** Connection pool size */
  poolSize?: number | undefined;
}

/**
 * PostgreSQL configuration
 */
export interface PostgresConfig extends BaseDatabaseConfig {
  type: "postgres";
  /** Database host */
  host: string;
  /** Database port */
  port: number;
  /** Database user */
  user: string;
  /** Database password */
  password: string;
  /** Database name */
  database: string;
  /** SSL configuration */
  ssl?: boolean | { rejectUnauthorized: boolean } | undefined;
}

/**
 * Neon serverless configuration
 */
export interface NeonConfig extends BaseDatabaseConfig {
  type: "neon";
  /** Connection string */
  connectionString: string;
  /** Use pooled connection */
  pooled?: boolean | undefined;
}

/**
 * Cloudflare D1 configuration
 */
export interface D1Config extends BaseDatabaseConfig {
  type: "d1";
  /** D1 binding */
  binding: D1Database;
}

/**
 * Cloudflare D1 Database binding type
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  dump(): Promise<ArrayBuffer>;
  exec<T>(query: string): Promise<D1Result<T>>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Result<T> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: D1Meta;
}

interface D1Meta {
  duration: number;
  rows_read: number;
  rows_written: number;
}

/**
 * Combined database configuration
 */
export type DatabaseConfig = PostgresConfig | NeonConfig | D1Config;

/**
 * Migration status
 */
export interface MigrationStatus {
  /** Whether migrations need to be run */
  needsMigration: boolean;
  /** Whether database is up to date */
  upToDate: boolean;
  /** Number of pending migrations */
  pendingCount: number;
  /** Number of applied migrations */
  appliedCount: number;
  /** Error message if check failed */
  error?: string | undefined;
}

/**
 * Migration result
 */
export interface MigrationResult {
  /** Whether migration succeeded */
  success: boolean;
  /** Number of migrations applied */
  appliedCount?: number | undefined;
  /** Error message if migration failed */
  error?: string | undefined;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  /** Isolation level */
  isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable" | undefined;
  /** Access mode */
  accessMode?: "read only" | "read write" | undefined;
  /** Deferrable (PostgreSQL) */
  deferrable?: boolean | undefined;
}

/**
 * Query options
 */
export interface QueryOptions {
  /** Query timeout in milliseconds */
  timeout?: number | undefined;
  /** Transform result rows */
  transform?: "camelCase" | "snakeCase" | undefined;
}

/**
 * Database health status
 */
export interface DatabaseHealth {
  /** Whether database is healthy */
  healthy: boolean;
  /** Connection latency in milliseconds */
  latencyMs: number;
  /** Database version */
  version?: string | undefined;
  /** Error message if unhealthy */
  error?: string | undefined;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  /** Adapter type */
  readonly type: DatabaseAdapterType;

  /**
   * Execute raw SQL query
   */
  execute<T = unknown>(sql: string): Promise<T[]>;

  /**
   * Check connection health
   */
  ping(): Promise<boolean>;

  /**
   * Get connection health with details
   */
  health(): Promise<DatabaseHealth>;

  /**
   * Get the underlying Drizzle instance
   */
  drizzle(): unknown;

  /**
   * Close database connection
   */
  close(): Promise<void>;
}

/**
 * Database error
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

/**
 * Common database error codes
 */
export const DatabaseErrorCodes = {
  CONNECTION_FAILED: "CONNECTION_FAILED",
  QUERY_FAILED: "QUERY_FAILED",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  MIGRATION_FAILED: "MIGRATION_FAILED",
  INVALID_CONFIG: "INVALID_CONFIG",
  ADAPTER_NOT_AVAILABLE: "ADAPTER_NOT_AVAILABLE",
  TIMEOUT: "TIMEOUT",
  CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
  NOT_FOUND: "NOT_FOUND",
} as const;
