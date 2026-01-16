/**
 * @parsrun/payments - In-Memory Usage Storage
 * Default storage implementation for development and testing
 */

import type {
  UsageStorage,
  Plan,
  PlanFeature,
  UsageEvent,
  UsageAggregate,
  UsageAlert,
  AlertStatus,
  PeriodType,
  GetUsageOptions,
  AccessStatusInfo,
} from "./types.js";

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * In-memory usage storage
 * For development, testing, and single-instance deployments
 */
export class MemoryUsageStorage implements UsageStorage {
  private plans = new Map<string, Plan>();
  private planFeatures = new Map<string, PlanFeature[]>();
  private customerPlans = new Map<string, string>();
  private usageEvents: UsageEvent[] = [];
  private usageAggregates = new Map<string, UsageAggregate>();
  private alerts = new Map<string, UsageAlert>();
  private idempotencyKeys = new Set<string>();
  private accessStatuses = new Map<string, AccessStatusInfo>();
  private billingCycles = new Map<string, { start: Date; end: Date }>();

  // ============================================================================
  // Plans
  // ============================================================================

  async getPlan(planId: string): Promise<Plan | null> {
    return this.plans.get(planId) ?? null;
  }

  async getPlanByName(name: string): Promise<Plan | null> {
    for (const plan of this.plans.values()) {
      if (plan.name === name) {
        return plan;
      }
    }
    return null;
  }

  async listPlans(options?: { activeOnly?: boolean }): Promise<Plan[]> {
    const plans = Array.from(this.plans.values());
    if (options?.activeOnly) {
      return plans.filter((p) => p.isActive);
    }
    return plans;
  }

  /**
   * Add a plan (for testing/setup)
   */
  addPlan(plan: Plan): void {
    this.plans.set(plan.id, plan);
    // Extract features
    if (plan.features.length > 0) {
      this.planFeatures.set(plan.id, plan.features);
    }
  }

  // ============================================================================
  // Plan Features
  // ============================================================================

  async getPlanFeatures(planId: string): Promise<PlanFeature[]> {
    return this.planFeatures.get(planId) ?? [];
  }

  async getFeatureLimit(planId: string, featureKey: string): Promise<PlanFeature | null> {
    const features = this.planFeatures.get(planId);
    if (!features) return null;
    return features.find((f) => f.featureKey === featureKey) ?? null;
  }

  /**
   * Add plan features (for testing/setup)
   */
  addPlanFeatures(planId: string, features: PlanFeature[]): void {
    this.planFeatures.set(planId, features);
  }

  // ============================================================================
  // Customer-Plan Mapping
  // ============================================================================

  async getCustomerPlanId(customerId: string): Promise<string | null> {
    return this.customerPlans.get(customerId) ?? null;
  }

  async setCustomerPlanId(customerId: string, planId: string): Promise<void> {
    this.customerPlans.set(customerId, planId);
  }

  // ============================================================================
  // Usage Events
  // ============================================================================

  async recordUsage(event: Omit<UsageEvent, "id">): Promise<UsageEvent> {
    // Check idempotency
    if (event.idempotencyKey) {
      if (this.idempotencyKeys.has(event.idempotencyKey)) {
        // Return existing event with same key
        const existing = this.usageEvents.find(
          (e) => e.idempotencyKey === event.idempotencyKey
        );
        if (existing) return existing;
      }
      this.idempotencyKeys.add(event.idempotencyKey);
    }

    const usageEvent: UsageEvent = {
      id: generateId(),
      ...event,
      timestamp: event.timestamp ?? new Date(),
    };

    this.usageEvents.push(usageEvent);
    return usageEvent;
  }

  async recordUsageBatch(events: Omit<UsageEvent, "id">[]): Promise<UsageEvent[]> {
    const results: UsageEvent[] = [];
    for (const event of events) {
      results.push(await this.recordUsage(event));
    }
    return results;
  }

  async getUsageEvents(customerId: string, options: GetUsageOptions): Promise<UsageEvent[]> {
    let events = this.usageEvents.filter((e) => e.customerId === customerId);

    if (options.featureKey) {
      events = events.filter((e) => e.featureKey === options.featureKey);
    }

    if (options.subscriptionId) {
      events = events.filter((e) => e.subscriptionId === options.subscriptionId);
    }

    if (options.startDate) {
      events = events.filter((e) => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      events = events.filter((e) => e.timestamp <= options.endDate!);
    }

    return events;
  }

  // ============================================================================
  // Usage Aggregates
  // ============================================================================

  private getAggregateKey(
    customerId: string,
    featureKey: string,
    periodType: PeriodType,
    periodStart: Date
  ): string {
    return `${customerId}:${featureKey}:${periodType}:${periodStart.toISOString()}`;
  }

  async getAggregate(
    customerId: string,
    featureKey: string,
    periodType: PeriodType,
    periodStart: Date
  ): Promise<UsageAggregate | null> {
    const key = this.getAggregateKey(customerId, featureKey, periodType, periodStart);
    return this.usageAggregates.get(key) ?? null;
  }

  async upsertAggregate(aggregate: Omit<UsageAggregate, "id">): Promise<UsageAggregate> {
    const key = this.getAggregateKey(
      aggregate.customerId,
      aggregate.featureKey,
      aggregate.periodType,
      aggregate.periodStart
    );

    const existing = this.usageAggregates.get(key);
    const result: UsageAggregate = {
      id: existing?.id ?? generateId(),
      ...aggregate,
      lastUpdated: new Date(),
    };

    this.usageAggregates.set(key, result);
    return result;
  }

  async getAggregates(customerId: string, options: GetUsageOptions): Promise<UsageAggregate[]> {
    let aggregates = Array.from(this.usageAggregates.values()).filter(
      (a) => a.customerId === customerId
    );

    if (options.featureKey) {
      aggregates = aggregates.filter((a) => a.featureKey === options.featureKey);
    }

    if (options.periodType) {
      aggregates = aggregates.filter((a) => a.periodType === options.periodType);
    }

    if (options.subscriptionId) {
      aggregates = aggregates.filter((a) => a.subscriptionId === options.subscriptionId);
    }

    if (options.startDate) {
      aggregates = aggregates.filter((a) => a.periodStart >= options.startDate!);
    }

    if (options.endDate) {
      aggregates = aggregates.filter((a) => a.periodEnd <= options.endDate!);
    }

    return aggregates;
  }

  async getCurrentPeriodUsage(
    customerId: string,
    featureKey: string,
    periodStart: Date
  ): Promise<number> {
    // First check aggregate
    const aggregate = await this.getAggregate(customerId, featureKey, "month", periodStart);
    if (aggregate) {
      return aggregate.totalQuantity;
    }

    // Fall back to counting events
    const events = this.usageEvents.filter(
      (e) =>
        e.customerId === customerId &&
        e.featureKey === featureKey &&
        e.timestamp >= periodStart
    );

    return events.reduce((sum, e) => sum + e.quantity, 0);
  }

  // ============================================================================
  // Alerts
  // ============================================================================

  async createAlert(alert: Omit<UsageAlert, "id" | "createdAt">): Promise<UsageAlert> {
    const usageAlert: UsageAlert = {
      id: generateId(),
      ...alert,
      createdAt: new Date(),
    };

    this.alerts.set(usageAlert.id, usageAlert);
    return usageAlert;
  }

  async getActiveAlerts(customerId: string): Promise<UsageAlert[]> {
    return Array.from(this.alerts.values()).filter(
      (a) =>
        a.customerId === customerId &&
        (a.status === "pending" || a.status === "triggered")
    );
  }

  async updateAlertStatus(alertId: string, status: AlertStatus): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = status;
      if (status === "triggered") {
        alert.triggeredAt = new Date();
      } else if (status === "acknowledged") {
        alert.acknowledgedAt = new Date();
      } else if (status === "resolved") {
        alert.resolvedAt = new Date();
      }
    }
  }

  // ============================================================================
  // Usage Reset
  // ============================================================================

  async resetUsage(
    customerId: string,
    featureKeys?: string[],
    periodStart?: Date
  ): Promise<void> {
    // Remove events for this customer
    this.usageEvents = this.usageEvents.filter((e) => {
      if (e.customerId !== customerId) return true;
      if (featureKeys && !featureKeys.includes(e.featureKey)) return true;
      if (periodStart && e.timestamp < periodStart) return true;
      return false;
    });

    // Reset aggregates
    await this.resetAggregates(customerId, featureKeys);
  }

  async resetAggregates(customerId: string, featureKeys?: string[]): Promise<void> {
    const keysToDelete: string[] = [];

    for (const [key, aggregate] of this.usageAggregates) {
      if (aggregate.customerId !== customerId) continue;
      if (featureKeys && !featureKeys.includes(aggregate.featureKey)) continue;
      keysToDelete.push(key);
    }

    for (const key of keysToDelete) {
      this.usageAggregates.delete(key);
    }
  }

  // ============================================================================
  // Access Status
  // ============================================================================

  async getAccessStatus(customerId: string): Promise<AccessStatusInfo | null> {
    return this.accessStatuses.get(customerId) ?? null;
  }

  async setAccessStatus(customerId: string, status: AccessStatusInfo): Promise<void> {
    this.accessStatuses.set(customerId, status);
  }

  // ============================================================================
  // Billing Cycle
  // ============================================================================

  async getBillingCycle(customerId: string): Promise<{ start: Date; end: Date } | null> {
    return this.billingCycles.get(customerId) ?? null;
  }

  async setBillingCycle(customerId: string, start: Date, end: Date): Promise<void> {
    this.billingCycles.set(customerId, { start, end });
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.plans.clear();
    this.planFeatures.clear();
    this.customerPlans.clear();
    this.usageEvents = [];
    this.usageAggregates.clear();
    this.alerts.clear();
    this.idempotencyKeys.clear();
    this.accessStatuses.clear();
    this.billingCycles.clear();
  }

  /**
   * Get stats (for debugging)
   */
  getStats(): {
    plans: number;
    customers: number;
    events: number;
    aggregates: number;
    alerts: number;
    accessStatuses: number;
    billingCycles: number;
  } {
    return {
      plans: this.plans.size,
      customers: this.customerPlans.size,
      events: this.usageEvents.length,
      aggregates: this.usageAggregates.size,
      alerts: this.alerts.size,
      accessStatuses: this.accessStatuses.size,
      billingCycles: this.billingCycles.size,
    };
  }
}

/**
 * Create in-memory usage storage
 */
export function createMemoryUsageStorage(): MemoryUsageStorage {
  return new MemoryUsageStorage();
}
