/**
 * @parsrun/payments - Quota Manager
 * Handles quota checking and enforcement
 */

import type {
  UsageStorage,
  QuotaStatus,
  QuotaCheckResult,
  QuotaManagerConfig,
  BillingLogger,
} from "./types.js";
import { QuotaExceededError } from "./types.js";

/**
 * Null logger
 */
const nullLogger: BillingLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Get period boundaries based on limit period
 */
function getPeriodBoundaries(limitPeriod: "hour" | "day" | "month" | null): {
  start: Date;
  end: Date;
} {
  const now = new Date();

  switch (limitPeriod) {
    case "hour": {
      const start = new Date(now);
      start.setMinutes(0, 0, 0);
      const end = new Date(start);
      end.setHours(end.getHours() + 1);
      return { start, end };
    }

    case "day": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }

    case "month":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start, end };
    }
  }
}

/**
 * Quota Manager
 * Handles checking and enforcing usage quotas
 */
export class QuotaManager {
  private readonly storage: UsageStorage;
  private readonly logger: BillingLogger;
  private readonly softLimits: boolean;
  private readonly gracePercent: number;
  private readonly overageAllowedFeatures: string[] | null;
  private readonly onOverage?: (customerId: string, featureKey: string, overage: number, limit: number) => void | Promise<void>;

  constructor(config: QuotaManagerConfig) {
    this.storage = config.storage;
    this.logger = config.logger ?? nullLogger;
    this.softLimits = config.softLimits ?? false;
    this.gracePercent = config.gracePercent ?? 0;
    this.overageAllowedFeatures = config.overageAllowedFeatures ?? null;
    if (config.onOverage !== undefined) {
      this.onOverage = config.onOverage;
    }
  }

  /**
   * Check if overage is allowed for a feature
   */
  private isOverageAllowed(featureKey: string): boolean {
    if (!this.softLimits) return false;
    if (this.overageAllowedFeatures === null) return true; // All features allow overage
    return this.overageAllowedFeatures.includes(featureKey);
  }

  /**
   * Check if quota allows the requested quantity
   */
  async checkQuota(
    customerId: string,
    featureKey: string,
    requestedQuantity: number = 1
  ): Promise<QuotaCheckResult> {
    // Get customer's plan
    const planId = await this.storage.getCustomerPlanId(customerId);
    if (!planId) {
      // No plan = no limits
      return {
        allowed: true,
        currentUsage: 0,
        limit: null,
        remaining: null,
        wouldExceed: false,
        percentAfter: null,
      };
    }

    // Get feature limit
    const feature = await this.storage.getFeatureLimit(planId, featureKey);
    if (!feature) {
      // Feature not defined = unlimited
      return {
        allowed: true,
        currentUsage: 0,
        limit: null,
        remaining: null,
        wouldExceed: false,
        percentAfter: null,
      };
    }

    // Feature disabled
    if (!feature.isEnabled) {
      return {
        allowed: false,
        currentUsage: 0,
        limit: 0,
        remaining: 0,
        wouldExceed: true,
        percentAfter: 100,
      };
    }

    // Unlimited feature
    if (feature.limitValue === null) {
      return {
        allowed: true,
        currentUsage: 0,
        limit: null,
        remaining: null,
        wouldExceed: false,
        percentAfter: null,
      };
    }

    // Get current usage
    const { start } = getPeriodBoundaries(feature.limitPeriod);
    const currentUsage = await this.storage.getCurrentPeriodUsage(
      customerId,
      featureKey,
      start
    );

    // Calculate effective limit with grace
    const effectiveLimit = Math.ceil(feature.limitValue * (1 + this.gracePercent / 100));
    const usageAfter = currentUsage + requestedQuantity;
    const wouldExceed = usageAfter > effectiveLimit;
    const percentAfter = Math.round((usageAfter / feature.limitValue) * 100);

    // Check if overage is allowed for this specific feature
    const overageAllowed = this.isOverageAllowed(featureKey);
    const allowed = overageAllowed ? true : !wouldExceed;

    this.logger.debug("Quota check", {
      customerId,
      featureKey,
      currentUsage,
      requestedQuantity,
      limit: feature.limitValue,
      effectiveLimit,
      allowed,
      wouldExceed,
    });

    return {
      allowed,
      currentUsage,
      limit: feature.limitValue,
      remaining: Math.max(0, feature.limitValue - currentUsage),
      wouldExceed,
      percentAfter,
    };
  }

  /**
   * Enforce quota - throws if exceeded
   */
  async enforceQuota(
    customerId: string,
    featureKey: string,
    requestedQuantity: number = 1
  ): Promise<void> {
    const result = await this.checkQuota(customerId, featureKey, requestedQuantity);

    if (!result.allowed) {
      this.logger.warn("Quota exceeded", {
        customerId,
        featureKey,
        currentUsage: result.currentUsage,
        limit: result.limit,
        requestedQuantity,
      });

      throw new QuotaExceededError(
        featureKey,
        result.limit,
        result.currentUsage,
        requestedQuantity
      );
    }
  }

  /**
   * Get quota status for a feature
   */
  async getQuotaStatus(customerId: string, featureKey: string): Promise<QuotaStatus> {
    const planId = await this.storage.getCustomerPlanId(customerId);

    // No plan = unlimited
    if (!planId) {
      const now = new Date();
      return {
        featureKey,
        limit: null,
        used: 0,
        remaining: null,
        percentUsed: null,
        periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        isExceeded: false,
        isUnlimited: true,
      };
    }

    const feature = await this.storage.getFeatureLimit(planId, featureKey);

    // Feature not defined = unlimited
    if (!feature) {
      const now = new Date();
      return {
        featureKey,
        limit: null,
        used: 0,
        remaining: null,
        percentUsed: null,
        periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        isExceeded: false,
        isUnlimited: true,
      };
    }

    const { start, end } = getPeriodBoundaries(feature.limitPeriod);
    const used = await this.storage.getCurrentPeriodUsage(customerId, featureKey, start);

    const isUnlimited = feature.limitValue === null;
    const limit = feature.limitValue;
    const remaining = isUnlimited ? null : Math.max(0, limit! - used);
    const percentUsed = isUnlimited ? null : Math.round((used / limit!) * 100);
    const isExceeded = !isUnlimited && used >= limit!;
    const overageAllowed = this.isOverageAllowed(featureKey);
    const overage = isUnlimited ? undefined : (used > limit! ? used - limit! : undefined);

    // Trigger overage callback if exceeded and overage is allowed
    if (overage !== undefined && overage > 0 && overageAllowed && this.onOverage) {
      try {
        await this.onOverage(customerId, featureKey, overage, limit!);
      } catch (error) {
        this.logger.error("Overage callback failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result: QuotaStatus = {
      featureKey,
      limit,
      used,
      remaining,
      percentUsed,
      periodStart: start,
      periodEnd: end,
      isExceeded,
      isUnlimited,
    };

    // Add overage info only when relevant
    if (overage !== undefined) {
      result.overage = overage;
    }
    if (overageAllowed) {
      result.overageAllowed = true;
    }

    return result;
  }

  /**
   * Get all quota statuses for a customer
   */
  async getAllQuotas(customerId: string): Promise<QuotaStatus[]> {
    const planId = await this.storage.getCustomerPlanId(customerId);
    if (!planId) return [];

    const features = await this.storage.getPlanFeatures(planId);
    const quotas: QuotaStatus[] = [];

    for (const feature of features) {
      const status = await this.getQuotaStatus(customerId, feature.featureKey);
      quotas.push(status);
    }

    return quotas;
  }

  /**
   * Check if any quota is exceeded
   */
  async hasExceededQuotas(customerId: string): Promise<boolean> {
    const quotas = await this.getAllQuotas(customerId);
    return quotas.some((q) => q.isExceeded);
  }

  /**
   * Get exceeded quotas
   */
  async getExceededQuotas(customerId: string): Promise<QuotaStatus[]> {
    const quotas = await this.getAllQuotas(customerId);
    return quotas.filter((q) => q.isExceeded);
  }
}

/**
 * Create quota manager
 */
export function createQuotaManager(config: QuotaManagerConfig): QuotaManager {
  return new QuotaManager(config);
}
