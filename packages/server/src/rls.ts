/**
 * @parsrun/server - Row Level Security (RLS) Manager
 * PostgreSQL RLS integration for multi-tenant isolation
 */

import type { DatabaseAdapter, HonoContext, HonoNext, Middleware } from "./context.js";

/**
 * RLS configuration
 */
export interface RLSConfig {
  /** Tenant ID column name (default: tenant_id) */
  tenantIdColumn?: string;
  /** PostgreSQL session variable name (default: app.current_tenant_id) */
  sessionVariable?: string;
  /** Enable RLS by default */
  enabled?: boolean;
}

/**
 * Default RLS configuration
 */
const DEFAULT_RLS_CONFIG: Required<RLSConfig> = {
  tenantIdColumn: "tenant_id",
  sessionVariable: "app.current_tenant_id",
  enabled: true,
};

/**
 * RLS Manager for tenant isolation
 *
 * @example
 * ```typescript
 * const rls = new RLSManager(db);
 *
 * // Set tenant context
 * await rls.setTenantId("tenant-123");
 *
 * // All queries now filtered by tenant
 * const items = await db.select().from(items);
 *
 * // Clear when done
 * await rls.clearTenantId();
 *
 * // Or use withTenant helper
 * await rls.withTenant("tenant-123", async () => {
 *   return await db.select().from(items);
 * });
 * ```
 */
export class RLSManager {
  private config: Required<RLSConfig>;

  constructor(
    private db: DatabaseAdapter,
    config: RLSConfig = {}
  ) {
    this.config = { ...DEFAULT_RLS_CONFIG, ...config };
  }

  /**
   * Set current tenant ID in database session
   * This enables RLS policies to filter by tenant
   */
  async setTenantId(tenantId: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      // Use parameterized query to prevent SQL injection
      // PostgreSQL SET command with escaped string
      const escapedTenantId = tenantId.replace(/'/g, "''");
      await this.db.execute(`SET ${this.config.sessionVariable} = '${escapedTenantId}'`);
    } catch (error) {
      console.error("Failed to set tenant ID for RLS:", error);
      throw new RLSError("Failed to set tenant context", "RLS_SET_FAILED", error);
    }
  }

  /**
   * Clear current tenant ID from database session
   */
  async clearTenantId(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await this.db.execute(`RESET ${this.config.sessionVariable}`);
    } catch (error) {
      console.error("Failed to clear tenant ID for RLS:", error);
      throw new RLSError("Failed to clear tenant context", "RLS_CLEAR_FAILED", error);
    }
  }

  /**
   * Execute a function with tenant context
   * Automatically sets and clears tenant ID
   */
  async withTenant<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
    await this.setTenantId(tenantId);
    try {
      return await operation();
    } finally {
      await this.clearTenantId();
    }
  }

  /**
   * Check if RLS is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<RLSConfig> {
    return { ...this.config };
  }
}

/**
 * RLS Error class
 */
export class RLSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RLSError";
  }
}

/**
 * Create RLS manager
 */
export function createRLSManager(db: DatabaseAdapter, config?: RLSConfig): RLSManager {
  return new RLSManager(db, config);
}

/**
 * RLS Middleware
 * Automatically sets tenant context for authenticated requests
 *
 * @example
 * ```typescript
 * app.use('*', rlsMiddleware());
 * ```
 */
export function rlsMiddleware(config?: RLSConfig): Middleware {
  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const user = c.get("user");
    const db = c.get("db");

    // Skip if no user or no tenant
    if (!user?.tenantId || !db) {
      return next();
    }

    const rls = new RLSManager(db, config);

    try {
      await rls.setTenantId(user.tenantId);
      await next();
    } finally {
      await rls.clearTenantId();
    }
  };
}

/**
 * Create SQL for enabling RLS on a table
 *
 * @example
 * ```sql
 * -- Generated SQL:
 * ALTER TABLE items ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY items_tenant_isolation ON items
 *   USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
 * ```
 */
export function generateRLSPolicy(
  tableName: string,
  options: {
    tenantIdColumn?: string;
    sessionVariable?: string;
    policyName?: string;
    castType?: string;
  } = {}
): string {
  const {
    tenantIdColumn = "tenant_id",
    sessionVariable = "app.current_tenant_id",
    policyName = `${tableName}_tenant_isolation`,
    castType = "uuid",
  } = options;

  return `
-- Enable RLS on table
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner too
ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY;

-- Create tenant isolation policy
DROP POLICY IF EXISTS ${policyName} ON ${tableName};
CREATE POLICY ${policyName} ON ${tableName}
  FOR ALL
  USING (${tenantIdColumn} = current_setting('${sessionVariable}', true)::${castType});
`.trim();
}

/**
 * Create SQL for disabling RLS on a table
 */
export function generateDisableRLS(tableName: string): string {
  return `
ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY;
ALTER TABLE ${tableName} NO FORCE ROW LEVEL SECURITY;
`.trim();
}
