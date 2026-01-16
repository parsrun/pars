/**
 * @parsrun/server - Quota Enforcement Middleware
 * Enforce usage quotas before processing requests
 */

import type { HonoContext, HonoNext } from "../context.js";

/**
 * Quota check result interface (from @parsrun/payments)
 */
export interface QuotaCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  wouldExceed: boolean;
  percentAfter: number | null;
}

/**
 * Quota manager interface (from @parsrun/payments)
 * Defined here to avoid circular dependency
 */
export interface QuotaManagerLike {
  checkQuota(
    customerId: string,
    featureKey: string,
    quantity?: number
  ): Promise<QuotaCheckResult>;

  enforceQuota(
    customerId: string,
    featureKey: string,
    quantity?: number
  ): Promise<void>;
}

/**
 * Quota exceeded error class
 */
export class QuotaExceededError extends Error {
  public readonly statusCode = 429;
  public readonly code = "QUOTA_EXCEEDED";

  constructor(
    public readonly featureKey: string,
    public readonly limit: number | null,
    public readonly currentUsage: number,
    public readonly requestedQuantity: number = 1
  ) {
    super(
      `Quota exceeded for "${featureKey}": ${currentUsage}/${limit ?? "unlimited"} used`
    );
    this.name = "QuotaExceededError";
  }
}

/**
 * Quota enforcement middleware options
 */
export interface QuotaEnforcementOptions {
  /**
   * Quota manager instance
   */
  quotaManager: QuotaManagerLike;

  /**
   * Feature key to check
   * Can be a static string or a function that extracts it from context
   */
  featureKey: string | ((c: HonoContext) => string);

  /**
   * Quantity to check (default: 1)
   */
  quantity?: number | ((c: HonoContext) => number);

  /**
   * Skip quota check for certain requests
   */
  skip?: (c: HonoContext) => boolean;

  /**
   * Custom customer ID extractor
   * @default Uses c.get("user")?.id
   */
  getCustomerId?: (c: HonoContext) => string | undefined;

  /**
   * Include quota headers in response
   * @default true
   */
  includeHeaders?: boolean;

  /**
   * Custom error handler
   */
  onQuotaExceeded?: (
    c: HonoContext,
    result: QuotaCheckResult,
    featureKey: string
  ) => Response | void;

  /**
   * Soft limit mode - warn but don't block
   * @default false
   */
  softLimit?: boolean;

  /**
   * Callback when quota is close to limit (>80%)
   */
  onQuotaWarning?: (
    c: HonoContext,
    result: QuotaCheckResult,
    featureKey: string
  ) => void;
}

/**
 * Quota enforcement middleware
 *
 * Checks and enforces usage quotas before processing requests.
 *
 * @example
 * ```typescript
 * import { quotaEnforcement } from "@parsrun/server";
 * import { createQuotaManager, createMemoryUsageStorage } from "@parsrun/payments";
 *
 * const quotaManager = createQuotaManager({
 *   storage: createMemoryUsageStorage(),
 * });
 *
 * // Enforce API call quota
 * app.use("/api/*", quotaEnforcement({
 *   quotaManager,
 *   featureKey: "api_calls",
 * }));
 *
 * // Enforce with dynamic feature key
 * app.use("/api/*", quotaEnforcement({
 *   quotaManager,
 *   featureKey: (c) => {
 *     if (c.req.path.startsWith("/api/ai")) return "ai_requests";
 *     return "api_calls";
 *   },
 * }));
 *
 * // Soft limit mode (warn but allow)
 * app.use("/api/*", quotaEnforcement({
 *   quotaManager,
 *   featureKey: "api_calls",
 *   softLimit: true,
 *   onQuotaWarning: (c, result) => {
 *     console.warn("Quota warning:", result);
 *   },
 * }));
 * ```
 */
export function quotaEnforcement(options: QuotaEnforcementOptions) {
  const {
    quotaManager,
    featureKey,
    quantity = 1,
    skip,
    getCustomerId = (c) => c.get("user")?.id,
    includeHeaders = true,
    onQuotaExceeded,
    softLimit = false,
    onQuotaWarning,
  } = options;

  return async (c: HonoContext, next: HonoNext) => {
    // Skip if configured
    if (skip?.(c)) {
      return next();
    }

    const customerId = getCustomerId(c);

    // Skip if no user (unauthenticated requests)
    if (!customerId) {
      return next();
    }

    const resolvedFeatureKey =
      typeof featureKey === "function" ? featureKey(c) : featureKey;

    const resolvedQuantity =
      typeof quantity === "function" ? quantity(c) : quantity;

    try {
      const result = await quotaManager.checkQuota(
        customerId,
        resolvedFeatureKey,
        resolvedQuantity
      );

      // Set quota headers
      if (includeHeaders) {
        c.header("X-Quota-Limit", String(result.limit ?? "unlimited"));
        c.header("X-Quota-Remaining", String(result.remaining ?? "unlimited"));
        c.header("X-Quota-Used", String(result.currentUsage));

        if (result.percentAfter !== null) {
          c.header("X-Quota-Percent", String(result.percentAfter));
        }
      }

      // Check for warning threshold (>80%)
      if (
        result.percentAfter !== null &&
        result.percentAfter >= 80 &&
        onQuotaWarning
      ) {
        onQuotaWarning(c, result, resolvedFeatureKey);
      }

      // Check if quota exceeded
      if (!result.allowed && !softLimit) {
        // Custom error handler
        if (onQuotaExceeded) {
          const response = onQuotaExceeded(c, result, resolvedFeatureKey);
          if (response) return response;
        }

        // Default error response
        throw new QuotaExceededError(
          resolvedFeatureKey,
          result.limit,
          result.currentUsage,
          resolvedQuantity
        );
      }

      // Continue to next middleware
      await next();
    } catch (error) {
      // Re-throw quota errors
      if (error instanceof QuotaExceededError) {
        throw error;
      }

      // Log other errors but continue
      const logger = c.get("logger");
      if (logger) {
        logger.error("Quota check failed", {
          error: error instanceof Error ? error.message : String(error),
          customerId,
          featureKey: resolvedFeatureKey,
        });
      }

      // Continue on error (fail open)
      await next();
    }
  };
}

/**
 * Create quota enforcement middleware with pre-configured options
 */
export function createQuotaEnforcement(
  baseOptions: Omit<QuotaEnforcementOptions, "featureKey">
) {
  return (featureKey: string | ((c: HonoContext) => string)) => {
    return quotaEnforcement({ ...baseOptions, featureKey });
  };
}

/**
 * Multiple quota enforcement
 * Check multiple features at once
 */
export function multiQuotaEnforcement(
  options: Omit<QuotaEnforcementOptions, "featureKey"> & {
    features: Array<{
      featureKey: string;
      quantity?: number | ((c: HonoContext) => number);
    }>;
  }
) {
  const { features } = options;

  return async (c: HonoContext, next: HonoNext) => {
    const customerId = (options.getCustomerId ?? ((ctx) => ctx.get("user")?.id))(c);

    if (!customerId || options.skip?.(c)) {
      return next();
    }

    // Check all quotas
    for (const feature of features) {
      const resolvedQuantity =
        typeof feature.quantity === "function"
          ? feature.quantity(c)
          : feature.quantity ?? 1;

      const result = await options.quotaManager.checkQuota(
        customerId,
        feature.featureKey,
        resolvedQuantity
      );

      if (!result.allowed && !options.softLimit) {
        if (options.onQuotaExceeded) {
          const response = options.onQuotaExceeded(c, result, feature.featureKey);
          if (response) return response;
        }

        throw new QuotaExceededError(
          feature.featureKey,
          result.limit,
          result.currentUsage,
          resolvedQuantity
        );
      }
    }

    await next();
  };
}
