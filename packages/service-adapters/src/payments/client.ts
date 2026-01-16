/**
 * @parsrun/service-adapters - Payments Service Client
 * Type-safe client for the Payments microservice
 */

import {
  useService,
  type ServiceClientOptions,
} from "@parsrun/service";
import type { PaymentsServiceDefinition } from "./definition.js";

// ============================================================================
// PAYMENTS SERVICE CLIENT
// ============================================================================

/**
 * Type-safe Payments Service Client
 */
export interface PaymentsServiceClient {
  // ============ Queries ============

  /**
   * Get subscription details
   */
  getSubscription(options: {
    subscriptionId?: string;
    customerId?: string;
  }): Promise<Subscription | null>;

  /**
   * Get customer details
   */
  getCustomer(customerId: string): Promise<Customer | null>;

  /**
   * Check quota for a feature
   */
  checkQuota(
    customerId: string,
    featureKey: string
  ): Promise<QuotaStatus>;

  /**
   * Get usage summary
   */
  getUsage(options: {
    customerId: string;
    featureKey?: string;
    period?: "hour" | "day" | "month";
  }): Promise<UsageSummary>;

  /**
   * Get available plans
   */
  getPlans(): Promise<{ plans: Plan[] }>;

  /**
   * Get dunning status
   */
  getDunningStatus(customerId: string): Promise<DunningStatus>;

  // ============ Mutations ============

  /**
   * Create checkout session
   */
  createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession>;

  /**
   * Cancel subscription
   */
  cancelSubscription(options: CancelSubscriptionOptions): Promise<CancelResult>;

  /**
   * Update subscription
   */
  updateSubscription(options: UpdateSubscriptionOptions): Promise<UpdateResult>;

  /**
   * Create customer portal session
   */
  createPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<PortalSession>;

  /**
   * Track usage
   */
  trackUsage(options: TrackUsageOptions): Promise<TrackUsageResult>;

  /**
   * Assign plan to customer
   */
  assignPlan(
    customerId: string,
    planId: string,
    expiresAt?: string
  ): Promise<AssignPlanResult>;

  /**
   * Handle webhook
   */
  handleWebhook(options: WebhookOptions): Promise<WebhookResult>;

  // ============ Events ============

  /**
   * Subscribe to subscription events
   */
  onSubscriptionCreated(handler: (event: SubscriptionCreatedEvent) => Promise<void>): () => void;
  onSubscriptionRenewed(handler: (event: SubscriptionRenewedEvent) => Promise<void>): () => void;
  onSubscriptionCanceled(handler: (event: SubscriptionCanceledEvent) => Promise<void>): () => void;
  onSubscriptionPlanChanged(handler: (event: PlanChangedEvent) => Promise<void>): () => void;

  /**
   * Subscribe to payment events
   */
  onPaymentSucceeded(handler: (event: PaymentSucceededEvent) => Promise<void>): () => void;
  onPaymentFailed(handler: (event: PaymentFailedEvent) => Promise<void>): () => void;

  /**
   * Subscribe to quota events
   */
  onQuotaExceeded(handler: (event: QuotaExceededEvent) => Promise<void>): () => void;
  onQuotaThresholdReached(handler: (event: QuotaThresholdEvent) => Promise<void>): () => void;

  /**
   * Subscribe to dunning events
   */
  onDunningStarted(handler: (event: DunningStartedEvent) => Promise<void>): () => void;
  onDunningResolved(handler: (event: DunningResolvedEvent) => Promise<void>): () => void;

  /**
   * Close the client
   */
  close(): Promise<void>;
}

// ============================================================================
// TYPES
// ============================================================================

export interface Subscription {
  id: string;
  customerId: string;
  status: "active" | "canceled" | "past_due" | "trialing" | "paused";
  planId: string;
  planName: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  provider: string;
}

export interface Customer {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, unknown>;
  provider: string;
}

export interface QuotaStatus {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  resetAt?: string;
  percentage: number;
}

export interface UsageSummary {
  features: Array<{
    featureKey: string;
    used: number;
    limit: number | null;
    percentage: number;
  }>;
  period: {
    start: string;
    end: string;
  };
}

export interface Plan {
  id: string;
  name: string;
  displayName: string;
  tier: number;
  basePrice: number;
  currency: string;
  billingInterval: "month" | "year";
  features: Array<{
    featureKey: string;
    limitValue: number | null;
    limitPeriod: string | null;
  }>;
}

export interface DunningStatus {
  inDunning: boolean;
  status?: "active" | "resolved" | "abandoned" | "recovered";
  currentStep?: number;
  totalSteps?: number;
  nextActionAt?: string;
  daysSinceFailure?: number;
}

export interface CreateCheckoutOptions {
  email: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  countryCode?: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutSession {
  checkoutUrl: string;
  sessionId: string;
  customerId?: string;
  provider: string;
}

export interface CancelSubscriptionOptions {
  subscriptionId: string;
  cancelAtPeriodEnd?: boolean;
  reason?: string;
}

export interface CancelResult {
  success: boolean;
  canceledAt?: string;
  effectiveAt?: string;
}

export interface UpdateSubscriptionOptions {
  subscriptionId: string;
  planId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateResult {
  success: boolean;
  subscription: {
    id: string;
    planId: string;
    status: string;
  };
}

export interface PortalSession {
  portalUrl: string;
  expiresAt?: string;
}

export interface TrackUsageOptions {
  customerId: string;
  featureKey: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface TrackUsageResult {
  success: boolean;
  newTotal: number;
  remaining: number | null;
}

export interface AssignPlanResult {
  success: boolean;
  previousPlanId?: string;
  newPlanId: string;
}

export interface WebhookOptions {
  provider: "stripe" | "paddle" | "iyzico";
  payload: string;
  signature: string;
}

export interface WebhookResult {
  success: boolean;
  eventType?: string;
  eventId?: string;
}

// Event types
export interface SubscriptionCreatedEvent {
  subscriptionId: string;
  customerId: string;
  planId: string;
  provider: string;
  timestamp: string;
}

export interface SubscriptionRenewedEvent {
  subscriptionId: string;
  customerId: string;
  planId: string;
  periodStart: string;
  periodEnd: string;
  timestamp: string;
}

export interface SubscriptionCanceledEvent {
  subscriptionId: string;
  customerId: string;
  reason?: string;
  effectiveAt: string;
  timestamp: string;
}

export interface PlanChangedEvent {
  subscriptionId: string;
  customerId: string;
  previousPlanId: string;
  newPlanId: string;
  timestamp: string;
}

export interface PaymentSucceededEvent {
  paymentId: string;
  customerId: string;
  amount: number;
  currency: string;
  invoiceId?: string;
  timestamp: string;
}

export interface PaymentFailedEvent {
  customerId: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

export interface QuotaExceededEvent {
  customerId: string;
  featureKey: string;
  used: number;
  limit: number;
  timestamp: string;
}

export interface QuotaThresholdEvent {
  customerId: string;
  featureKey: string;
  percentage: number;
  used: number;
  limit: number;
  timestamp: string;
}

export interface DunningStartedEvent {
  customerId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  timestamp: string;
}

export interface DunningResolvedEvent {
  customerId: string;
  resolution: "recovered" | "canceled" | "manual";
  timestamp: string;
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

/**
 * Create Payments Service Client
 *
 * @example
 * ```typescript
 * // Embedded mode
 * const payments = createPaymentsServiceClient();
 *
 * // HTTP mode
 * const payments = createPaymentsServiceClient({
 *   mode: 'http',
 *   baseUrl: 'https://payments.example.com',
 * });
 *
 * // Check quota before API call
 * const quota = await payments.checkQuota(customerId, 'api_calls');
 * if (!quota.allowed) {
 *   throw new Error('Quota exceeded');
 * }
 *
 * // Track usage after API call
 * await payments.trackUsage({
 *   customerId,
 *   featureKey: 'api_calls',
 *   quantity: 1,
 * });
 * ```
 */
export function createPaymentsServiceClient(
  options?: ServiceClientOptions
): PaymentsServiceClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = useService<PaymentsServiceDefinition>("payments", options) as any;

  return {
    // Queries
    async getSubscription(opts) {
      return client.query("getSubscription", opts) as Promise<Subscription | null>;
    },

    async getCustomer(customerId) {
      return client.query("getCustomer", { customerId }) as Promise<Customer | null>;
    },

    async checkQuota(customerId, featureKey) {
      return client.query("checkQuota", { customerId, featureKey }) as Promise<QuotaStatus>;
    },

    async getUsage(opts) {
      return client.query("getUsage", opts) as Promise<UsageSummary>;
    },

    async getPlans() {
      return client.query("getPlans", undefined) as Promise<{ plans: Plan[] }>;
    },

    async getDunningStatus(customerId) {
      return client.query("getDunningStatus", { customerId }) as Promise<DunningStatus>;
    },

    // Mutations
    async createCheckout(opts) {
      return client.mutate("createCheckout", opts) as Promise<CheckoutSession>;
    },

    async cancelSubscription(opts) {
      return client.mutate("cancelSubscription", opts) as Promise<CancelResult>;
    },

    async updateSubscription(opts) {
      return client.mutate("updateSubscription", opts) as Promise<UpdateResult>;
    },

    async createPortalSession(customerId, returnUrl) {
      return client.mutate("createPortalSession", { customerId, returnUrl }) as Promise<PortalSession>;
    },

    async trackUsage(opts) {
      return client.mutate("trackUsage", opts) as Promise<TrackUsageResult>;
    },

    async assignPlan(customerId, planId, expiresAt) {
      return client.mutate("assignPlan", { customerId, planId, expiresAt }) as Promise<AssignPlanResult>;
    },

    async handleWebhook(opts) {
      return client.mutate("handleWebhook", opts) as Promise<WebhookResult>;
    },

    // Event subscriptions
    onSubscriptionCreated(handler) {
      return client.on("subscription.created", async (event: { data: unknown }) => {
        await handler(event.data as SubscriptionCreatedEvent);
      });
    },

    onSubscriptionRenewed(handler) {
      return client.on("subscription.renewed", async (event: { data: unknown }) => {
        await handler(event.data as SubscriptionRenewedEvent);
      });
    },

    onSubscriptionCanceled(handler) {
      return client.on("subscription.canceled", async (event: { data: unknown }) => {
        await handler(event.data as SubscriptionCanceledEvent);
      });
    },

    onSubscriptionPlanChanged(handler) {
      return client.on("subscription.plan_changed", async (event: { data: unknown }) => {
        await handler(event.data as PlanChangedEvent);
      });
    },

    onPaymentSucceeded(handler) {
      return client.on("payment.succeeded", async (event: { data: unknown }) => {
        await handler(event.data as PaymentSucceededEvent);
      });
    },

    onPaymentFailed(handler) {
      return client.on("payment.failed", async (event: { data: unknown }) => {
        await handler(event.data as PaymentFailedEvent);
      });
    },

    onQuotaExceeded(handler) {
      return client.on("quota.exceeded", async (event: { data: unknown }) => {
        await handler(event.data as QuotaExceededEvent);
      });
    },

    onQuotaThresholdReached(handler) {
      return client.on("quota.threshold_reached", async (event: { data: unknown }) => {
        await handler(event.data as QuotaThresholdEvent);
      });
    },

    onDunningStarted(handler) {
      return client.on("dunning.started", async (event: { data: unknown }) => {
        await handler(event.data as DunningStartedEvent);
      });
    },

    onDunningResolved(handler) {
      return client.on("dunning.resolved", async (event: { data: unknown }) => {
        await handler(event.data as DunningResolvedEvent);
      });
    },

    async close() {
      if ("close" in client && typeof client.close === "function") {
        await (client as { close: () => Promise<void> }).close();
      }
    },
  };
}
