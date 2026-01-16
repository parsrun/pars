/**
 * @parsrun/payments - Usage Types
 * Types for usage-based billing
 */

import type { PaymentProviderType } from "../types.js";
import type { BillingSubscription, BillingLogger as BillingLoggerType } from "../billing/types.js";

// Re-export BillingLogger for convenience
export type BillingLogger = BillingLoggerType;

// ============================================================================
// Plan & Features
// ============================================================================

/**
 * Plan tier levels
 */
export type PlanTier = 0 | 1 | 2 | 3 | 4; // free, starter, pro, enterprise, custom

/**
 * Billing interval
 */
export type BillingInterval = "month" | "year";

/**
 * Limit period for features
 */
export type LimitPeriod = "hour" | "day" | "month" | null;

/**
 * Reset period for quotas
 * - monthly: Reset on the 1st of each calendar month
 * - billing_cycle: Reset on subscription renewal date
 */
export type ResetPeriod = "monthly" | "billing_cycle";

/**
 * Customer access status
 * - active: Full access, subscription is current
 * - past_due: Limited access, payment failed but grace period active
 * - suspended: No access, multiple payment failures
 * - canceled: No access, subscription canceled
 * - unpaid: No access, subscription unpaid
 */
export type AccessStatus = "active" | "past_due" | "suspended" | "canceled" | "unpaid";

/**
 * Access status info for a customer
 */
export interface AccessStatusInfo {
  status: AccessStatus;
  /** When the status was last updated */
  updatedAt: Date;
  /** Reason for current status */
  reason?: string;
  /** When access will be suspended (for past_due) */
  suspensionDate?: Date;
  /** Number of failed payment attempts */
  failedPaymentAttempts?: number;
  /** Grace period end date */
  gracePeriodEnd?: Date;
}

/**
 * Plan definition
 */
export interface Plan {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  tier: PlanTier;
  basePrice: number; // cents
  currency: string;
  billingInterval: BillingInterval;
  features: PlanFeature[];
  isActive: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Plan feature with limits
 */
export interface PlanFeature {
  id: string;
  planId: string;
  featureKey: string;
  limitValue: number | null; // null = unlimited
  limitPeriod: LimitPeriod;
  isEnabled: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Usage Events
// ============================================================================

/**
 * Usage event record
 */
export interface UsageEvent {
  id: string;
  tenantId: string;
  customerId: string;
  subscriptionId?: string;
  featureKey: string;
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Options for tracking usage
 */
export interface TrackUsageOptions {
  tenantId: string;
  customerId: string;
  subscriptionId?: string;
  featureKey: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  timestamp?: Date;
}

// ============================================================================
// Usage Aggregates
// ============================================================================

/**
 * Period type for aggregation
 */
export type PeriodType = "hour" | "day" | "month";

/**
 * Usage aggregate record
 */
export interface UsageAggregate {
  id: string;
  tenantId: string;
  customerId: string;
  subscriptionId?: string;
  featureKey: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: PeriodType;
  totalQuantity: number;
  eventCount: number;
  lastUpdated: Date;
}

/**
 * Options for getting usage
 */
export interface GetUsageOptions {
  featureKey?: string;
  periodType?: PeriodType;
  startDate?: Date;
  endDate?: Date;
  subscriptionId?: string;
}

// ============================================================================
// Quota
// ============================================================================

/**
 * Quota status for a feature
 */
export interface QuotaStatus {
  featureKey: string;
  limit: number | null; // null = unlimited
  used: number;
  remaining: number | null; // null = unlimited
  percentUsed: number | null;
  periodStart: Date;
  periodEnd: Date;
  isExceeded: boolean;
  isUnlimited: boolean;
  /** Overage amount (used - limit) when soft limits enabled */
  overage?: number;
  /** Whether overage is allowed for this feature */
  overageAllowed?: boolean;
}

/**
 * Quota check result
 */
export interface QuotaCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  wouldExceed: boolean;
  percentAfter: number | null;
}

// ============================================================================
// Alerts
// ============================================================================

/**
 * Alert status
 */
export type AlertStatus = "pending" | "triggered" | "acknowledged" | "resolved";

/**
 * Usage alert
 */
export interface UsageAlert {
  id: string;
  tenantId: string;
  customerId: string;
  subscriptionId?: string;
  featureKey: string;
  thresholdPercent: number;
  status: AlertStatus;
  currentUsage: number;
  limit: number;
  triggeredAt?: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ============================================================================
// Subscription Lifecycle
// ============================================================================

/**
 * Subscription lifecycle event types
 */
export type SubscriptionEventType =
  | "subscription.created"
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.plan_changed"
  | "subscription.canceled"
  | "subscription.expired"
  | "subscription.renewed"
  | "subscription.trial_started"
  | "subscription.trial_ended"
  | "subscription.payment_failed"
  | "subscription.payment_succeeded"
  | "subscription.period_reset";

/**
 * Subscription lifecycle event
 */
export interface SubscriptionEvent {
  type: SubscriptionEventType;
  subscription: BillingSubscription;
  previousPlan?: Plan;
  newPlan?: Plan;
  timestamp: Date;
  provider: PaymentProviderType;
  metadata?: Record<string, unknown>;
}

/**
 * Subscription event handler
 */
export type SubscriptionHandler = (event: SubscriptionEvent) => void | Promise<void>;

// ============================================================================
// Usage Webhook Events
// ============================================================================

/**
 * Usage-specific webhook event types
 */
export type UsageWebhookEventType =
  | "usage.recorded"
  | "usage.threshold_reached"
  | "usage.limit_exceeded"
  | "usage.limit_reset"
  | "plan.upgraded"
  | "plan.downgraded";

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Usage storage interface
 * Allows pluggable storage backends (database, in-memory, etc.)
 */
export interface UsageStorage {
  // Plans
  getPlan(planId: string): Promise<Plan | null>;
  getPlanByName(name: string): Promise<Plan | null>;
  listPlans(options?: { activeOnly?: boolean }): Promise<Plan[]>;

  // Plan Features
  getPlanFeatures(planId: string): Promise<PlanFeature[]>;
  getFeatureLimit(planId: string, featureKey: string): Promise<PlanFeature | null>;

  // Customer-Plan mapping
  getCustomerPlanId(customerId: string): Promise<string | null>;
  setCustomerPlanId(customerId: string, planId: string): Promise<void>;

  // Usage Events
  recordUsage(event: Omit<UsageEvent, "id">): Promise<UsageEvent>;
  recordUsageBatch(events: Omit<UsageEvent, "id">[]): Promise<UsageEvent[]>;
  getUsageEvents(customerId: string, options: GetUsageOptions): Promise<UsageEvent[]>;

  // Usage Aggregates
  getAggregate(customerId: string, featureKey: string, periodType: PeriodType, periodStart: Date): Promise<UsageAggregate | null>;
  upsertAggregate(aggregate: Omit<UsageAggregate, "id">): Promise<UsageAggregate>;
  getAggregates(customerId: string, options: GetUsageOptions): Promise<UsageAggregate[]>;

  // Current period usage (fast path)
  getCurrentPeriodUsage(customerId: string, featureKey: string, periodStart: Date): Promise<number>;

  // Alerts
  createAlert(alert: Omit<UsageAlert, "id" | "createdAt">): Promise<UsageAlert>;
  getActiveAlerts(customerId: string): Promise<UsageAlert[]>;
  updateAlertStatus(alertId: string, status: AlertStatus): Promise<void>;

  // Usage Reset
  /** Reset usage for a customer (all features or specific ones) */
  resetUsage(customerId: string, featureKeys?: string[], periodStart?: Date): Promise<void>;
  /** Reset all aggregates for a customer */
  resetAggregates(customerId: string, featureKeys?: string[]): Promise<void>;

  // Access Status
  /** Get customer access status */
  getAccessStatus(customerId: string): Promise<AccessStatusInfo | null>;
  /** Set customer access status */
  setAccessStatus(customerId: string, status: AccessStatusInfo): Promise<void>;

  // Billing Cycle (for billing_cycle reset period)
  /** Get customer's current billing cycle dates */
  getBillingCycle(customerId: string): Promise<{ start: Date; end: Date } | null>;
  /** Set customer's billing cycle dates */
  setBillingCycle(customerId: string, start: Date, end: Date): Promise<void>;
}

// ============================================================================
// Service Configuration
// ============================================================================

/**
 * Usage service configuration
 */
export interface UsageServiceConfig {
  /** Storage backend */
  storage: UsageStorage;

  /** Logger */
  logger?: BillingLogger;

  /** Alert thresholds (default: [80, 100]) */
  alertThresholds?: number[];

  /** Aggregate usage immediately (default: false - async) */
  aggregateImmediately?: boolean;

  /**
   * Reset period for quotas
   * - monthly: Reset on the 1st of each calendar month (default)
   * - billing_cycle: Reset on subscription renewal date
   */
  resetPeriod?: ResetPeriod;

  /**
   * Auto-reset quotas on subscription renewal
   * Default: true
   */
  autoResetOnRenewal?: boolean;

  /**
   * Grace period in days before access is suspended after payment failure
   * Default: 3 days
   */
  paymentGraceDays?: number;

  /**
   * Number of failed payments before suspending access
   * Default: 3
   */
  maxFailedPayments?: number;

  /** Callback when threshold is reached */
  onThresholdReached?: (alert: UsageAlert) => void | Promise<void>;

  /** Callback when limit is exceeded */
  onLimitExceeded?: (quota: QuotaStatus, customerId: string) => void | Promise<void>;

  /** Callback when period resets */
  onPeriodReset?: (customerId: string, featureKey: string) => void | Promise<void>;

  /** Callback when access status changes */
  onAccessStatusChanged?: (customerId: string, status: AccessStatusInfo, previousStatus?: AccessStatus) => void | Promise<void>;
}

/**
 * Quota manager configuration
 */
export interface QuotaManagerConfig {
  /** Storage backend */
  storage: UsageStorage;

  /** Logger */
  logger?: BillingLogger;

  /** Soft limit behavior - warn but allow (default: false) */
  softLimits?: boolean;

  /** Grace period percentage over limit (default: 0) */
  gracePercent?: number;

  /**
   * Features that allow overage (soft limits)
   * If set, only these features will allow overage.
   * If not set and softLimits=true, all features allow overage.
   */
  overageAllowedFeatures?: string[];

  /**
   * Callback when overage is recorded
   * Called when usage exceeds limit for a soft-limit feature
   */
  onOverage?: (customerId: string, featureKey: string, overage: number, limit: number) => void | Promise<void>;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Usage error codes
 */
export const UsageErrorCodes = {
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  PLAN_NOT_FOUND: "PLAN_NOT_FOUND",
  FEATURE_NOT_FOUND: "FEATURE_NOT_FOUND",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  DUPLICATE_EVENT: "DUPLICATE_EVENT",
  STORAGE_ERROR: "STORAGE_ERROR",
  INVALID_PERIOD: "INVALID_PERIOD",
} as const;

export type UsageErrorCode = keyof typeof UsageErrorCodes;

/**
 * Usage error
 */
export class UsageError extends Error {
  constructor(
    message: string,
    public readonly code: UsageErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "UsageError";
  }
}

/**
 * Quota exceeded error
 */
export class QuotaExceededError extends UsageError {
  constructor(
    public readonly featureKey: string,
    public readonly limit: number | null,
    public readonly currentUsage: number,
    public readonly requestedQuantity: number = 1
  ) {
    super(
      `Quota exceeded for feature "${featureKey}": ${currentUsage}/${limit ?? "unlimited"} used`,
      "QUOTA_EXCEEDED",
      { featureKey, limit, currentUsage, requestedQuantity }
    );
    this.name = "QuotaExceededError";
  }
}
