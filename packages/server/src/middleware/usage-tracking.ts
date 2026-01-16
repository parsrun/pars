/**
 * @parsrun/server - Usage Tracking Middleware
 * Automatically track API usage per request
 */

import type { HonoContext, HonoNext } from "../context.js";

/**
 * Usage service interface (from @parsrun/payments)
 * Defined here to avoid circular dependency
 */
export interface UsageServiceLike {
  trackUsage(options: {
    tenantId: string;
    customerId: string;
    subscriptionId?: string;
    featureKey: string;
    quantity?: number;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<unknown>;
}

/**
 * Usage tracking middleware options
 */
export interface UsageTrackingOptions {
  /**
   * Usage service instance
   */
  usageService: UsageServiceLike;

  /**
   * Feature key to track
   * Can be a static string or a function that extracts it from context
   * @default "api_calls"
   */
  featureKey?: string | ((c: HonoContext) => string);

  /**
   * Quantity to track
   * Can be a static number or a function that calculates it from context
   * @default 1
   */
  quantity?: number | ((c: HonoContext) => number);

  /**
   * Skip tracking for certain requests
   */
  skip?: (c: HonoContext) => boolean;

  /**
   * When to track: before or after the request
   * @default "response"
   */
  trackOn?: "request" | "response";

  /**
   * Only track successful responses (2xx)
   * @default true
   */
  successOnly?: boolean;

  /**
   * Custom customer ID extractor
   * @default Uses c.get("user")?.id
   */
  getCustomerId?: (c: HonoContext) => string | undefined;

  /**
   * Custom tenant ID extractor
   * @default Uses c.get("tenant")?.id or c.get("user")?.tenantId
   */
  getTenantId?: (c: HonoContext) => string | undefined;

  /**
   * Custom subscription ID extractor
   */
  getSubscriptionId?: (c: HonoContext) => string | undefined;

  /**
   * Include request metadata
   * @default true
   */
  includeMetadata?: boolean;

  /**
   * Generate idempotency key to prevent duplicates
   */
  getIdempotencyKey?: (c: HonoContext) => string | undefined;
}

/**
 * Usage tracking middleware
 *
 * Automatically tracks API usage for authenticated requests.
 *
 * @example
 * ```typescript
 * import { usageTracking } from "@parsrun/server";
 * import { createUsageService, createMemoryUsageStorage } from "@parsrun/payments";
 *
 * const usageService = createUsageService({
 *   storage: createMemoryUsageStorage(),
 * });
 *
 * // Track all API calls
 * app.use("/api/*", usageTracking({
 *   usageService,
 *   featureKey: "api_calls",
 * }));
 *
 * // Track with custom feature key based on route
 * app.use("/api/ai/*", usageTracking({
 *   usageService,
 *   featureKey: "ai_requests",
 *   quantity: (c) => {
 *     // Track tokens used from response
 *     return c.get("tokensUsed") ?? 1;
 *   },
 * }));
 *
 * // Skip certain routes
 * app.use("/api/*", usageTracking({
 *   usageService,
 *   skip: (c) => c.req.path.startsWith("/api/health"),
 * }));
 * ```
 */
export function usageTracking(options: UsageTrackingOptions) {
  const {
    usageService,
    featureKey = "api_calls",
    quantity = 1,
    skip,
    trackOn = "response",
    successOnly = true,
    getCustomerId = (c) => c.get("user")?.id,
    getTenantId = (c) => c.get("tenant")?.id ?? c.get("user")?.tenantId,
    getSubscriptionId,
    includeMetadata = true,
    getIdempotencyKey,
  } = options;

  return async (c: HonoContext, next: HonoNext) => {
    // Track on request (before processing)
    if (trackOn === "request") {
      await trackUsage(c);
      return next();
    }

    // Track on response (after processing)
    await next();

    // Skip if configured
    if (skip?.(c)) return;

    // Skip failed responses if configured
    if (successOnly && c.res.status >= 400) return;

    await trackUsage(c);
  };

  async function trackUsage(c: HonoContext) {
    const customerId = getCustomerId(c);
    const tenantId = getTenantId(c);

    // Skip if no user or tenant
    if (!customerId || !tenantId) return;

    const resolvedFeatureKey =
      typeof featureKey === "function" ? featureKey(c) : featureKey;

    const resolvedQuantity =
      typeof quantity === "function" ? quantity(c) : quantity;

    const metadata = includeMetadata
      ? {
          path: c.req.path,
          method: c.req.method,
          statusCode: c.res.status,
          userAgent: c.req.header("user-agent"),
        }
      : undefined;

    try {
      // Build track options with only defined optional properties
      const trackOptions: {
        tenantId: string;
        customerId: string;
        featureKey: string;
        quantity?: number;
        subscriptionId?: string;
        metadata?: Record<string, unknown>;
        idempotencyKey?: string;
      } = {
        tenantId,
        customerId,
        featureKey: resolvedFeatureKey,
        quantity: resolvedQuantity,
      };

      const subscriptionId = getSubscriptionId?.(c);
      if (subscriptionId !== undefined) {
        trackOptions.subscriptionId = subscriptionId;
      }

      if (metadata !== undefined) {
        trackOptions.metadata = metadata;
      }

      const idempotencyKey = getIdempotencyKey?.(c);
      if (idempotencyKey !== undefined) {
        trackOptions.idempotencyKey = idempotencyKey;
      }

      await usageService.trackUsage(trackOptions);
    } catch (error) {
      // Log but don't fail the request
      const logger = c.get("logger");
      if (logger) {
        logger.error("Usage tracking failed", {
          error: error instanceof Error ? error.message : String(error),
          customerId,
          featureKey: resolvedFeatureKey,
        });
      }
    }
  }
}

/**
 * Create usage tracking middleware with pre-configured options
 */
export function createUsageTracking(baseOptions: UsageTrackingOptions) {
  return (overrides?: Partial<UsageTrackingOptions>) => {
    return usageTracking({ ...baseOptions, ...overrides });
  };
}
