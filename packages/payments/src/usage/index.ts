/**
 * @parsrun/payments - Usage Module
 * Usage-based billing with quota management
 */

// Types
export * from "./types.js";

// Storage - In-Memory (for development/testing)
export { MemoryUsageStorage, createMemoryUsageStorage } from "./memory-storage.js";

// Storage - Drizzle (for production)
export {
  DrizzleUsageStorage,
  createDrizzleUsageStorage,
} from "./drizzle-storage.js";
export type {
  DrizzleDb,
  DrizzleUsageStorageConfig,
} from "./drizzle-storage.js";

// Database Schema (Drizzle tables)
export * as usageSchema from "./schema.js";

// Quota Manager
export { QuotaManager, createQuotaManager } from "./quota-manager.js";

// Usage Tracker
export { UsageTracker, createUsageTracker } from "./usage-tracker.js";
export type { UsageTrackerConfig } from "./usage-tracker.js";

// Lifecycle Hooks
export { SubscriptionLifecycle, createSubscriptionLifecycle } from "./lifecycle-hooks.js";

// Usage Service
export { UsageService, createUsageService } from "./usage-service.js";

// Billing Integration
export {
  BillingIntegration,
  integrateBillingWithUsage,
  createBillingIntegration,
} from "./billing-integration.js";
export type { BillingIntegrationConfig } from "./billing-integration.js";

// Usage Meter (Provider Sync)
export {
  UsageMeter,
  createUsageMeter,
  SubscriptionItemResolver,
  createSubscriptionItemResolver,
} from "./usage-meter.js";
export type {
  UsageRecord,
  UsageReporter,
  SyncStrategy,
  UsageMeterConfig,
  SubscriptionItemMapping,
  SubscriptionItemResolverConfig,
} from "./usage-meter.js";
