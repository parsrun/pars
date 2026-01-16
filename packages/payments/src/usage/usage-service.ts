/**
 * @parsrun/payments - Usage Service
 * Main service for usage-based billing
 */

import type {
  UsageStorage,
  UsageServiceConfig,
  UsageEvent,
  TrackUsageOptions,
  UsageAggregate,
  QuotaStatus,
  QuotaCheckResult,
  Plan,
  PlanFeature,
  PeriodType,
  GetUsageOptions,
  SubscriptionEventType,
  SubscriptionHandler,
  BillingLogger,
  ResetPeriod,
  AccessStatus,
  AccessStatusInfo,
} from "./types.js";
import { QuotaManager } from "./quota-manager.js";
import { UsageTracker } from "./usage-tracker.js";
import { SubscriptionLifecycle } from "./lifecycle-hooks.js";

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
 * Usage Service
 *
 * High-level API for usage-based billing:
 * - Track usage events
 * - Check and enforce quotas
 * - Manage subscription lifecycle
 * - Generate usage reports
 *
 * @example
 * ```typescript
 * const usageService = createUsageService({
 *   storage: createMemoryUsageStorage(),
 *   alertThresholds: [80, 100],
 *   onThresholdReached: async (alert) => {
 *     await sendEmail(alert.customerId, "usage-warning");
 *   },
 * });
 *
 * // Track usage
 * await usageService.trackUsage({
 *   tenantId: "tenant_123",
 *   customerId: "cus_456",
 *   featureKey: "api_calls",
 *   quantity: 1,
 * });
 *
 * // Check quota
 * const quota = await usageService.getQuotaStatus("cus_456", "api_calls");
 * if (quota.isExceeded) {
 *   throw new Error("Quota exceeded");
 * }
 *
 * // Lifecycle hooks
 * usageService.onPlanChanged(async (event) => {
 *   console.log(`Plan changed from ${event.previousPlan?.name} to ${event.newPlan?.name}`);
 * });
 * ```
 */
export class UsageService {
  private readonly storage: UsageStorage;
  private readonly logger: BillingLogger;
  private readonly quotaManager: QuotaManager;
  private readonly usageTracker: UsageTracker;
  private readonly lifecycle: SubscriptionLifecycle;
  private readonly limitExceededHandler?: (quota: QuotaStatus, customerId: string) => void | Promise<void>;
  private readonly resetPeriod: ResetPeriod;
  private readonly autoResetOnRenewal: boolean;
  private readonly paymentGraceDays: number;
  private readonly maxFailedPayments: number;
  private readonly accessStatusChangedHandler?: (customerId: string, status: AccessStatusInfo, previousStatus?: AccessStatus) => void | Promise<void>;
  private readonly periodResetHandler?: (customerId: string, featureKey: string) => void | Promise<void>;

  constructor(config: UsageServiceConfig) {
    this.storage = config.storage;
    this.logger = config.logger ?? nullLogger;
    this.resetPeriod = config.resetPeriod ?? "monthly";
    this.autoResetOnRenewal = config.autoResetOnRenewal ?? true;
    this.paymentGraceDays = config.paymentGraceDays ?? 3;
    this.maxFailedPayments = config.maxFailedPayments ?? 3;

    if (config.onAccessStatusChanged !== undefined) {
      this.accessStatusChangedHandler = config.onAccessStatusChanged;
    }
    if (config.onPeriodReset !== undefined) {
      this.periodResetHandler = config.onPeriodReset;
    }

    // Store handler with undefined check
    if (config.onLimitExceeded !== undefined) {
      this.limitExceededHandler = config.onLimitExceeded;
    }

    // Build quota manager config with only defined properties
    const quotaManagerConfig: { storage: UsageStorage; logger?: BillingLogger } = {
      storage: config.storage,
    };
    if (config.logger !== undefined) {
      quotaManagerConfig.logger = config.logger;
    }
    this.quotaManager = new QuotaManager(quotaManagerConfig);

    // Build usage tracker config with only defined properties
    const usageTrackerConfig: {
      storage: UsageStorage;
      logger?: BillingLogger;
      aggregateOnRecord?: boolean;
      alertThresholds?: number[];
      onThresholdReached?: (alert: import("./types.js").UsageAlert) => void | Promise<void>;
    } = {
      storage: config.storage,
      aggregateOnRecord: config.aggregateImmediately ?? true,
      alertThresholds: config.alertThresholds ?? [80, 100],
    };
    if (config.logger !== undefined) {
      usageTrackerConfig.logger = config.logger;
    }
    if (config.onThresholdReached !== undefined) {
      usageTrackerConfig.onThresholdReached = config.onThresholdReached;
    }
    this.usageTracker = new UsageTracker(usageTrackerConfig);

    // Initialize lifecycle
    this.lifecycle = config.logger !== undefined
      ? new SubscriptionLifecycle(config.logger)
      : new SubscriptionLifecycle();

    this.logger.info("UsageService initialized");
  }

  // ============================================================================
  // Usage Tracking
  // ============================================================================

  /**
   * Track a usage event
   */
  async trackUsage(options: TrackUsageOptions): Promise<UsageEvent> {
    return this.usageTracker.trackUsage(options);
  }

  /**
   * Track multiple usage events
   */
  async trackBatch(events: TrackUsageOptions[]): Promise<UsageEvent[]> {
    return this.usageTracker.trackBatch(events);
  }

  /**
   * Get current usage for a feature
   */
  async getUsage(
    customerId: string,
    featureKey: string,
    periodType: PeriodType = "month"
  ): Promise<number> {
    return this.usageTracker.getUsage(customerId, featureKey, periodType);
  }

  /**
   * Get usage aggregates
   */
  async getAggregates(
    customerId: string,
    options: GetUsageOptions = {}
  ): Promise<UsageAggregate[]> {
    return this.storage.getAggregates(customerId, options);
  }

  // ============================================================================
  // Quota Management
  // ============================================================================

  /**
   * Check if quota allows the requested quantity
   */
  async checkQuota(
    customerId: string,
    featureKey: string,
    quantity: number = 1
  ): Promise<QuotaCheckResult> {
    return this.quotaManager.checkQuota(customerId, featureKey, quantity);
  }

  /**
   * Enforce quota - throws if exceeded
   */
  async enforceQuota(
    customerId: string,
    featureKey: string,
    quantity: number = 1
  ): Promise<void> {
    return this.quotaManager.enforceQuota(customerId, featureKey, quantity);
  }

  /**
   * Get quota status for a feature
   */
  async getQuotaStatus(customerId: string, featureKey: string): Promise<QuotaStatus> {
    const status = await this.quotaManager.getQuotaStatus(customerId, featureKey);

    // Trigger limit exceeded callback if needed
    if (status.isExceeded && this.limitExceededHandler) {
      try {
        await this.limitExceededHandler(status, customerId);
      } catch (error) {
        this.logger.error("Limit exceeded callback failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return status;
  }

  /**
   * Get all quota statuses for a customer
   */
  async getAllQuotas(customerId: string): Promise<QuotaStatus[]> {
    return this.quotaManager.getAllQuotas(customerId);
  }

  /**
   * Check if any quota is exceeded
   */
  async hasExceededQuotas(customerId: string): Promise<boolean> {
    return this.quotaManager.hasExceededQuotas(customerId);
  }

  // ============================================================================
  // Plan Management
  // ============================================================================

  /**
   * Get customer's current plan
   */
  async getCustomerPlan(customerId: string): Promise<Plan | null> {
    const planId = await this.storage.getCustomerPlanId(customerId);
    if (!planId) return null;
    return this.storage.getPlan(planId);
  }

  /**
   * Set customer's plan
   */
  async setCustomerPlan(customerId: string, planId: string): Promise<void> {
    this.logger.info("Setting customer plan", { customerId, planId });
    await this.storage.setCustomerPlanId(customerId, planId);
  }

  /**
   * Get plan by ID
   */
  async getPlan(planId: string): Promise<Plan | null> {
    return this.storage.getPlan(planId);
  }

  /**
   * Get plan by name
   */
  async getPlanByName(name: string): Promise<Plan | null> {
    return this.storage.getPlanByName(name);
  }

  /**
   * List all plans
   */
  async listPlans(options?: { activeOnly?: boolean }): Promise<Plan[]> {
    return this.storage.listPlans(options);
  }

  /**
   * Get plan features
   */
  async getPlanFeatures(planId: string): Promise<PlanFeature[]> {
    return this.storage.getPlanFeatures(planId);
  }

  // ============================================================================
  // Subscription Lifecycle
  // ============================================================================

  /**
   * Register a subscription event handler
   */
  on(event: SubscriptionEventType | "*", handler: SubscriptionHandler): this {
    this.lifecycle.on(event, handler);
    return this;
  }

  /**
   * Remove a subscription event handler
   */
  off(event: SubscriptionEventType | "*", handler: SubscriptionHandler): this {
    this.lifecycle.off(event, handler);
    return this;
  }

  /**
   * Handle subscription created
   */
  onSubscriptionCreated(handler: SubscriptionHandler): this {
    this.lifecycle.onCreated(handler);
    return this;
  }

  /**
   * Handle subscription updated
   */
  onSubscriptionUpdated(handler: SubscriptionHandler): this {
    this.lifecycle.onUpdated(handler);
    return this;
  }

  /**
   * Handle subscription canceled
   */
  onSubscriptionCanceled(handler: SubscriptionHandler): this {
    this.lifecycle.onCanceled(handler);
    return this;
  }

  /**
   * Handle plan changed
   */
  onPlanChanged(handler: SubscriptionHandler): this {
    this.lifecycle.onPlanChanged(handler);
    return this;
  }

  /**
   * Handle subscription renewed
   */
  onRenewed(handler: SubscriptionHandler): this {
    this.lifecycle.onRenewed(handler);
    return this;
  }

  /**
   * Handle payment failed
   */
  onPaymentFailed(handler: SubscriptionHandler): this {
    this.lifecycle.onPaymentFailed(handler);
    return this;
  }

  /**
   * Handle period reset
   */
  onPeriodReset(handler: SubscriptionHandler): this {
    this.lifecycle.onPeriodReset(handler);
    return this;
  }

  /**
   * Get the lifecycle manager for advanced usage
   */
  get lifecycleManager(): SubscriptionLifecycle {
    return this.lifecycle;
  }

  // ============================================================================
  // Alerts
  // ============================================================================

  /**
   * Get active alerts for a customer
   */
  async getActiveAlerts(customerId: string) {
    return this.storage.getActiveAlerts(customerId);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    await this.storage.updateAlertStatus(alertId, "acknowledged");
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    await this.storage.updateAlertStatus(alertId, "resolved");
  }

  // ============================================================================
  // Usage Reset
  // ============================================================================

  /**
   * Reset usage for a customer
   * Typically called on subscription renewal
   */
  async resetUsage(
    customerId: string,
    featureKeys?: string[]
  ): Promise<void> {
    this.logger.info("Resetting usage", { customerId, featureKeys });

    // Get the period start based on reset period setting
    const periodStart = await this.getResetPeriodStart(customerId);

    await this.storage.resetUsage(customerId, featureKeys, periodStart);

    // Trigger callbacks
    if (this.periodResetHandler) {
      const features = featureKeys ?? await this.getCustomerFeatureKeys(customerId);
      for (const featureKey of features) {
        try {
          await this.periodResetHandler(customerId, featureKey);
        } catch (error) {
          this.logger.error("Period reset callback failed", {
            customerId,
            featureKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Emit lifecycle event
    const plan = await this.getCustomerPlan(customerId);
    if (plan) {
      await this.lifecycle.emit({
        type: "subscription.period_reset",
        subscription: {
          id: "",
          customerId,
          status: "active",
          priceId: "",
          currentPeriodStart: periodStart,
          currentPeriodEnd: new Date(),
          cancelAtPeriodEnd: false,
          provider: "stripe", // Default, will be overridden by BillingIntegration
        },
        newPlan: plan,
        timestamp: new Date(),
        provider: "stripe",
      });
    }

    this.logger.info("Usage reset complete", { customerId });
  }

  /**
   * Get the period start date based on reset period setting
   */
  private async getResetPeriodStart(customerId: string): Promise<Date> {
    if (this.resetPeriod === "billing_cycle") {
      // Use the customer's billing cycle
      const billingCycle = await this.storage.getBillingCycle(customerId);
      if (billingCycle) {
        return billingCycle.start;
      }
    }

    // Default to calendar month
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Get feature keys for a customer's plan
   */
  private async getCustomerFeatureKeys(customerId: string): Promise<string[]> {
    const planId = await this.storage.getCustomerPlanId(customerId);
    if (!planId) return [];

    const features = await this.storage.getPlanFeatures(planId);
    return features.map(f => f.featureKey);
  }

  /**
   * Check if auto-reset on renewal is enabled
   */
  get autoResetEnabled(): boolean {
    return this.autoResetOnRenewal;
  }

  /**
   * Get current reset period setting
   */
  get currentResetPeriod(): ResetPeriod {
    return this.resetPeriod;
  }

  // ============================================================================
  // Access Status
  // ============================================================================

  /**
   * Get customer access status
   */
  async getAccessStatus(customerId: string): Promise<AccessStatusInfo> {
    const status = await this.storage.getAccessStatus(customerId);
    if (status) {
      return status;
    }

    // Default to active
    return {
      status: "active",
      updatedAt: new Date(),
    };
  }

  /**
   * Set customer access status
   */
  async setAccessStatus(
    customerId: string,
    status: AccessStatus,
    options?: {
      reason?: string;
      suspensionDate?: Date;
      failedPaymentAttempts?: number;
      gracePeriodEnd?: Date;
    }
  ): Promise<void> {
    const previousStatusInfo = await this.storage.getAccessStatus(customerId);
    const previousStatus = previousStatusInfo?.status;

    const newStatus: AccessStatusInfo = {
      status,
      updatedAt: new Date(),
    };

    if (options?.reason !== undefined) {
      newStatus.reason = options.reason;
    }
    if (options?.suspensionDate !== undefined) {
      newStatus.suspensionDate = options.suspensionDate;
    }
    if (options?.failedPaymentAttempts !== undefined) {
      newStatus.failedPaymentAttempts = options.failedPaymentAttempts;
    }
    if (options?.gracePeriodEnd !== undefined) {
      newStatus.gracePeriodEnd = options.gracePeriodEnd;
    }

    await this.storage.setAccessStatus(customerId, newStatus);

    this.logger.info("Access status changed", {
      customerId,
      previousStatus,
      newStatus: status,
      reason: options?.reason,
    });

    // Trigger callback
    if (this.accessStatusChangedHandler) {
      try {
        await this.accessStatusChangedHandler(customerId, newStatus, previousStatus);
      } catch (error) {
        this.logger.error("Access status change callback failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Handle payment failure - update access status
   */
  async handlePaymentFailure(customerId: string): Promise<void> {
    const currentStatus = await this.getAccessStatus(customerId);
    const failedAttempts = (currentStatus.failedPaymentAttempts ?? 0) + 1;

    if (failedAttempts >= this.maxFailedPayments) {
      // Suspend access
      await this.setAccessStatus(customerId, "suspended", {
        reason: `Payment failed ${failedAttempts} times`,
        failedPaymentAttempts: failedAttempts,
      });
    } else {
      // Set to past_due with grace period
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.paymentGraceDays);

      await this.setAccessStatus(customerId, "past_due", {
        reason: `Payment failed (attempt ${failedAttempts}/${this.maxFailedPayments})`,
        failedPaymentAttempts: failedAttempts,
        gracePeriodEnd,
        suspensionDate: gracePeriodEnd,
      });
    }
  }

  /**
   * Handle successful payment - restore access status
   */
  async handlePaymentSuccess(customerId: string): Promise<void> {
    const currentStatus = await this.getAccessStatus(customerId);

    if (currentStatus.status !== "active") {
      await this.setAccessStatus(customerId, "active", {
        reason: "Payment successful",
        failedPaymentAttempts: 0,
      });
    }
  }

  /**
   * Check if customer has access (not suspended/canceled)
   */
  async hasAccess(customerId: string): Promise<boolean> {
    const status = await this.getAccessStatus(customerId);
    return status.status === "active" || status.status === "past_due";
  }

  /**
   * Check if customer is in grace period
   */
  async isInGracePeriod(customerId: string): Promise<boolean> {
    const status = await this.getAccessStatus(customerId);
    if (status.status !== "past_due") return false;
    if (!status.gracePeriodEnd) return false;
    return new Date() < status.gracePeriodEnd;
  }

  // ============================================================================
  // Billing Cycle
  // ============================================================================

  /**
   * Set customer billing cycle
   */
  async setBillingCycle(customerId: string, start: Date, end: Date): Promise<void> {
    await this.storage.setBillingCycle(customerId, start, end);
    this.logger.debug("Billing cycle set", { customerId, start, end });
  }

  /**
   * Get customer billing cycle
   */
  async getBillingCycle(customerId: string): Promise<{ start: Date; end: Date } | null> {
    return this.storage.getBillingCycle(customerId);
  }

  // ============================================================================
  // Internal
  // ============================================================================

  /**
   * Get the underlying storage
   */
  get storageBackend(): UsageStorage {
    return this.storage;
  }

  /**
   * Get the quota manager
   */
  get quotas(): QuotaManager {
    return this.quotaManager;
  }

  /**
   * Get the usage tracker
   */
  get tracker(): UsageTracker {
    return this.usageTracker;
  }
}

/**
 * Create usage service
 */
export function createUsageService(config: UsageServiceConfig): UsageService {
  return new UsageService(config);
}
