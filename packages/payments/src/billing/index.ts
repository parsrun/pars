/**
 * @parsrun/payments - Billing Module
 * Multi-provider billing with region routing and fallback
 */

// Main service
export { BillingService, createBillingService } from "./billing-service.js";

// Provider strategy
export { ProviderStrategy, createProviderStrategy } from "./provider-strategy.js";

// Fallback
export {
  FallbackExecutor,
  createFallbackExecutor,
  createDisabledFallback,
} from "./fallback-executor.js";

// Types
export {
  // Region & Routing
  type BillingRegion,
  type RegionDetectionResult,
  type RegionDetector,
  type RegionDetectionContext,
  type ProviderRoutingRule,
  type ProviderStrategyConfig,

  // Fallback
  type FallbackConfig,
  type FallbackOperation,
  type FallbackContext,

  // Service config
  type BillingServiceConfig,
  type BillingLogger,

  // High-level API
  type SubscribeOptions,
  type SubscribeResult,
  type CancelOptions,
  type CancelResult,
  type GetSubscriptionOptions,
  type BillingSubscription,
  type BillingCustomer,
  type ProviderSelection,

  // Errors
  BillingError,
  BillingErrorCodes,
  type BillingErrorCode,
} from "./types.js";
