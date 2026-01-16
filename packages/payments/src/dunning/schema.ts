/**
 * @parsrun/payments - Dunning Database Schema
 * Drizzle ORM schema for dunning automation tables
 *
 * These tables store:
 * - Dunning sequences and steps
 * - Dunning states for active processes
 * - Payment failures
 * - Executed steps history
 * - Scheduled steps for automation
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
// Dunning Sequences
// ============================================================================

/**
 * Dunning sequences table - defines dunning workflows
 */
export const dunningSequences = pgTable("dunning_sequences", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  maxDurationDays: integer("max_duration_days").notNull().default(28),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  planTier: integer("plan_tier"), // null = default for all, otherwise specific tier
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Dunning steps table - defines steps within sequences
 */
export const dunningSteps = pgTable(
  "dunning_steps",
  {
    id: text("id").primaryKey(),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => dunningSequences.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stepOrder: integer("step_order").notNull(), // Order within sequence
    daysAfterFailure: integer("days_after_failure").notNull().default(0),
    hoursOffset: integer("hours_offset"), // Hour of day to execute (0-23)
    actions: jsonb("actions").$type<string[]>().notNull().default([]), // Array of action types
    notificationChannels: jsonb("notification_channels").$type<string[]>(), // email, sms, in_app, webhook, push
    notificationTemplateId: text("notification_template_id"),
    accessLevel: text("access_level"), // full, limited, read_only, none
    isFinal: boolean("is_final").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    sequenceOrderIdx: uniqueIndex("dunning_steps_sequence_order_idx").on(
      table.sequenceId,
      table.stepOrder
    ),
    sequenceIdx: index("dunning_steps_sequence_idx").on(table.sequenceId),
  })
);

// ============================================================================
// Payment Failures
// ============================================================================

/**
 * Payment failures table - records all payment failures
 */
export const paymentFailures = pgTable(
  "dunning_payment_failures",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    invoiceId: text("invoice_id"),
    amount: integer("amount").notNull(), // cents
    currency: text("currency").notNull().default("usd"),
    category: text("category").notNull(), // card_declined, insufficient_funds, etc.
    errorCode: text("error_code").notNull(),
    errorMessage: text("error_message").notNull(),
    provider: text("provider").notNull(), // stripe, paddle, iyzico
    failedAt: timestamp("failed_at").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at"),
    isRecoverable: boolean("is_recoverable").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    customerIdx: index("dunning_payment_failures_customer_idx").on(table.customerId),
    subscriptionIdx: index("dunning_payment_failures_subscription_idx").on(
      table.subscriptionId
    ),
    failedAtIdx: index("dunning_payment_failures_failed_at_idx").on(table.failedAt),
    categoryIdx: index("dunning_payment_failures_category_idx").on(table.category),
  })
);

// ============================================================================
// Dunning States
// ============================================================================

/**
 * Dunning states table - tracks active dunning processes
 */
export const dunningStates = pgTable(
  "dunning_states",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => dunningSequences.id),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    currentStepId: text("current_step_id").notNull(),
    status: text("status").notNull().default("active"), // active, recovered, exhausted, canceled, paused
    initialFailureId: text("initial_failure_id")
      .notNull()
      .references(() => paymentFailures.id),
    failureIds: jsonb("failure_ids").$type<string[]>().notNull().default([]), // All failure IDs
    startedAt: timestamp("started_at").notNull(),
    lastStepAt: timestamp("last_step_at"),
    nextStepAt: timestamp("next_step_at"),
    endedAt: timestamp("ended_at"),
    endReason: text("end_reason"), // payment_recovered, max_retries, manually_canceled, subscription_canceled
    totalRetryAttempts: integer("total_retry_attempts").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    customerIdx: uniqueIndex("dunning_states_customer_idx").on(table.customerId),
    statusIdx: index("dunning_states_status_idx").on(table.status),
    nextStepIdx: index("dunning_states_next_step_idx").on(table.nextStepAt),
    subscriptionIdx: index("dunning_states_subscription_idx").on(table.subscriptionId),
  })
);

// ============================================================================
// Executed Steps
// ============================================================================

/**
 * Executed steps table - history of executed dunning steps
 */
export const executedSteps = pgTable(
  "dunning_executed_steps",
  {
    id: text("id").primaryKey(),
    dunningStateId: text("dunning_state_id")
      .notNull()
      .references(() => dunningStates.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    stepName: text("step_name").notNull(),
    executedAt: timestamp("executed_at").notNull(),
    actionsTaken: jsonb("actions_taken").$type<string[]>().notNull().default([]),
    paymentRetried: boolean("payment_retried").notNull().default(false),
    paymentSucceeded: boolean("payment_succeeded"),
    notificationsSent: jsonb("notifications_sent").$type<string[]>().notNull().default([]),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => ({
    stateIdx: index("dunning_executed_steps_state_idx").on(table.dunningStateId),
    executedAtIdx: index("dunning_executed_steps_executed_at_idx").on(table.executedAt),
  })
);

// ============================================================================
// Scheduled Steps
// ============================================================================

/**
 * Scheduled steps table - steps pending execution
 */
export const scheduledSteps = pgTable(
  "dunning_scheduled_steps",
  {
    id: text("id").primaryKey(),
    dunningStateId: text("dunning_state_id")
      .notNull()
      .references(() => dunningStates.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    scheduledAt: timestamp("scheduled_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    stateStepIdx: uniqueIndex("dunning_scheduled_steps_state_step_idx").on(
      table.dunningStateId,
      table.stepId
    ),
    scheduledAtIdx: index("dunning_scheduled_steps_scheduled_at_idx").on(
      table.scheduledAt
    ),
  })
);

// ============================================================================
// Dunning Events Log
// ============================================================================

/**
 * Dunning events table - audit log for all dunning events
 */
export const dunningEvents = pgTable(
  "dunning_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // dunning.started, dunning.step_executed, etc.
    customerId: text("customer_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    dunningStateId: text("dunning_state_id")
      .notNull()
      .references(() => dunningStates.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    typeIdx: index("dunning_events_type_idx").on(table.type),
    customerIdx: index("dunning_events_customer_idx").on(table.customerId),
    timestampIdx: index("dunning_events_timestamp_idx").on(table.timestamp),
    stateIdx: index("dunning_events_state_idx").on(table.dunningStateId),
  })
);

// ============================================================================
// Retry Strategies (Optional - for custom strategies)
// ============================================================================

/**
 * Custom retry strategies table - overrides for default strategies
 */
export const retryStrategies = pgTable(
  "dunning_retry_strategies",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull().unique(), // failure category
    shouldRetry: boolean("should_retry").notNull().default(true),
    initialDelayHours: integer("initial_delay_hours").notNull().default(24),
    maxRetries: integer("max_retries").notNull().default(4),
    backoffMultiplier: integer("backoff_multiplier").notNull().default(2), // stored as x100 for decimals
    maxDelayHours: integer("max_delay_hours").notNull().default(168),
    optimalRetryHours: jsonb("optimal_retry_hours").$type<number[]>(),
    optimalRetryDays: jsonb("optimal_retry_days").$type<number[]>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    categoryIdx: uniqueIndex("dunning_retry_strategies_category_idx").on(table.category),
  })
);

// ============================================================================
// Type Exports
// ============================================================================

export type DunningSequenceRow = typeof dunningSequences.$inferSelect;
export type NewDunningSequence = typeof dunningSequences.$inferInsert;

export type DunningStepRow = typeof dunningSteps.$inferSelect;
export type NewDunningStep = typeof dunningSteps.$inferInsert;

export type PaymentFailureRow = typeof paymentFailures.$inferSelect;
export type NewPaymentFailure = typeof paymentFailures.$inferInsert;

export type DunningStateRow = typeof dunningStates.$inferSelect;
export type NewDunningState = typeof dunningStates.$inferInsert;

export type ExecutedStepRow = typeof executedSteps.$inferSelect;
export type NewExecutedStep = typeof executedSteps.$inferInsert;

export type ScheduledStepRow = typeof scheduledSteps.$inferSelect;
export type NewScheduledStep = typeof scheduledSteps.$inferInsert;

export type DunningEventRow = typeof dunningEvents.$inferSelect;
export type NewDunningEvent = typeof dunningEvents.$inferInsert;

export type RetryStrategyRow = typeof retryStrategies.$inferSelect;
export type NewRetryStrategy = typeof retryStrategies.$inferInsert;

// ============================================================================
// Schema Export
// ============================================================================

/**
 * All dunning schema tables
 */
export const dunningSchema = {
  dunningSequences,
  dunningSteps,
  paymentFailures,
  dunningStates,
  executedSteps,
  scheduledSteps,
  dunningEvents,
  retryStrategies,
};
