/**
 * @parsrun/payments - Usage Database Schema
 * Drizzle ORM schema for usage-based billing tables
 *
 * These tables store:
 * - Plans and features with limits
 * - Customer plan assignments
 * - Usage events and aggregates
 * - Access status and billing cycles
 * - Usage alerts
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// Plans & Features
// ============================================================================

/**
 * Plans table - defines billing plans with tiers
 */
export const plans = pgTable("usage_plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  tier: integer("tier").notNull().default(0), // 0=free, 1=starter, 2=pro, 3=enterprise, 4=custom
  basePrice: integer("base_price").notNull().default(0), // cents
  currency: text("currency").notNull().default("usd"),
  billingInterval: text("billing_interval").notNull().default("month"), // month, year
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Plan features table - defines feature limits for each plan
 */
export const planFeatures = pgTable(
  "usage_plan_features",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(), // "api_calls", "storage_gb", "team_members"
    limitValue: integer("limit_value"), // null = unlimited
    limitPeriod: text("limit_period"), // "hour", "day", "month", null = total
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    planFeatureIdx: uniqueIndex("usage_plan_features_plan_feature_idx").on(
      table.planId,
      table.featureKey
    ),
  })
);

// ============================================================================
// Customer Data
// ============================================================================

/**
 * Customer plans table - maps customers to their current plan
 */
export const customerPlans = pgTable("usage_customer_plans", {
  customerId: text("customer_id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

/**
 * Customer access status table - tracks access status for each customer
 */
export const customerAccessStatus = pgTable("usage_customer_access_status", {
  customerId: text("customer_id").primaryKey(),
  status: text("status").notNull().default("active"), // active, past_due, suspended, canceled, unpaid
  reason: text("reason"),
  suspensionDate: timestamp("suspension_date"),
  failedPaymentAttempts: integer("failed_payment_attempts").default(0),
  gracePeriodEnd: timestamp("grace_period_end"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Customer billing cycles table - tracks billing period for each customer
 */
export const customerBillingCycles = pgTable("usage_customer_billing_cycles", {
  customerId: text("customer_id").primaryKey(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Usage Events & Aggregates
// ============================================================================

/**
 * Usage events table - raw usage event log
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id"),
    featureKey: text("feature_key").notNull(),
    quantity: integer("quantity").notNull().default(1),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key"),
  },
  (table) => ({
    customerIdx: index("usage_events_customer_idx").on(table.customerId),
    featureIdx: index("usage_events_feature_idx").on(table.featureKey),
    timestampIdx: index("usage_events_timestamp_idx").on(table.timestamp),
    idempotencyIdx: uniqueIndex("usage_events_idempotency_idx").on(
      table.idempotencyKey
    ),
    // Composite index for common queries
    customerFeatureTimestampIdx: index(
      "usage_events_customer_feature_timestamp_idx"
    ).on(table.customerId, table.featureKey, table.timestamp),
  })
);

/**
 * Usage aggregates table - pre-computed usage summaries for performance
 */
export const usageAggregates = pgTable(
  "usage_aggregates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id"),
    featureKey: text("feature_key").notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    periodType: text("period_type").notNull(), // "hour", "day", "month"
    totalQuantity: integer("total_quantity").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint for upsert
    lookupIdx: uniqueIndex("usage_aggregates_lookup_idx").on(
      table.customerId,
      table.featureKey,
      table.periodType,
      table.periodStart
    ),
    // Index for customer queries
    customerIdx: index("usage_aggregates_customer_idx").on(table.customerId),
  })
);

// ============================================================================
// Alerts
// ============================================================================

/**
 * Usage alerts table - tracks quota threshold alerts
 */
export const usageAlerts = pgTable(
  "usage_alerts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id"),
    featureKey: text("feature_key").notNull(),
    thresholdPercent: integer("threshold_percent").notNull(), // 80, 100, 120
    status: text("status").notNull().default("pending"), // pending, triggered, acknowledged, resolved
    currentUsage: integer("current_usage").notNull(),
    limit: integer("limit").notNull(),
    triggeredAt: timestamp("triggered_at"),
    acknowledgedAt: timestamp("acknowledged_at"),
    resolvedAt: timestamp("resolved_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    customerIdx: index("usage_alerts_customer_idx").on(table.customerId),
    statusIdx: index("usage_alerts_status_idx").on(table.status),
  })
);

// ============================================================================
// Type Exports
// ============================================================================

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type PlanFeature = typeof planFeatures.$inferSelect;
export type NewPlanFeature = typeof planFeatures.$inferInsert;

export type CustomerPlan = typeof customerPlans.$inferSelect;
export type NewCustomerPlan = typeof customerPlans.$inferInsert;

export type CustomerAccessStatusRow = typeof customerAccessStatus.$inferSelect;
export type NewCustomerAccessStatus = typeof customerAccessStatus.$inferInsert;

export type CustomerBillingCycle = typeof customerBillingCycles.$inferSelect;
export type NewCustomerBillingCycle = typeof customerBillingCycles.$inferInsert;

export type UsageEventRow = typeof usageEvents.$inferSelect;
export type NewUsageEvent = typeof usageEvents.$inferInsert;

export type UsageAggregateRow = typeof usageAggregates.$inferSelect;
export type NewUsageAggregate = typeof usageAggregates.$inferInsert;

export type UsageAlertRow = typeof usageAlerts.$inferSelect;
export type NewUsageAlert = typeof usageAlerts.$inferInsert;
