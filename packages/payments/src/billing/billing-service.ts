/**
 * @parsrun/payments - Billing Service
 * High-level billing API with multi-provider support
 */

import type {
  PaymentProvider,
  PaymentProviderType,
  WebhookEventType,
  WebhookHandler,
} from "../types.js";
import {
  WebhookHandlerRegistry,
  WebhookProcessor,
} from "../webhooks/index.js";
import type { WebhookProcessResult } from "../webhooks/index.js";
import { ProviderStrategy } from "./provider-strategy.js";
import { FallbackExecutor, createDisabledFallback } from "./fallback-executor.js";
import type {
  BillingServiceConfig,
  BillingRegion,
  RegionDetectionContext,
  SubscribeOptions,
  SubscribeResult,
  CancelOptions,
  CancelResult,
  GetSubscriptionOptions,
  BillingSubscription,
  BillingCustomer,
  ProviderSelection,
  BillingLogger,
} from "./types.js";
import { BillingError } from "./types.js";

/**
 * Console logger (default)
 */
const consoleLogger: BillingLogger = {
  debug: (msg, ctx) => console.debug(`[Billing] ${msg}`, ctx ?? ""),
  info: (msg, ctx) => console.info(`[Billing] ${msg}`, ctx ?? ""),
  warn: (msg, ctx) => console.warn(`[Billing] ${msg}`, ctx ?? ""),
  error: (msg, ctx) => console.error(`[Billing] ${msg}`, ctx ?? ""),
};

/**
 * Null logger (disabled)
 */
const nullLogger: BillingLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Billing Service
 *
 * High-level billing API with:
 * - Multi-provider support (Stripe, Paddle, iyzico)
 * - Region-based provider routing
 * - Optional fallback mechanism
 * - Unified webhook handling
 *
 * @example Basic usage
 * ```typescript
 * const billing = createBillingService({
 *   providers: {
 *     default: stripeProvider,
 *     regions: {
 *       TR: iyzicoProvider,
 *       EU: stripeProvider,
 *     },
 *   },
 * });
 *
 * // Subscribe a customer
 * const result = await billing.subscribe({
 *   email: "user@example.com",
 *   planId: "price_xxx",
 *   successUrl: "https://app.com/success",
 *   cancelUrl: "https://app.com/cancel",
 *   countryCode: "TR", // Will use iyzico
 * });
 *
 * // Redirect to checkout
 * redirect(result.checkoutUrl);
 * ```
 *
 * @example With fallback (opt-in)
 * ```typescript
 * const billing = createBillingService({
 *   providers: {
 *     default: stripeProvider,
 *     regions: { TR: iyzicoProvider },
 *   },
 *   fallback: {
 *     enabled: true, // WARNING: Enable with caution
 *     allowedOperations: ["createCheckout"],
 *     maxAttempts: 1,
 *     onFallback: (ctx) => {
 *       logger.warn("Payment fallback triggered", ctx);
 *     },
 *   },
 * });
 * ```
 */
export class BillingService {
  private readonly strategy: ProviderStrategy;
  private readonly fallback: FallbackExecutor;
  private readonly webhookRegistry: WebhookHandlerRegistry;
  private readonly webhookProcessors: Map<PaymentProviderType, WebhookProcessor>;
  private readonly logger: BillingLogger;
  private readonly tenantId: string | undefined;
  private readonly debug: boolean;

  constructor(config: BillingServiceConfig) {
    this.debug = config.debug ?? false;
    this.logger = config.logger ?? (this.debug ? consoleLogger : nullLogger);
    this.tenantId = config.tenantId;

    // Initialize provider strategy
    this.strategy = new ProviderStrategy(config.providers, this.logger);

    // Initialize fallback executor
    this.fallback = config.fallback
      ? new FallbackExecutor(config.fallback, this.logger)
      : createDisabledFallback();

    // Initialize webhook handling
    this.webhookRegistry = new WebhookHandlerRegistry();
    this.webhookProcessors = new Map();

    // Create webhook processor for each provider
    for (const provider of this.strategy.getAllProviders()) {
      const processor = new WebhookProcessor(provider, this.webhookRegistry);
      this.webhookProcessors.set(provider.type, processor);
    }

    this.logger.info("BillingService initialized", {
      providers: this.strategy.getAllProviders().map((p) => p.type),
      regions: this.strategy.getSupportedRegions(),
      fallbackEnabled: this.fallback.isEnabled,
    });
  }

  // ============================================================================
  // High-Level API
  // ============================================================================

  /**
   * Subscribe a customer to a plan
   *
   * This is the recommended way to handle subscriptions:
   * 1. Creates or retrieves customer
   * 2. Selects provider based on region
   * 3. Creates checkout session
   * 4. Returns checkout URL for redirect
   *
   * @example
   * ```typescript
   * const { checkoutUrl } = await billing.subscribe({
   *   email: "user@example.com",
   *   planId: "price_monthly",
   *   successUrl: "https://app.com/success",
   *   cancelUrl: "https://app.com/cancel",
   *   countryCode: "TR",
   * });
   * redirect(checkoutUrl);
   * ```
   */
  async subscribe(options: SubscribeOptions): Promise<SubscribeResult> {
    const context: RegionDetectionContext = {
      email: options.email,
      countryCode: options.countryCode,
      customerId: options.customerId,
    };

    // Select provider
    const selection = await this.strategy.selectProvider(
      context,
      options.forceProvider
    );

    this.logger.info("Starting subscription", {
      email: options.email,
      planId: options.planId,
      provider: selection.type,
      region: selection.region,
    });

    // Get or create customer
    let customerId = options.customerId;
    if (!customerId) {
      const customer = await this.executeWithFallback(
        "createCustomer",
        selection,
        async (provider) => {
          return provider.createCustomer({
            email: options.email,
            name: options.name,
            metadata: {
              ...options.metadata,
              region: selection.region,
              ...(this.tenantId && { tenantId: this.tenantId }),
            },
          });
        }
      );
      customerId = customer.id;
    }

    // Create checkout session
    const checkout = await this.executeWithFallback(
      "createCheckout",
      selection,
      async (provider) => {
        return provider.createCheckout({
          customerId,
          customerEmail: options.email,
          lineItems: [{ priceId: options.planId, quantity: 1 }],
          successUrl: options.successUrl,
          cancelUrl: options.cancelUrl,
          mode: "subscription",
          trialDays: options.trialDays,
          metadata: {
            ...options.metadata,
            region: selection.region,
            ...(this.tenantId && { tenantId: this.tenantId }),
          },
        });
      }
    );

    return {
      checkoutUrl: checkout.url,
      sessionId: checkout.id,
      customerId: customerId!,
      provider: selection.type,
      region: selection.region,
    };
  }

  /**
   * Cancel a subscription
   *
   * @example
   * ```typescript
   * const result = await billing.cancel({
   *   subscriptionId: "sub_xxx",
   *   immediate: false, // Cancel at period end
   * });
   * ```
   */
  async cancel(options: CancelOptions): Promise<CancelResult> {
    // Find the provider that owns this subscription
    const provider = options.provider
      ? this.strategy.getProviderByType(options.provider)
      : await this.findSubscriptionProvider(options.subscriptionId);

    if (!provider) {
      throw new BillingError(
        `Cannot find provider for subscription: ${options.subscriptionId}`,
        "SUBSCRIPTION_NOT_FOUND"
      );
    }

    this.logger.info("Canceling subscription", {
      subscriptionId: options.subscriptionId,
      provider: provider.type,
      immediate: options.immediate,
    });

    const subscription = await provider.cancelSubscription(
      options.subscriptionId,
      !options.immediate // cancelAtPeriodEnd = !immediate
    );

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      endsAt: subscription.cancelAtPeriodEnd
        ? subscription.currentPeriodEnd
        : new Date(),
      provider: provider.type,
    };
  }

  /**
   * Get subscription(s) for a customer
   *
   * @example
   * ```typescript
   * // Get by customer ID
   * const subs = await billing.getSubscriptions({ customerId: "cus_xxx" });
   *
   * // Get specific subscription
   * const sub = await billing.getSubscription({ subscriptionId: "sub_xxx" });
   * ```
   */
  async getSubscriptions(
    options: GetSubscriptionOptions
  ): Promise<BillingSubscription[]> {
    const results: BillingSubscription[] = [];

    // If specific subscription ID provided
    if (options.subscriptionId) {
      const sub = await this.getSubscription(options);
      if (sub) results.push(sub);
      return results;
    }

    // Search across providers
    const providers = options.provider
      ? [this.strategy.getProviderByType(options.provider)].filter(Boolean)
      : this.strategy.getAllProviders();

    for (const provider of providers) {
      if (!provider) continue;

      try {
        if (options.customerId) {
          const subs = await provider.listSubscriptions(options.customerId);
          for (const sub of subs) {
            results.push({ ...sub, provider: provider.type });
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to get subscriptions from ${provider.type}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Get a single subscription
   */
  async getSubscription(
    options: GetSubscriptionOptions
  ): Promise<BillingSubscription | null> {
    if (!options.subscriptionId) {
      const subs = await this.getSubscriptions(options);
      return subs[0] ?? null;
    }

    // Search across providers for the subscription
    const providers = options.provider
      ? [this.strategy.getProviderByType(options.provider)].filter(Boolean)
      : this.strategy.getAllProviders();

    for (const provider of providers) {
      if (!provider) continue;

      try {
        const sub = await provider.getSubscription(options.subscriptionId);
        if (sub) {
          return { ...sub, provider: provider.type };
        }
      } catch {
        // Continue to next provider
      }
    }

    return null;
  }

  /**
   * Get customer by ID
   */
  async getCustomer(
    customerId: string,
    provider?: PaymentProviderType
  ): Promise<BillingCustomer | null> {
    const providers = provider
      ? [this.strategy.getProviderByType(provider)].filter(Boolean)
      : this.strategy.getAllProviders();

    for (const p of providers) {
      if (!p) continue;

      try {
        const customer = await p.getCustomer(customerId);
        if (customer) {
          return { ...customer, provider: p.type };
        }
      } catch {
        // Continue to next provider
      }
    }

    return null;
  }

  /**
   * Create a customer portal session
   */
  async createPortalSession(
    customerId: string,
    returnUrl: string,
    provider?: PaymentProviderType
  ): Promise<{ url: string; provider: PaymentProviderType }> {
    const p = provider
      ? this.strategy.getProviderByType(provider)
      : await this.findCustomerProvider(customerId);

    if (!p) {
      throw new BillingError(
        `Cannot find provider for customer: ${customerId}`,
        "CUSTOMER_NOT_FOUND"
      );
    }

    const session = await p.createPortalSession({ customerId, returnUrl });
    return { url: session.url, provider: p.type };
  }

  // ============================================================================
  // Provider Selection
  // ============================================================================

  /**
   * Select provider for a region/context
   */
  async selectProvider(
    context: RegionDetectionContext,
    forceProvider?: PaymentProviderType
  ): Promise<ProviderSelection> {
    return this.strategy.selectProvider(context, forceProvider);
  }

  /**
   * Get all configured providers
   */
  getProviders(): PaymentProvider[] {
    return this.strategy.getAllProviders();
  }

  /**
   * Get provider by type
   */
  getProvider(type: PaymentProviderType): PaymentProvider | undefined {
    return this.strategy.getProviderByType(type);
  }

  /**
   * Get supported regions
   */
  getSupportedRegions(): BillingRegion[] {
    return this.strategy.getSupportedRegions();
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  /**
   * Register webhook handler for all providers
   *
   * @example
   * ```typescript
   * billing.onWebhook("subscription.created", async (event) => {
   *   console.log(`New subscription from ${event.provider}:`, event.data);
   * });
   *
   * // Handle all events
   * billing.onWebhook("*", async (event) => {
   *   await saveToAuditLog(event);
   * });
   * ```
   */
  onWebhook(type: WebhookEventType | "*", handler: WebhookHandler): this {
    this.webhookRegistry.on(type, handler);
    return this;
  }

  /**
   * Handle webhook request
   *
   * @example
   * ```typescript
   * app.post("/webhooks/:provider", async (c) => {
   *   const provider = c.req.param("provider") as PaymentProviderType;
   *   const result = await billing.handleWebhook(c.req.raw, provider);
   *   return c.json({ received: result.success });
   * });
   * ```
   */
  async handleWebhook(
    request: Request,
    provider: PaymentProviderType
  ): Promise<WebhookProcessResult> {
    const processor = this.webhookProcessors.get(provider);
    if (!processor) {
      this.logger.error(`No webhook processor for provider: ${provider}`);
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
      };
    }

    return processor.process(request);
  }

  /**
   * Handle raw webhook payload
   */
  async handleWebhookRaw(
    payload: string | Uint8Array,
    signature: string,
    provider: PaymentProviderType
  ): Promise<WebhookProcessResult> {
    const processor = this.webhookProcessors.get(provider);
    if (!processor) {
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
      };
    }

    return processor.processRaw(payload, signature);
  }

  // ============================================================================
  // Low-Level Provider Access
  // ============================================================================

  /**
   * Execute operation on specific provider
   *
   * Use this for advanced operations not covered by high-level API
   *
   * @example
   * ```typescript
   * const prices = await billing.withProvider("stripe", async (provider) => {
   *   return provider.listPrices?.("prod_xxx") ?? [];
   * });
   * ```
   */
  async withProvider<T>(
    type: PaymentProviderType,
    operation: (provider: PaymentProvider) => Promise<T>
  ): Promise<T> {
    const provider = this.strategy.getProviderByType(type);
    if (!provider) {
      throw new BillingError(
        `Provider not configured: ${type}`,
        "NO_PROVIDER_CONFIGURED",
        type
      );
    }
    return operation(provider);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Execute operation with fallback support
   */
  private async executeWithFallback<T>(
    operation: "createCustomer" | "createCheckout" | "createSubscription" | "createPayment",
    selection: ProviderSelection,
    execute: (provider: PaymentProvider) => Promise<T>
  ): Promise<T> {
    // Get fallback providers (exclude primary)
    const fallbackProviders = this.strategy
      .getAllProviders()
      .filter((p) => p !== selection.provider);

    const result = await this.fallback.execute(
      operation,
      selection.provider,
      fallbackProviders,
      execute
    );

    if (result.usedFallback) {
      this.logger.warn(`Operation used fallback provider`, {
        operation,
        original: selection.type,
        fallback: result.provider.type,
      });
    }

    return result.result;
  }

  /**
   * Find which provider owns a subscription
   */
  private async findSubscriptionProvider(
    subscriptionId: string
  ): Promise<PaymentProvider | undefined> {
    for (const provider of this.strategy.getAllProviders()) {
      try {
        const sub = await provider.getSubscription(subscriptionId);
        if (sub) return provider;
      } catch {
        // Continue searching
      }
    }
    return undefined;
  }

  /**
   * Find which provider owns a customer
   */
  private async findCustomerProvider(
    customerId: string
  ): Promise<PaymentProvider | undefined> {
    for (const provider of this.strategy.getAllProviders()) {
      try {
        const customer = await provider.getCustomer(customerId);
        if (customer) return provider;
      } catch {
        // Continue searching
      }
    }
    return undefined;
  }
}

/**
 * Create billing service
 *
 * @example
 * ```typescript
 * import { createBillingService, createStripeProvider, createIyzicoProvider } from "@parsrun/payments";
 *
 * const stripeProvider = createStripeProvider({
 *   secretKey: process.env.STRIPE_SECRET_KEY!,
 *   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
 * });
 *
 * const iyzicoProvider = createIyzicoProvider({
 *   apiKey: process.env.IYZICO_API_KEY!,
 *   secretKey: process.env.IYZICO_SECRET_KEY!,
 *   baseUrl: "https://api.iyzipay.com",
 * });
 *
 * const billing = createBillingService({
 *   providers: {
 *     default: stripeProvider,
 *     regions: {
 *       TR: iyzicoProvider,
 *       EU: stripeProvider,
 *       US: stripeProvider,
 *     },
 *   },
 *   fallback: {
 *     enabled: false, // Disabled by default - enable with caution!
 *   },
 *   debug: process.env.NODE_ENV === "development",
 * });
 *
 * export { billing };
 * ```
 */
export function createBillingService(config: BillingServiceConfig): BillingService {
  return new BillingService(config);
}
