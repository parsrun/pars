/**
 * @module
 * Edge-compatible payment processing for Pars.
 *
 * Supports multiple providers:
 * - Stripe
 * - Paddle
 *
 * @example
 * ```typescript
 * import { createPaymentService, createStripeProvider } from '@parsrun/payments';
 *
 * const payments = createPaymentService({
 *   provider: createStripeProvider({
 *     secretKey: process.env.STRIPE_SECRET_KEY,
 *     webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
 *   }),
 * });
 *
 * // Create checkout session
 * const checkout = await payments.createCheckout({
 *   lineItems: [{ priceId: 'price_xxx', quantity: 1 }],
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 *   mode: 'subscription',
 * });
 *
 * // Handle webhooks
 * app.post('/webhooks/stripe', async (c) => {
 *   const result = await payments.handleWebhook(c.req.raw);
 *   return c.json({ received: result.success });
 * });
 * ```
 */

// Re-export types
export * from "./types.js";

// Re-export providers
export { StripeProvider, createStripeProvider } from "./providers/stripe.js";
export { PaddleProvider, createPaddleProvider } from "./providers/paddle.js";
export { IyzicoProvider, createIyzicoProvider } from "./providers/iyzico.js";
export type {
  IyzicoProviderConfig,
  IyzicoBasketItem,
  IyzicoBuyer,
  IyzicoAddress,
  IyzicoCheckoutOptions,
  IyzicoCheckoutResult,
  IyzicoPaymentResult,
  IyzicoThreeDSInitResult,
  IyzicoRefundResult,
  IyzicoCancelResult,
  IyzicoInstallmentResult,
} from "./providers/iyzico.js";

// Re-export webhooks
export {
  WebhookHandlerRegistry,
  WebhookProcessor,
  createWebhookProcessor,
  createWebhookHandlerRegistry,
  createWebhookHandler,
} from "./webhooks/index.js";
export type { WebhookProcessResult } from "./webhooks/index.js";

import type {
  CheckoutSession,
  CreateCheckoutOptions,
  CreateCustomerOptions,
  CreatePortalOptions,
  CreateSubscriptionOptions,
  Customer,
  PaymentProvider,
  PaymentServiceConfig,
  PortalSession,
  Price,
  Product,
  Subscription,
  UpdateSubscriptionOptions,
  WebhookEvent,
  WebhookEventType,
  WebhookHandler,
} from "./types.js";
import {
  WebhookHandlerRegistry,
  WebhookProcessor,
} from "./webhooks/index.js";
import type { WebhookProcessResult } from "./webhooks/index.js";

/**
 * Payment Service
 * High-level payment service with provider abstraction
 */
export class PaymentService {
  private provider: PaymentProvider;
  private webhookProcessor: WebhookProcessor;
  private debug: boolean;

  constructor(config: PaymentServiceConfig) {
    this.provider = config.provider;
    this.debug = config.debug ?? false;
    this.webhookProcessor = new WebhookProcessor(
      this.provider,
      new WebhookHandlerRegistry()
    );
  }

  /**
   * Get provider type
   */
  get providerType(): string {
    return this.provider.type;
  }

  /**
   * Get webhook handler registry
   */
  get webhooks(): WebhookHandlerRegistry {
    return this.webhookProcessor.handlers;
  }

  // ============================================================================
  // Customer
  // ============================================================================

  /**
   * Create a customer
   */
  async createCustomer(options: CreateCustomerOptions): Promise<Customer> {
    if (this.debug) {
      console.log("[Payments] Creating customer:", options.email);
    }

    return this.provider.createCustomer(options);
  }

  /**
   * Get a customer by ID
   */
  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.provider.getCustomer(customerId);
  }

  /**
   * Update a customer
   */
  async updateCustomer(
    customerId: string,
    options: Partial<CreateCustomerOptions>
  ): Promise<Customer> {
    return this.provider.updateCustomer(customerId, options);
  }

  /**
   * Delete a customer
   */
  async deleteCustomer(customerId: string): Promise<void> {
    return this.provider.deleteCustomer(customerId);
  }

  // ============================================================================
  // Checkout
  // ============================================================================

  /**
   * Create a checkout session
   */
  async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
    if (this.debug) {
      console.log("[Payments] Creating checkout:", {
        mode: options.mode,
        items: options.lineItems.length,
      });
    }

    return this.provider.createCheckout(options);
  }

  /**
   * Get a checkout session
   */
  async getCheckout(sessionId: string): Promise<CheckoutSession | null> {
    return this.provider.getCheckout(sessionId);
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Create a subscription
   */
  async createSubscription(options: CreateSubscriptionOptions): Promise<Subscription> {
    if (this.debug) {
      console.log("[Payments] Creating subscription:", {
        customerId: options.customerId,
        priceId: options.priceId,
      });
    }

    return this.provider.createSubscription(options);
  }

  /**
   * Get a subscription
   */
  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    return this.provider.getSubscription(subscriptionId);
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    subscriptionId: string,
    options: UpdateSubscriptionOptions
  ): Promise<Subscription> {
    return this.provider.updateSubscription(subscriptionId, options);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd = true
  ): Promise<Subscription> {
    if (this.debug) {
      console.log("[Payments] Canceling subscription:", {
        subscriptionId,
        cancelAtPeriodEnd,
      });
    }

    return this.provider.cancelSubscription(subscriptionId, cancelAtPeriodEnd);
  }

  /**
   * List subscriptions for a customer
   */
  async listSubscriptions(customerId: string): Promise<Subscription[]> {
    return this.provider.listSubscriptions(customerId);
  }

  // ============================================================================
  // Portal
  // ============================================================================

  /**
   * Create a customer portal session
   */
  async createPortalSession(options: CreatePortalOptions): Promise<PortalSession> {
    return this.provider.createPortalSession(options);
  }

  // ============================================================================
  // Products & Prices
  // ============================================================================

  /**
   * Get a product
   */
  async getProduct(productId: string): Promise<Product | null> {
    if (this.provider.getProduct) {
      return this.provider.getProduct(productId);
    }
    return null;
  }

  /**
   * Get a price
   */
  async getPrice(priceId: string): Promise<Price | null> {
    if (this.provider.getPrice) {
      return this.provider.getPrice(priceId);
    }
    return null;
  }

  /**
   * List prices
   */
  async listPrices(productId?: string): Promise<Price[]> {
    if (this.provider.listPrices) {
      return this.provider.listPrices(productId);
    }
    return [];
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  /**
   * Register a webhook handler
   */
  onWebhook(type: WebhookEventType | "*", handler: WebhookHandler): this {
    this.webhookProcessor.handlers.on(type, handler);
    return this;
  }

  /**
   * Handle a webhook request
   */
  async handleWebhook(request: Request): Promise<WebhookProcessResult> {
    return this.webhookProcessor.process(request);
  }

  /**
   * Handle raw webhook payload
   */
  async handleWebhookRaw(
    payload: string | Uint8Array,
    signature: string
  ): Promise<WebhookProcessResult> {
    return this.webhookProcessor.processRaw(payload, signature);
  }

  /**
   * Verify a webhook (without handling)
   */
  async verifyWebhook(
    payload: string | Uint8Array,
    signature: string
  ): Promise<WebhookEvent | null> {
    return this.provider.verifyWebhook(payload, signature);
  }
}

/**
 * Create a payment service
 *
 * @example
 * ```typescript
 * // With Stripe
 * const payments = createPaymentService({
 *   provider: createStripeProvider({
 *     secretKey: process.env.STRIPE_SECRET_KEY,
 *     webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
 *   }),
 * });
 *
 * // With Paddle
 * const payments = createPaymentService({
 *   provider: createPaddleProvider({
 *     apiKey: process.env.PADDLE_API_KEY,
 *     environment: 'sandbox',
 *     webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
 *   }),
 * });
 * ```
 */
export function createPaymentService(config: PaymentServiceConfig): PaymentService {
  return new PaymentService(config);
}

// Re-export billing module - values
export {
  BillingService,
  createBillingService,
  ProviderStrategy,
  createProviderStrategy,
  FallbackExecutor,
  createFallbackExecutor,
  createDisabledFallback,
  BillingError,
  BillingErrorCodes,
} from "./billing/index.js";

// Re-export billing module - types
export type {
  BillingRegion,
  RegionDetectionResult,
  RegionDetector,
  RegionDetectionContext,
  ProviderRoutingRule,
  ProviderStrategyConfig,
  FallbackConfig,
  FallbackOperation,
  FallbackContext,
  BillingServiceConfig,
  BillingLogger,
  SubscribeOptions,
  SubscribeResult,
  CancelOptions,
  CancelResult,
  GetSubscriptionOptions,
  BillingSubscription,
  BillingCustomer,
  ProviderSelection,
  BillingErrorCode,
} from "./billing/index.js";

// Re-export usage module - values
export {
  UsageService,
  createUsageService,
  UsageTracker,
  createUsageTracker,
  QuotaManager,
  createQuotaManager,
  SubscriptionLifecycle,
  createSubscriptionLifecycle,
  // Storage - In-Memory (dev/testing)
  MemoryUsageStorage,
  createMemoryUsageStorage,
  // Storage - Drizzle (production)
  DrizzleUsageStorage,
  createDrizzleUsageStorage,
  // Database Schema
  usageSchema,
  // Errors
  UsageError,
  QuotaExceededError,
  UsageErrorCodes,
  // Billing Integration
  BillingIntegration,
  integrateBillingWithUsage,
  createBillingIntegration,
  // Usage Meter (Provider Sync)
  UsageMeter,
  createUsageMeter,
  SubscriptionItemResolver,
  createSubscriptionItemResolver,
} from "./usage/index.js";

// Re-export usage module - types
export type {
  UsageStorage,
  UsageServiceConfig,
  QuotaManagerConfig,
  UsageTrackerConfig,
  Plan,
  PlanFeature,
  PlanTier,
  LimitPeriod,
  UsageEvent,
  TrackUsageOptions,
  UsageAggregate,
  PeriodType,
  GetUsageOptions,
  QuotaStatus,
  QuotaCheckResult,
  UsageAlert,
  AlertStatus,
  SubscriptionEventType,
  SubscriptionEvent,
  SubscriptionHandler,
  UsageWebhookEventType,
  UsageErrorCode,
  BillingIntegrationConfig,
  // Usage Meter types
  UsageRecord,
  UsageReporter,
  SyncStrategy,
  UsageMeterConfig,
  SubscriptionItemMapping,
  SubscriptionItemResolverConfig,
  // Reset & Access Status types
  ResetPeriod,
  AccessStatus,
  AccessStatusInfo,
  // Drizzle Storage types
  DrizzleDb,
  DrizzleUsageStorageConfig,
} from "./usage/index.js";

// Re-export dunning module - values
export {
  // Manager
  DunningManager,
  createDunningManager,
  createDefaultDunningConfig,
  // Scheduler
  DunningScheduler,
  createDunningScheduler,
  createDunningCronHandler,
  createDunningEdgeHandler,
  // Sequences
  DunningStepBuilder,
  DunningSequenceBuilder,
  step as dunningStep,
  sequence as dunningSequence,
  standardSaasSequence,
  aggressiveSequence,
  lenientSequence,
  minimalSequence,
  defaultSequences,
  getSequenceByTier,
  // Payment Retry
  PaymentRetryCalculator,
  PaymentRetrier,
  createPaymentRetryCalculator,
  createPaymentRetrier,
  defaultRetryStrategies,
  stripeErrorCodes,
  paddleErrorCodes,
  iyzicoErrorCodes,
  allErrorCodeMappings,
  // Storage - Memory (dev/testing)
  MemoryDunningStorage,
  createMemoryDunningStorage,
  // Storage - Drizzle (production)
  DrizzleDunningStorage,
  createDrizzleDunningStorage,
  // Database Schema
  dunningSchema,
} from "./dunning/index.js";

// Re-export dunning module - types
export type {
  // Core types
  PaymentFailureCategory,
  PaymentFailure,
  DunningAction,
  NotificationChannel,
  DunningStep,
  DunningSequence,
  DunningStatus,
  DunningState,
  ExecutedStep,
  DunningContext,
  RetryStrategy,
  RetryResult,
  DunningNotification,
  NotificationResult,
  DunningEventType,
  DunningEvent,
  DunningEventHandler,
  DunningManagerConfig,
  DunningLogger,
  DunningStorage,
  // Scheduler types
  DunningSchedulerConfig,
  // Retry types
  ErrorCodeMapping,
  PaymentRetrierConfig,
  // Drizzle types
  DrizzleDunningStorageConfig,
  // Schema row types
  DunningSequenceRow,
  NewDunningSequence,
  DunningStepRow,
  NewDunningStep,
  PaymentFailureRow,
  NewPaymentFailure,
  DunningStateRow,
  NewDunningState,
  ExecutedStepRow,
  NewExecutedStep,
  ScheduledStepRow,
  NewScheduledStep,
  DunningEventRow,
  NewDunningEvent,
  RetryStrategyRow,
  NewRetryStrategy,
} from "./dunning/index.js";

// Import for default export
import { BillingService, createBillingService } from "./billing/index.js";
import { UsageService, createUsageService } from "./usage/index.js";
import { DunningManager, createDunningManager } from "./dunning/index.js";

// Default export
export default {
  PaymentService,
  createPaymentService,
  BillingService,
  createBillingService,
  UsageService,
  createUsageService,
  DunningManager,
  createDunningManager,
};
