/**
 * @parsrun/payments - Usage Tracker
 * Handles recording and tracking usage events
 */

import type {
  UsageStorage,
  UsageEvent,
  TrackUsageOptions,
  UsageAggregate,
  PeriodType,
  BillingLogger,
  UsageAlert,
} from "./types.js";

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
 * Get period boundaries for aggregation
 */
function getPeriodStart(timestamp: Date, periodType: PeriodType): Date {
  const date = new Date(timestamp);

  switch (periodType) {
    case "hour":
      date.setMinutes(0, 0, 0);
      return date;

    case "day":
      date.setHours(0, 0, 0, 0);
      return date;

    case "month":
      return new Date(date.getFullYear(), date.getMonth(), 1);
  }
}

/**
 * Get period end from period start
 */
function getPeriodEnd(periodStart: Date, periodType: PeriodType): Date {
  const date = new Date(periodStart);

  switch (periodType) {
    case "hour":
      date.setHours(date.getHours() + 1);
      return date;

    case "day":
      date.setDate(date.getDate() + 1);
      return date;

    case "month":
      return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }
}

/**
 * Usage tracker configuration
 */
export interface UsageTrackerConfig {
  storage: UsageStorage;
  logger?: BillingLogger;

  /** Update aggregates immediately on each event (default: true) */
  aggregateOnRecord?: boolean;

  /** Alert thresholds as percentages (default: [80, 100]) */
  alertThresholds?: number[];

  /** Callback when threshold is reached */
  onThresholdReached?: (alert: UsageAlert) => void | Promise<void>;
}

/**
 * Usage Tracker
 * Records usage events and maintains aggregates
 */
export class UsageTracker {
  private readonly storage: UsageStorage;
  private readonly logger: BillingLogger;
  private readonly aggregateOnRecord: boolean;
  private readonly alertThresholds: number[];
  private readonly onThresholdReached?: (alert: UsageAlert) => void | Promise<void>;

  constructor(config: UsageTrackerConfig) {
    this.storage = config.storage;
    this.logger = config.logger ?? nullLogger;
    this.aggregateOnRecord = config.aggregateOnRecord ?? true;
    this.alertThresholds = config.alertThresholds ?? [80, 100];
    if (config.onThresholdReached !== undefined) {
      this.onThresholdReached = config.onThresholdReached;
    }
  }

  /**
   * Track a usage event
   */
  async trackUsage(options: TrackUsageOptions): Promise<UsageEvent> {
    const timestamp = options.timestamp ?? new Date();
    const quantity = options.quantity ?? 1;

    this.logger.debug("Recording usage", {
      customerId: options.customerId,
      featureKey: options.featureKey,
      quantity,
    });

    // Record the event - build object with only defined optional properties
    const eventData: Omit<UsageEvent, "id"> = {
      tenantId: options.tenantId,
      customerId: options.customerId,
      featureKey: options.featureKey,
      quantity,
      timestamp,
    };

    if (options.subscriptionId !== undefined) {
      eventData.subscriptionId = options.subscriptionId;
    }
    if (options.metadata !== undefined) {
      eventData.metadata = options.metadata;
    }
    if (options.idempotencyKey !== undefined) {
      eventData.idempotencyKey = options.idempotencyKey;
    }

    const event = await this.storage.recordUsage(eventData);

    // Update aggregates if enabled
    if (this.aggregateOnRecord) {
      await this.updateAggregates(event);
    }

    // Check thresholds and create alerts
    await this.checkThresholds(options.customerId, options.featureKey);

    return event;
  }

  /**
   * Track multiple usage events
   */
  async trackBatch(events: TrackUsageOptions[]): Promise<UsageEvent[]> {
    const results: UsageEvent[] = [];

    for (const event of events) {
      const result = await this.trackUsage(event);
      results.push(result);
    }

    return results;
  }

  /**
   * Update aggregates for an event
   */
  private async updateAggregates(event: UsageEvent): Promise<void> {
    const periodTypes: PeriodType[] = ["hour", "day", "month"];

    for (const periodType of periodTypes) {
      const periodStart = getPeriodStart(event.timestamp, periodType);
      const periodEnd = getPeriodEnd(periodStart, periodType);

      // Get existing aggregate
      const existing = await this.storage.getAggregate(
        event.customerId,
        event.featureKey,
        periodType,
        periodStart
      );

      // Upsert aggregate - build object with only defined optional properties
      const aggregateData: Omit<UsageAggregate, "id"> = {
        tenantId: event.tenantId,
        customerId: event.customerId,
        featureKey: event.featureKey,
        periodStart,
        periodEnd,
        periodType,
        totalQuantity: (existing?.totalQuantity ?? 0) + event.quantity,
        eventCount: (existing?.eventCount ?? 0) + 1,
        lastUpdated: new Date(),
      };

      if (event.subscriptionId !== undefined) {
        aggregateData.subscriptionId = event.subscriptionId;
      }

      await this.storage.upsertAggregate(aggregateData);
    }
  }

  /**
   * Check thresholds and create alerts if needed
   */
  private async checkThresholds(customerId: string, featureKey: string): Promise<void> {
    // Get customer's plan
    const planId = await this.storage.getCustomerPlanId(customerId);
    if (!planId) return;

    // Get feature limit
    const feature = await this.storage.getFeatureLimit(planId, featureKey);
    if (!feature || feature.limitValue === null) return;

    // Get current usage
    const periodStart = getPeriodStart(new Date(), "month");
    const currentUsage = await this.storage.getCurrentPeriodUsage(
      customerId,
      featureKey,
      periodStart
    );

    const percentUsed = Math.round((currentUsage / feature.limitValue) * 100);

    // Check active alerts to avoid duplicates
    const activeAlerts = await this.storage.getActiveAlerts(customerId);
    const alertedThresholds = new Set(
      activeAlerts
        .filter((a) => a.featureKey === featureKey)
        .map((a) => a.thresholdPercent)
    );

    // Check each threshold
    for (const threshold of this.alertThresholds) {
      if (percentUsed >= threshold && !alertedThresholds.has(threshold)) {
        const alert = await this.storage.createAlert({
          tenantId: "", // Will be filled from customer
          customerId,
          featureKey,
          thresholdPercent: threshold,
          status: "triggered",
          currentUsage,
          limit: feature.limitValue,
          triggeredAt: new Date(),
        });

        this.logger.info("Usage threshold reached", {
          customerId,
          featureKey,
          threshold,
          percentUsed,
          currentUsage,
          limit: feature.limitValue,
        });

        // Notify callback
        if (this.onThresholdReached) {
          try {
            await this.onThresholdReached(alert);
          } catch (error) {
            this.logger.error("Threshold callback failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }
  }

  /**
   * Get usage for a customer
   */
  async getUsage(
    customerId: string,
    featureKey: string,
    periodType: PeriodType = "month"
  ): Promise<number> {
    const periodStart = getPeriodStart(new Date(), periodType);
    return this.storage.getCurrentPeriodUsage(customerId, featureKey, periodStart);
  }

  /**
   * Get usage aggregates
   */
  async getAggregates(
    customerId: string,
    featureKey: string,
    periodType: PeriodType,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageAggregate[]> {
    const options: { featureKey: string; periodType: PeriodType; startDate?: Date; endDate?: Date } = {
      featureKey,
      periodType,
    };

    if (startDate !== undefined) {
      options.startDate = startDate;
    }
    if (endDate !== undefined) {
      options.endDate = endDate;
    }

    return this.storage.getAggregates(customerId, options);
  }

  /**
   * Force aggregate recalculation for a period
   */
  async recalculateAggregates(
    customerId: string,
    featureKey: string,
    periodType: PeriodType,
    periodStart: Date
  ): Promise<UsageAggregate> {
    const periodEnd = getPeriodEnd(periodStart, periodType);

    // Get all events in period
    const events = await this.storage.getUsageEvents(customerId, {
      featureKey,
      startDate: periodStart,
      endDate: periodEnd,
    });

    // Calculate totals
    const totalQuantity = events.reduce((sum, e) => sum + e.quantity, 0);
    const eventCount = events.length;

    // Get tenant ID from first event or empty
    const tenantId = events[0]?.tenantId ?? "";
    const subscriptionId = events[0]?.subscriptionId;

    // Upsert aggregate - build object with only defined optional properties
    const aggregateData: Omit<UsageAggregate, "id"> = {
      tenantId,
      customerId,
      featureKey,
      periodStart,
      periodEnd,
      periodType,
      totalQuantity,
      eventCount,
      lastUpdated: new Date(),
    };

    if (subscriptionId !== undefined) {
      aggregateData.subscriptionId = subscriptionId;
    }

    return this.storage.upsertAggregate(aggregateData);
  }
}

/**
 * Create usage tracker
 */
export function createUsageTracker(config: UsageTrackerConfig): UsageTracker {
  return new UsageTracker(config);
}
