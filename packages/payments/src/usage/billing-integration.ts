/**
 * @parsrun/payments - Billing Integration
 * Connects BillingService webhooks to UsageService lifecycle
 */

import type { WebhookEvent, PaymentProviderType } from "../types.js";
import type { BillingService } from "../billing/billing-service.js";
import type { UsageService } from "./usage-service.js";
import type { SubscriptionEvent, Plan, BillingLogger } from "./types.js";

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
 * Billing integration configuration
 */
export interface BillingIntegrationConfig {
  /** Billing service instance */
  billing: BillingService;

  /** Usage service instance */
  usage: UsageService;

  /** Logger */
  logger?: BillingLogger;

  /** Auto-initialize customer plan on subscription creation */
  autoInitializePlan?: boolean;

  /**
   * Auto-reset quotas on subscription renewal
   * Default: true (uses UsageService.autoResetOnRenewal setting)
   */
  autoResetOnRenewal?: boolean;

  /**
   * Auto-update access status based on payment events
   * Default: true
   */
  autoManageAccessStatus?: boolean;

  /** Plan ID resolver - maps payment provider price IDs to internal plan IDs */
  resolvePlanId?: (priceId: string, provider: PaymentProviderType) => string | Promise<string>;

  /** Custom event handlers */
  onSubscriptionCreated?: (event: SubscriptionEvent) => void | Promise<void>;
  onSubscriptionCanceled?: (event: SubscriptionEvent) => void | Promise<void>;
  onSubscriptionRenewed?: (event: SubscriptionEvent) => void | Promise<void>;
  onPlanChanged?: (event: SubscriptionEvent) => void | Promise<void>;
  onPaymentFailed?: (event: SubscriptionEvent) => void | Promise<void>;
}

/**
 * Billing Integration
 *
 * Connects BillingService webhooks to UsageService lifecycle events.
 * This enables automatic:
 * - Customer plan initialization on subscription creation
 * - Plan updates when subscription changes
 * - Usage reset on subscription renewal
 * - Lifecycle event emission
 *
 * @example
 * ```typescript
 * import { createBillingService, createUsageService, integrateBillingWithUsage } from "@parsrun/payments";
 *
 * const billing = createBillingService({
 *   providers: { default: stripeProvider },
 * });
 *
 * const usage = createUsageService({
 *   storage: createMemoryUsageStorage(),
 * });
 *
 * // Connect them
 * const integration = integrateBillingWithUsage({
 *   billing,
 *   usage,
 *   autoInitializePlan: true,
 *   resolvePlanId: (priceId) => {
 *     // Map Stripe price IDs to your internal plan IDs
 *     const mapping: Record<string, string> = {
 *       "price_starter": "starter",
 *       "price_pro": "pro",
 *       "price_enterprise": "enterprise",
 *     };
 *     return mapping[priceId] ?? "free";
 *   },
 * });
 *
 * // Now subscription webhooks automatically update usage quotas
 * ```
 */
export class BillingIntegration {
  private readonly billing: BillingService;
  private readonly usage: UsageService;
  private readonly logger: BillingLogger;
  private readonly autoInitializePlan: boolean;
  private readonly autoResetOnRenewal: boolean;
  private readonly autoManageAccessStatus: boolean;
  private readonly resolvePlanId: (priceId: string, provider: PaymentProviderType) => string | Promise<string>;
  private readonly config: BillingIntegrationConfig;

  constructor(config: BillingIntegrationConfig) {
    this.billing = config.billing;
    this.usage = config.usage;
    this.logger = config.logger ?? nullLogger;
    this.autoInitializePlan = config.autoInitializePlan ?? true;
    this.autoResetOnRenewal = config.autoResetOnRenewal ?? true;
    this.autoManageAccessStatus = config.autoManageAccessStatus ?? true;
    this.resolvePlanId = config.resolvePlanId ?? ((priceId) => priceId);
    this.config = config;

    // Register webhook handlers
    this.setupWebhookHandlers();
  }

  /**
   * Setup webhook handlers on billing service
   */
  private setupWebhookHandlers(): void {
    // Subscription created
    this.billing.onWebhook("subscription.created", async (event) => {
      await this.handleSubscriptionCreated(event);
    });

    // Subscription updated (plan change)
    this.billing.onWebhook("subscription.updated", async (event) => {
      await this.handleSubscriptionUpdated(event);
    });

    // Subscription deleted (canceled)
    this.billing.onWebhook("subscription.deleted", async (event) => {
      await this.handleSubscriptionCanceled(event);
    });

    // Invoice paid (renewal)
    this.billing.onWebhook("invoice.paid", async (event) => {
      await this.handleInvoicePaid(event);
    });

    // Payment failed
    this.billing.onWebhook("invoice.payment_failed", async (event) => {
      await this.handlePaymentFailed(event);
    });

    this.logger.info("Billing integration initialized");
  }

  /**
   * Handle subscription created webhook
   */
  private async handleSubscriptionCreated(event: WebhookEvent): Promise<void> {
    const subscription = event.data as {
      id: string;
      customerId: string;
      status: string;
      priceId?: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
    };

    this.logger.info("Subscription created", {
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      provider: event.provider,
    });

    // Initialize customer plan if enabled
    if (this.autoInitializePlan && subscription.priceId) {
      const planId = await this.resolvePlanId(subscription.priceId, event.provider);
      await this.usage.setCustomerPlan(subscription.customerId, planId);

      this.logger.debug("Customer plan initialized", {
        customerId: subscription.customerId,
        planId,
      });
    }

    // Set billing cycle for billing_cycle reset period
    if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
      await this.usage.setBillingCycle(
        subscription.customerId,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd
      );
    }

    // Initialize access status
    if (this.autoManageAccessStatus) {
      await this.usage.setAccessStatus(subscription.customerId, "active", {
        reason: "Subscription created",
      });
    }

    // Get plan for event
    const plan = subscription.priceId
      ? await this.usage.getPlan(await this.resolvePlanId(subscription.priceId, event.provider))
      : null;

    // Emit lifecycle event - build with only defined optional properties
    const lifecycleEvent: SubscriptionEvent = {
      type: "subscription.created",
      subscription: {
        id: subscription.id,
        customerId: subscription.customerId,
        status: subscription.status as "active" | "canceled" | "past_due" | "trialing" | "paused" | "incomplete",
        priceId: subscription.priceId ?? "",
        currentPeriodStart: subscription.currentPeriodStart ?? new Date(),
        currentPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
        cancelAtPeriodEnd: false,
        provider: event.provider,
      },
      timestamp: new Date(),
      provider: event.provider,
    };

    if (plan !== null) {
      lifecycleEvent.newPlan = plan;
    }

    await this.usage.lifecycleManager.emit(lifecycleEvent);

    // Custom handler
    if (this.config.onSubscriptionCreated) {
      await this.config.onSubscriptionCreated(lifecycleEvent);
    }
  }

  /**
   * Handle subscription updated webhook
   */
  private async handleSubscriptionUpdated(event: WebhookEvent): Promise<void> {
    const subscription = event.data as {
      id: string;
      customerId: string;
      status: string;
      priceId?: string;
      previousPriceId?: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
    };

    this.logger.info("Subscription updated", {
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      provider: event.provider,
    });

    // Check if plan changed
    const priceChanged = subscription.priceId !== subscription.previousPriceId;

    let previousPlan: Plan | null = null;
    let newPlan: Plan | null = null;

    if (priceChanged && subscription.priceId) {
      // Get previous plan
      if (subscription.previousPriceId) {
        const previousPlanId = await this.resolvePlanId(subscription.previousPriceId, event.provider);
        previousPlan = await this.usage.getPlan(previousPlanId);
      }

      // Update customer plan
      const newPlanId = await this.resolvePlanId(subscription.priceId, event.provider);
      await this.usage.setCustomerPlan(subscription.customerId, newPlanId);
      newPlan = await this.usage.getPlan(newPlanId);

      this.logger.info("Customer plan changed", {
        customerId: subscription.customerId,
        previousPlanId: previousPlan?.id,
        newPlanId,
      });
    }

    // Emit lifecycle event - build with only defined optional properties
    const eventType = priceChanged ? "subscription.plan_changed" : "subscription.updated";
    const lifecycleEvent: SubscriptionEvent = {
      type: eventType,
      subscription: {
        id: subscription.id,
        customerId: subscription.customerId,
        status: subscription.status as "active" | "canceled" | "past_due" | "trialing" | "paused" | "incomplete",
        priceId: subscription.priceId ?? "",
        currentPeriodStart: subscription.currentPeriodStart ?? new Date(),
        currentPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
        cancelAtPeriodEnd: false,
        provider: event.provider,
      },
      timestamp: new Date(),
      provider: event.provider,
    };

    if (previousPlan !== null) {
      lifecycleEvent.previousPlan = previousPlan;
    }
    if (newPlan !== null) {
      lifecycleEvent.newPlan = newPlan;
    }

    await this.usage.lifecycleManager.emit(lifecycleEvent);

    // Custom handler for plan change
    if (priceChanged && this.config.onPlanChanged) {
      await this.config.onPlanChanged(lifecycleEvent);
    }
  }

  /**
   * Handle subscription canceled webhook
   */
  private async handleSubscriptionCanceled(event: WebhookEvent): Promise<void> {
    const subscription = event.data as {
      id: string;
      customerId: string;
      status: string;
      priceId?: string;
      currentPeriodEnd?: Date;
    };

    this.logger.info("Subscription canceled", {
      subscriptionId: subscription.id,
      customerId: subscription.customerId,
      provider: event.provider,
    });

    // Update access status to canceled
    if (this.autoManageAccessStatus) {
      await this.usage.setAccessStatus(subscription.customerId, "canceled", {
        reason: "Subscription canceled",
      });
    }

    // Get current plan before removing
    const currentPlan = await this.usage.getCustomerPlan(subscription.customerId);

    // Emit lifecycle event - build with only defined optional properties
    const lifecycleEvent: SubscriptionEvent = {
      type: "subscription.canceled",
      subscription: {
        id: subscription.id,
        customerId: subscription.customerId,
        status: "canceled",
        priceId: subscription.priceId ?? "",
        currentPeriodStart: new Date(),
        currentPeriodEnd: subscription.currentPeriodEnd ?? new Date(),
        cancelAtPeriodEnd: true,
        provider: event.provider,
      },
      timestamp: new Date(),
      provider: event.provider,
    };

    if (currentPlan !== null) {
      lifecycleEvent.previousPlan = currentPlan;
    }

    await this.usage.lifecycleManager.emit(lifecycleEvent);

    // Custom handler
    if (this.config.onSubscriptionCanceled) {
      await this.config.onSubscriptionCanceled(lifecycleEvent);
    }
  }

  /**
   * Handle invoice paid webhook (renewal)
   */
  private async handleInvoicePaid(event: WebhookEvent): Promise<void> {
    const invoice = event.data as {
      id: string;
      customerId: string;
      subscriptionId?: string;
      billingReason?: string;
      periodStart?: Date;
      periodEnd?: Date;
    };

    // Only handle subscription renewals, not initial payments
    if (invoice.billingReason !== "subscription_cycle") {
      return;
    }

    this.logger.info("Subscription renewed", {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      subscriptionId: invoice.subscriptionId,
      provider: event.provider,
    });

    // Update billing cycle
    if (invoice.periodStart && invoice.periodEnd) {
      await this.usage.setBillingCycle(
        invoice.customerId,
        invoice.periodStart,
        invoice.periodEnd
      );
    }

    // Auto-reset quotas on renewal if enabled
    if (this.autoResetOnRenewal && this.usage.autoResetEnabled) {
      this.logger.info("Auto-resetting quotas on renewal", {
        customerId: invoice.customerId,
      });
      await this.usage.resetUsage(invoice.customerId);
    }

    // Restore access status if payment succeeded
    if (this.autoManageAccessStatus) {
      await this.usage.handlePaymentSuccess(invoice.customerId);
    }

    // Get current plan
    const currentPlan = await this.usage.getCustomerPlan(invoice.customerId);

    // Emit lifecycle event - build with only defined optional properties
    const periodStart = invoice.periodStart ?? new Date();
    const periodEnd = invoice.periodEnd ?? new Date();

    const lifecycleEvent: SubscriptionEvent = {
      type: "subscription.renewed",
      subscription: {
        id: invoice.subscriptionId ?? invoice.id,
        customerId: invoice.customerId,
        status: "active",
        priceId: "",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        provider: event.provider,
      },
      timestamp: new Date(),
      provider: event.provider,
    };

    if (currentPlan !== null) {
      lifecycleEvent.newPlan = currentPlan;
    }

    await this.usage.lifecycleManager.emit(lifecycleEvent);

    // Custom handler
    if (this.config.onSubscriptionRenewed) {
      await this.config.onSubscriptionRenewed(lifecycleEvent);
    }
  }

  /**
   * Handle payment failed webhook
   */
  private async handlePaymentFailed(event: WebhookEvent): Promise<void> {
    const invoice = event.data as {
      id: string;
      customerId: string;
      subscriptionId?: string;
    };

    this.logger.warn("Payment failed", {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      subscriptionId: invoice.subscriptionId,
      provider: event.provider,
    });

    // Update access status based on payment failure
    if (this.autoManageAccessStatus) {
      await this.usage.handlePaymentFailure(invoice.customerId);
    }

    // Get current plan
    const currentPlan = await this.usage.getCustomerPlan(invoice.customerId);

    // Emit lifecycle event - build with only defined optional properties
    const lifecycleEvent: SubscriptionEvent = {
      type: "subscription.payment_failed",
      subscription: {
        id: invoice.subscriptionId ?? invoice.id,
        customerId: invoice.customerId,
        status: "past_due",
        priceId: "",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        provider: event.provider,
      },
      timestamp: new Date(),
      provider: event.provider,
    };

    if (currentPlan !== null) {
      lifecycleEvent.newPlan = currentPlan;
    }

    await this.usage.lifecycleManager.emit(lifecycleEvent);

    // Custom handler
    if (this.config.onPaymentFailed) {
      await this.config.onPaymentFailed(lifecycleEvent);
    }
  }

  /**
   * Manually sync customer plan from billing provider
   */
  async syncCustomerPlan(customerId: string, provider?: PaymentProviderType): Promise<Plan | null> {
    // Get subscriptions from billing - build options with only defined properties
    const subscriptionOptions: { customerId: string; provider?: PaymentProviderType } = {
      customerId,
    };
    if (provider !== undefined) {
      subscriptionOptions.provider = provider;
    }
    const subscriptions = await this.billing.getSubscriptions(subscriptionOptions);

    // Find active subscription
    const activeSubscription = subscriptions.find(
      (sub) => sub.status === "active" || sub.status === "trialing"
    );

    if (!activeSubscription) {
      this.logger.debug("No active subscription found", { customerId });
      return null;
    }

    // Resolve and set plan
    const planId = await this.resolvePlanId(
      activeSubscription.priceId,
      activeSubscription.provider
    );
    await this.usage.setCustomerPlan(customerId, planId);

    const plan = await this.usage.getPlan(planId);

    this.logger.info("Customer plan synced", {
      customerId,
      planId,
      subscriptionId: activeSubscription.id,
    });

    return plan;
  }
}

/**
 * Create billing integration
 *
 * Connects BillingService webhooks to UsageService lifecycle events.
 *
 * @example
 * ```typescript
 * const integration = integrateBillingWithUsage({
 *   billing,
 *   usage,
 *   autoInitializePlan: true,
 *   resolvePlanId: (priceId) => priceMapping[priceId] ?? "free",
 * });
 * ```
 */
export function integrateBillingWithUsage(config: BillingIntegrationConfig): BillingIntegration {
  return new BillingIntegration(config);
}

/**
 * Alias for integrateBillingWithUsage
 */
export const createBillingIntegration = integrateBillingWithUsage;
