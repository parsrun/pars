/**
 * @parsrun/server - Health Check Endpoints
 * Kubernetes-compatible health and readiness probes
 */

import { Hono } from "hono";
import type { HonoApp, ServerContextVariables } from "./context.js";

/**
 * Health check status
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
  latency?: number;
}

/**
 * Health check function
 */
export type HealthCheck = () => Promise<HealthCheckResult> | HealthCheckResult;

/**
 * Health response
 */
export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  checks: Record<string, HealthCheckResult>;
}

/**
 * Health check options
 */
export interface HealthCheckOptions {
  /** Custom health checks */
  checks?: Record<string, HealthCheck>;
  /** Include detailed info (disable in production) */
  detailed?: boolean;
}

// Track server start time
const startTime = Date.now();

/**
 * Database health check
 */
async function checkDatabase(db: { ping?: () => Promise<boolean> }): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    if (db.ping) {
      await db.ping();
    }
    return {
      status: "healthy",
      latency: Date.now() - start,
    };
  } catch (err) {
    return {
      status: "unhealthy",
      message: err instanceof Error ? err.message : "Database connection failed",
      latency: Date.now() - start,
    };
  }
}

/**
 * Determine overall status from individual checks
 */
function aggregateStatus(checks: Record<string, HealthCheckResult>): HealthStatus {
  const statuses = Object.values(checks).map((c) => c.status);

  if (statuses.some((s) => s === "unhealthy")) {
    return "unhealthy";
  }

  if (statuses.some((s) => s === "degraded")) {
    return "degraded";
  }

  return "healthy";
}

/**
 * Create health check router
 *
 * @example
 * ```typescript
 * const health = createHealthRouter({
 *   checks: {
 *     redis: async () => {
 *       await redis.ping();
 *       return { status: 'healthy' };
 *     },
 *     external: async () => {
 *       const res = await fetch('https://api.example.com/health');
 *       return { status: res.ok ? 'healthy' : 'unhealthy' };
 *     },
 *   },
 * });
 *
 * app.route('/health', health);
 * // GET /health - Full health check
 * // GET /health/live - Liveness probe
 * // GET /health/ready - Readiness probe
 * ```
 */
export function createHealthRouter(options: HealthCheckOptions = {}): HonoApp {
  const router = new Hono<{ Variables: ServerContextVariables }>();
  const { checks = {}, detailed = true } = options;

  /**
   * GET /health - Full health check
   * Returns detailed status of all checks
   */
  router.get("/", async (c) => {
    const db = c.get("db");
    const results: Record<string, HealthCheckResult> = {};

    // Run database check
    results["database"] = await checkDatabase(db);

    // Run custom checks in parallel
    const customCheckResults = await Promise.all(
      Object.entries(checks).map(async ([name, check]) => {
        try {
          const result = await check();
          return [name, result] as const;
        } catch (err) {
          return [
            name,
            {
              status: "unhealthy" as const,
              message: err instanceof Error ? err.message : "Check failed",
            },
          ] as const;
        }
      })
    );

    for (const [name, result] of customCheckResults) {
      results[name] = result;
    }

    const overallStatus = aggregateStatus(results);
    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks: detailed ? results : {},
    };

    const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

    return c.json(response, statusCode as 200);
  });

  /**
   * GET /health/live - Liveness probe
   * Kubernetes liveness probe - returns 200 if server is running
   */
  router.get("/live", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/ready - Readiness probe
   * Kubernetes readiness probe - returns 200 if server can handle traffic
   */
  router.get("/ready", async (c) => {
    const db = c.get("db");

    // Check database connection
    const dbHealth = await checkDatabase(db);

    if (dbHealth.status === "unhealthy") {
      return c.json(
        {
          status: "not_ready",
          reason: "database",
          timestamp: new Date().toISOString(),
        },
        503
      );
    }

    return c.json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/startup - Startup probe
   * For slow-starting containers
   */
  router.get("/startup", (c) => {
    return c.json({
      status: "started",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

/**
 * Simple health endpoint handler
 *
 * @example
 * ```typescript
 * app.get('/health', healthHandler);
 * ```
 */
export async function healthHandler(c: import("hono").Context<{ Variables: ServerContextVariables }>) {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
}
