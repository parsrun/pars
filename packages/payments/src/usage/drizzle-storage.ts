/**
 * @parsrun/payments - Drizzle Usage Storage
 * Database-backed storage implementation using Drizzle ORM
 *
 * @example
 * ```typescript
 * import { createDrizzleUsageStorage } from "@parsrun/payments";
 * import { drizzle } from "drizzle-orm/postgres-js";
 * import postgres from "postgres";
 *
 * const client = postgres(process.env.DATABASE_URL);
 * const db = drizzle(client);
 *
 * const storage = createDrizzleUsageStorage({ db });
 *
 * const usageService = createUsageService({ storage });
 * ```
 */

import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

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
  LimitPeriod,
  BillingInterval,
  PlanTier,
} from "./types.js";

import {
  plans,
  planFeatures,
  customerPlans,
  customerAccessStatus,
  customerBillingCycles,
  usageEvents,
  usageAggregates,
  usageAlerts,
} from "./schema.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported Drizzle database types
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrizzleDb = PostgresJsDatabase<any> | NeonHttpDatabase<any>;

/**
 * Drizzle storage configuration
 */
export interface DrizzleUsageStorageConfig {
  /** Drizzle database instance */
  db: DrizzleDb;

  /** Table prefix (optional, for multi-tenant setups) */
  tablePrefix?: string;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// Drizzle Usage Storage
// ============================================================================

/**
 * Drizzle-backed usage storage
 * Persists all usage data to PostgreSQL/Neon database
 */
export class DrizzleUsageStorage implements UsageStorage {
  private readonly db: DrizzleDb;

  constructor(config: DrizzleUsageStorageConfig) {
    this.db = config.db;
  }

  // ============================================================================
  // Plans
  // ============================================================================

  async getPlan(planId: string): Promise<Plan | null> {
    const rows = await this.db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const features = await this.getPlanFeatures(planId);

    return this.mapRowToPlan(row, features);
  }

  async getPlanByName(name: string): Promise<Plan | null> {
    const rows = await this.db
      .select()
      .from(plans)
      .where(eq(plans.name, name))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const features = await this.getPlanFeatures(row.id);

    return this.mapRowToPlan(row, features);
  }

  async listPlans(options?: { activeOnly?: boolean }): Promise<Plan[]> {
    let query = this.db.select().from(plans);

    if (options?.activeOnly) {
      query = query.where(eq(plans.isActive, true)) as typeof query;
    }

    const rows = await query;

    // Fetch features for all plans
    const result: Plan[] = [];
    for (const row of rows) {
      const features = await this.getPlanFeatures(row.id);
      result.push(this.mapRowToPlan(row, features));
    }

    return result;
  }

  private mapRowToPlan(
    row: typeof plans.$inferSelect,
    features: PlanFeature[]
  ): Plan {
    const plan: Plan = {
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      description: row.description,
      tier: row.tier as PlanTier,
      basePrice: row.basePrice,
      currency: row.currency,
      billingInterval: row.billingInterval as BillingInterval,
      features,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    if (row.metadata !== null) {
      plan.metadata = row.metadata;
    }

    return plan;
  }

  // ============================================================================
  // Plan Features
  // ============================================================================

  async getPlanFeatures(planId: string): Promise<PlanFeature[]> {
    const rows = await this.db
      .select()
      .from(planFeatures)
      .where(eq(planFeatures.planId, planId));

    return rows.map((row) => this.mapRowToPlanFeature(row));
  }

  async getFeatureLimit(
    planId: string,
    featureKey: string
  ): Promise<PlanFeature | null> {
    const rows = await this.db
      .select()
      .from(planFeatures)
      .where(
        and(
          eq(planFeatures.planId, planId),
          eq(planFeatures.featureKey, featureKey)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return this.mapRowToPlanFeature(row);
  }

  private mapRowToPlanFeature(
    row: typeof planFeatures.$inferSelect
  ): PlanFeature {
    const feature: PlanFeature = {
      id: row.id,
      planId: row.planId,
      featureKey: row.featureKey,
      limitValue: row.limitValue,
      limitPeriod: row.limitPeriod as LimitPeriod,
      isEnabled: row.isEnabled,
    };

    if (row.metadata !== null) {
      feature.metadata = row.metadata;
    }

    return feature;
  }

  // ============================================================================
  // Customer-Plan Mapping
  // ============================================================================

  async getCustomerPlanId(customerId: string): Promise<string | null> {
    const rows = await this.db
      .select({ planId: customerPlans.planId })
      .from(customerPlans)
      .where(eq(customerPlans.customerId, customerId))
      .limit(1);

    const row = rows[0];
    return row ? row.planId : null;
  }

  async setCustomerPlanId(customerId: string, planId: string): Promise<void> {
    await this.db
      .insert(customerPlans)
      .values({
        customerId,
        planId,
        assignedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerPlans.customerId,
        set: {
          planId,
          assignedAt: new Date(),
        },
      });
  }

  // ============================================================================
  // Usage Events
  // ============================================================================

  async recordUsage(event: Omit<UsageEvent, "id">): Promise<UsageEvent> {
    const id = generateId();

    // Check idempotency
    if (event.idempotencyKey) {
      const existing = await this.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.idempotencyKey, event.idempotencyKey))
        .limit(1);

      const existingRow = existing[0];
      if (existingRow) {
        return this.mapRowToUsageEvent(existingRow);
      }
    }

    const insertData: typeof usageEvents.$inferInsert = {
      id,
      tenantId: event.tenantId,
      customerId: event.customerId,
      featureKey: event.featureKey,
      quantity: event.quantity,
      timestamp: event.timestamp ?? new Date(),
    };

    if (event.subscriptionId !== undefined) {
      insertData.subscriptionId = event.subscriptionId;
    }
    if (event.metadata !== undefined) {
      insertData.metadata = event.metadata;
    }
    if (event.idempotencyKey !== undefined) {
      insertData.idempotencyKey = event.idempotencyKey;
    }

    await this.db.insert(usageEvents).values(insertData);

    return {
      id,
      ...event,
      timestamp: event.timestamp ?? new Date(),
    };
  }

  async recordUsageBatch(
    events: Omit<UsageEvent, "id">[]
  ): Promise<UsageEvent[]> {
    const results: UsageEvent[] = [];
    for (const event of events) {
      results.push(await this.recordUsage(event));
    }
    return results;
  }

  async getUsageEvents(
    customerId: string,
    options: GetUsageOptions
  ): Promise<UsageEvent[]> {
    const conditions = [eq(usageEvents.customerId, customerId)];

    if (options.featureKey) {
      conditions.push(eq(usageEvents.featureKey, options.featureKey));
    }
    if (options.subscriptionId) {
      conditions.push(eq(usageEvents.subscriptionId, options.subscriptionId));
    }
    if (options.startDate) {
      conditions.push(gte(usageEvents.timestamp, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(usageEvents.timestamp, options.endDate));
    }

    const rows = await this.db
      .select()
      .from(usageEvents)
      .where(and(...conditions))
      .orderBy(usageEvents.timestamp);

    return rows.map((row) => this.mapRowToUsageEvent(row));
  }

  private mapRowToUsageEvent(
    row: typeof usageEvents.$inferSelect
  ): UsageEvent {
    const event: UsageEvent = {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      featureKey: row.featureKey,
      quantity: row.quantity,
      timestamp: row.timestamp,
    };

    if (row.subscriptionId !== null) {
      event.subscriptionId = row.subscriptionId;
    }
    if (row.metadata !== null) {
      event.metadata = row.metadata;
    }
    if (row.idempotencyKey !== null) {
      event.idempotencyKey = row.idempotencyKey;
    }

    return event;
  }

  // ============================================================================
  // Usage Aggregates
  // ============================================================================

  async getAggregate(
    customerId: string,
    featureKey: string,
    periodType: PeriodType,
    periodStart: Date
  ): Promise<UsageAggregate | null> {
    const rows = await this.db
      .select()
      .from(usageAggregates)
      .where(
        and(
          eq(usageAggregates.customerId, customerId),
          eq(usageAggregates.featureKey, featureKey),
          eq(usageAggregates.periodType, periodType),
          eq(usageAggregates.periodStart, periodStart)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return this.mapRowToUsageAggregate(row);
  }

  async upsertAggregate(
    aggregate: Omit<UsageAggregate, "id">
  ): Promise<UsageAggregate> {
    const id = generateId();

    const insertData: typeof usageAggregates.$inferInsert = {
      id,
      tenantId: aggregate.tenantId,
      customerId: aggregate.customerId,
      featureKey: aggregate.featureKey,
      periodStart: aggregate.periodStart,
      periodEnd: aggregate.periodEnd,
      periodType: aggregate.periodType,
      totalQuantity: aggregate.totalQuantity,
      eventCount: aggregate.eventCount,
      lastUpdated: new Date(),
    };

    if (aggregate.subscriptionId !== undefined) {
      insertData.subscriptionId = aggregate.subscriptionId;
    }

    await this.db
      .insert(usageAggregates)
      .values(insertData)
      .onConflictDoUpdate({
        target: [
          usageAggregates.customerId,
          usageAggregates.featureKey,
          usageAggregates.periodType,
          usageAggregates.periodStart,
        ],
        set: {
          totalQuantity: aggregate.totalQuantity,
          eventCount: aggregate.eventCount,
          lastUpdated: new Date(),
        },
      });

    return {
      id,
      ...aggregate,
      lastUpdated: new Date(),
    };
  }

  async getAggregates(
    customerId: string,
    options: GetUsageOptions
  ): Promise<UsageAggregate[]> {
    const conditions = [eq(usageAggregates.customerId, customerId)];

    if (options.featureKey) {
      conditions.push(eq(usageAggregates.featureKey, options.featureKey));
    }
    if (options.periodType) {
      conditions.push(eq(usageAggregates.periodType, options.periodType));
    }
    if (options.subscriptionId) {
      conditions.push(
        eq(usageAggregates.subscriptionId, options.subscriptionId)
      );
    }
    if (options.startDate) {
      conditions.push(gte(usageAggregates.periodStart, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(usageAggregates.periodEnd, options.endDate));
    }

    const rows = await this.db
      .select()
      .from(usageAggregates)
      .where(and(...conditions))
      .orderBy(usageAggregates.periodStart);

    return rows.map((row) => this.mapRowToUsageAggregate(row));
  }

  async getCurrentPeriodUsage(
    customerId: string,
    featureKey: string,
    periodStart: Date
  ): Promise<number> {
    // First check aggregate
    const aggregate = await this.getAggregate(
      customerId,
      featureKey,
      "month",
      periodStart
    );

    if (aggregate) {
      return aggregate.totalQuantity;
    }

    // Fall back to summing events
    const result = await this.db
      .select({
        total: sql<number>`COALESCE(SUM(${usageEvents.quantity}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.customerId, customerId),
          eq(usageEvents.featureKey, featureKey),
          gte(usageEvents.timestamp, periodStart)
        )
      );

    return Number(result[0]?.total ?? 0);
  }

  private mapRowToUsageAggregate(
    row: typeof usageAggregates.$inferSelect
  ): UsageAggregate {
    const aggregate: UsageAggregate = {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      featureKey: row.featureKey,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      periodType: row.periodType as PeriodType,
      totalQuantity: row.totalQuantity,
      eventCount: row.eventCount,
      lastUpdated: row.lastUpdated,
    };

    if (row.subscriptionId !== null) {
      aggregate.subscriptionId = row.subscriptionId;
    }

    return aggregate;
  }

  // ============================================================================
  // Alerts
  // ============================================================================

  async createAlert(
    alert: Omit<UsageAlert, "id" | "createdAt">
  ): Promise<UsageAlert> {
    const id = generateId();
    const createdAt = new Date();

    const insertData: typeof usageAlerts.$inferInsert = {
      id,
      tenantId: alert.tenantId,
      customerId: alert.customerId,
      featureKey: alert.featureKey,
      thresholdPercent: alert.thresholdPercent,
      status: alert.status,
      currentUsage: alert.currentUsage,
      limit: alert.limit,
      createdAt,
    };

    if (alert.subscriptionId !== undefined) {
      insertData.subscriptionId = alert.subscriptionId;
    }
    if (alert.triggeredAt !== undefined) {
      insertData.triggeredAt = alert.triggeredAt;
    }
    if (alert.acknowledgedAt !== undefined) {
      insertData.acknowledgedAt = alert.acknowledgedAt;
    }
    if (alert.resolvedAt !== undefined) {
      insertData.resolvedAt = alert.resolvedAt;
    }
    if (alert.metadata !== undefined) {
      insertData.metadata = alert.metadata;
    }

    await this.db.insert(usageAlerts).values(insertData);

    return {
      id,
      ...alert,
      createdAt,
    };
  }

  async getActiveAlerts(customerId: string): Promise<UsageAlert[]> {
    const rows = await this.db
      .select()
      .from(usageAlerts)
      .where(
        and(
          eq(usageAlerts.customerId, customerId),
          inArray(usageAlerts.status, ["pending", "triggered"])
        )
      );

    return rows.map((row) => this.mapRowToUsageAlert(row));
  }

  async updateAlertStatus(alertId: string, status: AlertStatus): Promise<void> {
    const updateData: Partial<typeof usageAlerts.$inferInsert> = { status };

    if (status === "triggered") {
      updateData.triggeredAt = new Date();
    } else if (status === "acknowledged") {
      updateData.acknowledgedAt = new Date();
    } else if (status === "resolved") {
      updateData.resolvedAt = new Date();
    }

    await this.db
      .update(usageAlerts)
      .set(updateData)
      .where(eq(usageAlerts.id, alertId));
  }

  private mapRowToUsageAlert(row: typeof usageAlerts.$inferSelect): UsageAlert {
    const alert: UsageAlert = {
      id: row.id,
      tenantId: row.tenantId,
      customerId: row.customerId,
      featureKey: row.featureKey,
      thresholdPercent: row.thresholdPercent,
      status: row.status as AlertStatus,
      currentUsage: row.currentUsage,
      limit: row.limit,
      createdAt: row.createdAt,
    };

    if (row.subscriptionId !== null) {
      alert.subscriptionId = row.subscriptionId;
    }
    if (row.triggeredAt !== null) {
      alert.triggeredAt = row.triggeredAt;
    }
    if (row.acknowledgedAt !== null) {
      alert.acknowledgedAt = row.acknowledgedAt;
    }
    if (row.resolvedAt !== null) {
      alert.resolvedAt = row.resolvedAt;
    }
    if (row.metadata !== null) {
      alert.metadata = row.metadata;
    }

    return alert;
  }

  // ============================================================================
  // Usage Reset
  // ============================================================================

  async resetUsage(
    customerId: string,
    featureKeys?: string[],
    periodStart?: Date
  ): Promise<void> {
    // Build conditions
    const eventConditions = [eq(usageEvents.customerId, customerId)];
    const aggregateConditions = [eq(usageAggregates.customerId, customerId)];

    if (featureKeys && featureKeys.length > 0) {
      eventConditions.push(inArray(usageEvents.featureKey, featureKeys));
      aggregateConditions.push(
        inArray(usageAggregates.featureKey, featureKeys)
      );
    }

    if (periodStart) {
      eventConditions.push(gte(usageEvents.timestamp, periodStart));
      aggregateConditions.push(gte(usageAggregates.periodStart, periodStart));
    }

    // Delete events
    await this.db.delete(usageEvents).where(and(...eventConditions));

    // Delete aggregates
    await this.db.delete(usageAggregates).where(and(...aggregateConditions));
  }

  async resetAggregates(
    customerId: string,
    featureKeys?: string[]
  ): Promise<void> {
    const conditions = [eq(usageAggregates.customerId, customerId)];

    if (featureKeys && featureKeys.length > 0) {
      conditions.push(inArray(usageAggregates.featureKey, featureKeys));
    }

    await this.db.delete(usageAggregates).where(and(...conditions));
  }

  // ============================================================================
  // Access Status
  // ============================================================================

  async getAccessStatus(customerId: string): Promise<AccessStatusInfo | null> {
    const rows = await this.db
      .select()
      .from(customerAccessStatus)
      .where(eq(customerAccessStatus.customerId, customerId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const status: AccessStatusInfo = {
      status: row.status as AccessStatusInfo["status"],
      updatedAt: row.updatedAt,
    };

    if (row.reason !== null) {
      status.reason = row.reason;
    }
    if (row.suspensionDate !== null) {
      status.suspensionDate = row.suspensionDate;
    }
    if (row.failedPaymentAttempts !== null) {
      status.failedPaymentAttempts = row.failedPaymentAttempts;
    }
    if (row.gracePeriodEnd !== null) {
      status.gracePeriodEnd = row.gracePeriodEnd;
    }

    return status;
  }

  async setAccessStatus(
    customerId: string,
    status: AccessStatusInfo
  ): Promise<void> {
    const insertData: typeof customerAccessStatus.$inferInsert = {
      customerId,
      status: status.status,
      updatedAt: status.updatedAt,
    };

    if (status.reason !== undefined) {
      insertData.reason = status.reason;
    }
    if (status.suspensionDate !== undefined) {
      insertData.suspensionDate = status.suspensionDate;
    }
    if (status.failedPaymentAttempts !== undefined) {
      insertData.failedPaymentAttempts = status.failedPaymentAttempts;
    }
    if (status.gracePeriodEnd !== undefined) {
      insertData.gracePeriodEnd = status.gracePeriodEnd;
    }

    await this.db
      .insert(customerAccessStatus)
      .values(insertData)
      .onConflictDoUpdate({
        target: customerAccessStatus.customerId,
        set: {
          status: status.status,
          reason: status.reason ?? null,
          suspensionDate: status.suspensionDate ?? null,
          failedPaymentAttempts: status.failedPaymentAttempts ?? null,
          gracePeriodEnd: status.gracePeriodEnd ?? null,
          updatedAt: status.updatedAt,
        },
      });
  }

  // ============================================================================
  // Billing Cycle
  // ============================================================================

  async getBillingCycle(
    customerId: string
  ): Promise<{ start: Date; end: Date } | null> {
    const rows = await this.db
      .select()
      .from(customerBillingCycles)
      .where(eq(customerBillingCycles.customerId, customerId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      start: row.periodStart,
      end: row.periodEnd,
    };
  }

  async setBillingCycle(
    customerId: string,
    start: Date,
    end: Date
  ): Promise<void> {
    await this.db
      .insert(customerBillingCycles)
      .values({
        customerId,
        periodStart: start,
        periodEnd: end,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customerBillingCycles.customerId,
        set: {
          periodStart: start,
          periodEnd: end,
          updatedAt: new Date(),
        },
      });
  }

  // ============================================================================
  // Admin Methods (for setup)
  // ============================================================================

  /**
   * Create or update a plan
   */
  async upsertPlan(plan: Omit<Plan, "createdAt" | "updatedAt">): Promise<Plan> {
    const now = new Date();

    await this.db
      .insert(plans)
      .values({
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        description: plan.description,
        tier: plan.tier,
        basePrice: plan.basePrice,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        isActive: plan.isActive,
        metadata: plan.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: plan.name,
          displayName: plan.displayName,
          description: plan.description,
          tier: plan.tier,
          basePrice: plan.basePrice,
          currency: plan.currency,
          billingInterval: plan.billingInterval,
          isActive: plan.isActive,
          metadata: plan.metadata,
          updatedAt: now,
        },
      });

    // Delete existing features and insert new ones
    await this.db
      .delete(planFeatures)
      .where(eq(planFeatures.planId, plan.id));

    for (const feature of plan.features) {
      await this.db.insert(planFeatures).values({
        id: feature.id || generateId(),
        planId: plan.id,
        featureKey: feature.featureKey,
        limitValue: feature.limitValue,
        limitPeriod: feature.limitPeriod,
        isEnabled: feature.isEnabled,
        metadata: feature.metadata,
      });
    }

    return {
      ...plan,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Delete a plan
   */
  async deletePlan(planId: string): Promise<void> {
    // Features are cascade deleted
    await this.db.delete(plans).where(eq(plans.id, planId));
  }
}

/**
 * Create Drizzle-backed usage storage
 */
export function createDrizzleUsageStorage(
  config: DrizzleUsageStorageConfig
): DrizzleUsageStorage {
  return new DrizzleUsageStorage(config);
}
