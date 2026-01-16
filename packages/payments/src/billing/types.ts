/**
 * @parsrun/payments - Billing Types
 * Types for multi-provider billing service
 */

import type {
  PaymentProvider,
  PaymentProviderType,
  Customer,
  Subscription,
} from "../types.js";

// ============================================================================
// Region & Routing
// ============================================================================

/**
 * Supported regions for provider routing
 */
export type BillingRegion =
  | "TR"  // Turkey
  | "EU"  // European Union
  | "US"  // United States
  | "UK"  // United Kingdom
  | "APAC" // Asia Pacific
  | "LATAM" // Latin America
  | "GLOBAL" // Default/fallback
  | string; // Custom regions

/**
 * Region detection result
 */
export interface RegionDetectionResult {
  /** Detected region code */
  region: BillingRegion;
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode?: string;
  /** Detection method used */
  method: "ip" | "customer" | "explicit" | "default";
  /** Confidence level */
  confidence: "high" | "medium" | "low";
}

/**
 * Region detector function type
 */
export type RegionDetector = (
  context: RegionDetectionContext
) => BillingRegion | Promise<BillingRegion>;

/**
 * Context for region detection
 */
export interface RegionDetectionContext {
  /** Customer ID if available */
  customerId?: string | undefined;
  /** Customer email */
  email?: string | undefined;
  /** Explicit country code */
  countryCode?: string | undefined;
  /** IP address */
  ipAddress?: string | undefined;
  /** Request headers */
  headers?: Record<string, string> | undefined;
  /** Custom context data */
  custom?: Record<string, unknown> | undefined;
}

// ============================================================================
// Provider Strategy
// ============================================================================

/**
 * Provider routing rule
 */
export interface ProviderRoutingRule {
  /** Regions this rule applies to */
  regions: BillingRegion[];
  /** Provider to use */
  provider: PaymentProvider;
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Rule condition (optional) */
  condition?: (context: RegionDetectionContext) => boolean;
}

/**
 * Provider strategy configuration
 */
export interface ProviderStrategyConfig {
  /** Default provider (used when no region matches) */
  default: PaymentProvider;

  /**
   * Region-based provider mapping
   * @example { TR: iyzicoProvider, EU: stripeProvider }
   */
  regions?: Record<BillingRegion, PaymentProvider>;

  /**
   * Advanced routing rules (takes precedence over regions)
   */
  rules?: ProviderRoutingRule[];

  /**
   * Custom region detector
   * Default: uses countryCode from context or "GLOBAL"
   */
  regionDetector?: RegionDetector;
}

// ============================================================================
// Fallback Configuration
// ============================================================================

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /**
   * Enable fallback to alternative providers
   * @default false
   *
   * WARNING: Enable with caution! Fallback may cause:
   * - Double charges if not handled properly
   * - Inconsistent customer records across providers
   * - Webhook handling complexity
   *
   * Recommended only for:
   * - One-time payments (not subscriptions)
   * - Idempotent operations
   * - When you have proper reconciliation in place
   */
  enabled: boolean;

  /**
   * Fallback providers in order of preference
   * If not specified, uses all configured providers except the failed one
   */
  providers?: PaymentProvider[];

  /**
   * Operations that allow fallback
   * @default ["createCheckout"] - Only checkout is safe by default
   */
  allowedOperations?: FallbackOperation[];

  /**
   * Maximum fallback attempts
   * @default 1
   */
  maxAttempts?: number;

  /**
   * Errors that should trigger fallback
   * @default ["API_ERROR", "RATE_LIMITED", "PROVIDER_UNAVAILABLE"]
   */
  retryableErrors?: string[];

  /**
   * Callback when fallback is triggered
   */
  onFallback?: (context: FallbackContext) => void | Promise<void>;

  /**
   * Callback when all providers fail
   */
  onAllFailed?: (context: FallbackContext) => void | Promise<void>;
}

/**
 * Operations that can trigger fallback
 */
export type FallbackOperation =
  | "createCheckout"
  | "createCustomer"
  | "createSubscription"
  | "createPayment";

/**
 * Fallback context for callbacks
 */
export interface FallbackContext {
  /** Operation that failed */
  operation: FallbackOperation;
  /** Original provider that failed */
  originalProvider: PaymentProviderType;
  /** Fallback provider being tried */
  fallbackProvider?: PaymentProviderType;
  /** Error that triggered fallback */
  error: Error;
  /** Attempt number */
  attempt: number;
  /** Total attempts made */
  totalAttempts: number;
  /** Whether all providers failed */
  allFailed: boolean;
}

// ============================================================================
// Billing Service Configuration
// ============================================================================

/**
 * Billing service configuration
 */
export interface BillingServiceConfig {
  /**
   * Provider strategy configuration
   */
  providers: ProviderStrategyConfig;

  /**
   * Fallback configuration
   * @default { enabled: false }
   */
  fallback?: FallbackConfig;

  /**
   * Tenant ID for multi-tenant setups
   */
  tenantId?: string;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom logger
   */
  logger?: BillingLogger;

  /**
   * Webhook configuration
   */
  webhooks?: {
    /**
     * Normalize events from all providers to unified format
     * @default true
     */
    normalize?: boolean;

    /**
     * Secret keys for each provider
     */
    secrets?: Partial<Record<PaymentProviderType, string>>;
  };
}

/**
 * Logger interface for billing service
 */
export interface BillingLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

// ============================================================================
// High-Level Billing API Types
// ============================================================================

/**
 * Subscribe options (high-level)
 */
export interface SubscribeOptions {
  /** Customer email */
  email: string;
  /** Customer name */
  name?: string;
  /** Plan/Price ID */
  planId: string;
  /** Success redirect URL */
  successUrl: string;
  /** Cancel redirect URL */
  cancelUrl: string;
  /** Trial days */
  trialDays?: number;
  /** Country code for region routing */
  countryCode?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
  /**
   * Existing customer ID (skip customer creation)
   */
  customerId?: string;
  /**
   * Force specific provider (bypass region routing)
   */
  forceProvider?: PaymentProviderType;
}

/**
 * Subscribe result
 */
export interface SubscribeResult {
  /** Checkout URL to redirect user */
  checkoutUrl: string;
  /** Checkout session ID */
  sessionId: string;
  /** Customer ID (created or existing) */
  customerId: string;
  /** Provider used */
  provider: PaymentProviderType;
  /** Region detected */
  region: BillingRegion;
}

/**
 * Cancel subscription options
 */
export interface CancelOptions {
  /** Subscription ID */
  subscriptionId: string;
  /** Cancel immediately or at period end */
  immediate?: boolean;
  /** Reason for cancellation */
  reason?: string;
  /** Provider (if known, for faster lookup) */
  provider?: PaymentProviderType;
}

/**
 * Cancel result
 */
export interface CancelResult {
  /** Subscription ID */
  subscriptionId: string;
  /** New status */
  status: string;
  /** When subscription will end */
  endsAt: Date;
  /** Provider used */
  provider: PaymentProviderType;
}

/**
 * Get subscription options
 */
export interface GetSubscriptionOptions {
  /** Customer ID */
  customerId?: string;
  /** Customer email (alternative to customerId) */
  email?: string;
  /** Specific subscription ID */
  subscriptionId?: string;
  /** Provider hint */
  provider?: PaymentProviderType;
}

/**
 * Subscription with provider info
 */
export interface BillingSubscription extends Subscription {
  /** Provider that manages this subscription */
  provider: PaymentProviderType;
}

/**
 * Customer with provider info
 */
export interface BillingCustomer extends Customer {
  /** Provider that manages this customer */
  provider: PaymentProviderType;
  /** Region */
  region?: BillingRegion;
}

// ============================================================================
// Provider Selection Result
// ============================================================================

/**
 * Provider selection result
 */
export interface ProviderSelection {
  /** Selected provider */
  provider: PaymentProvider;
  /** Provider type */
  type: PaymentProviderType;
  /** Region used for selection */
  region: BillingRegion;
  /** Selection reason */
  reason: "region" | "rule" | "default" | "forced" | "fallback";
}

// ============================================================================
// Billing Errors
// ============================================================================

/**
 * Billing error codes
 */
export const BillingErrorCodes = {
  NO_PROVIDER_CONFIGURED: "NO_PROVIDER_CONFIGURED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  ALL_PROVIDERS_FAILED: "ALL_PROVIDERS_FAILED",
  REGION_NOT_SUPPORTED: "REGION_NOT_SUPPORTED",
  SUBSCRIPTION_NOT_FOUND: "SUBSCRIPTION_NOT_FOUND",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  FALLBACK_DISABLED: "FALLBACK_DISABLED",
  OPERATION_NOT_ALLOWED: "OPERATION_NOT_ALLOWED",
} as const;

export type BillingErrorCode = keyof typeof BillingErrorCodes;

/**
 * Billing error
 */
export class BillingError extends Error {
  constructor(
    message: string,
    public readonly code: BillingErrorCode,
    public readonly provider?: PaymentProviderType,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "BillingError";
  }
}
