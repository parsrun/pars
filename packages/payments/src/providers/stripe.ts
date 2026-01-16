/**
 * @parsrun/payments - Stripe Provider
 * Edge-compatible Stripe provider using fetch API
 */

import type {
  CheckoutSession,
  CreateCheckoutOptions,
  CreateCustomerOptions,
  CreatePortalOptions,
  CreateSubscriptionOptions,
  Customer,
  PaymentProvider,
  PortalSession,
  Price,
  Product,
  StripeProviderConfig,
  Subscription,
  SubscriptionStatus,
  UpdateSubscriptionOptions,
  WebhookEvent,
  WebhookEventType,
} from "../types.js";
import { PaymentError, PaymentErrorCodes } from "../types.js";

/**
 * Stripe Payment Provider
 * Edge-compatible using fetch API
 *
 * @example
 * ```typescript
 * const stripe = new StripeProvider({
 *   secretKey: process.env.STRIPE_SECRET_KEY,
 *   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
 * });
 *
 * const checkout = await stripe.createCheckout({
 *   lineItems: [{ priceId: 'price_xxx', quantity: 1 }],
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 *   mode: 'subscription',
 * });
 * ```
 */
export class StripeProvider implements PaymentProvider {
  readonly type = "stripe" as const;

  private secretKey: string;
  private webhookSecret: string | undefined;
  private baseUrl = "https://api.stripe.com/v1";
  private apiVersion: string;

  constructor(config: StripeProviderConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.apiVersion = config.apiVersion ?? "2024-12-18.acacia";
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
    } = {}
  ): Promise<T> {
    const { method = "GET", body } = options;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Stripe-Version": this.apiVersion,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      fetchOptions.body = this.encodeFormData(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, fetchOptions);

    const data = await response.json() as T & { error?: { message: string; type: string; code?: string } };

    if (!response.ok || data.error) {
      const errorMessage = data.error?.message ?? `HTTP ${response.status}`;
      throw new PaymentError(
        `Stripe API error: ${errorMessage}`,
        data.error?.code ?? PaymentErrorCodes.API_ERROR,
        data.error
      );
    }

    return data;
  }

  private encodeFormData(obj: Record<string, unknown>, prefix = ""): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;

      const fullKey = prefix ? `${prefix}[${key}]` : key;

      if (typeof value === "object" && !Array.isArray(value)) {
        parts.push(this.encodeFormData(value as Record<string, unknown>, fullKey));
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === "object") {
            parts.push(this.encodeFormData(item as Record<string, unknown>, `${fullKey}[${index}]`));
          } else {
            parts.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
          }
        });
      } else {
        parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.filter(Boolean).join("&");
  }

  // ============================================================================
  // Customer
  // ============================================================================

  async createCustomer(options: CreateCustomerOptions): Promise<Customer> {
    const body: Record<string, unknown> = {
      email: options.email,
    };

    if (options.name) body["name"] = options.name;
    if (options.phone) body["phone"] = options.phone;
    if (options.metadata) body["metadata"] = options.metadata;
    if (options.address) {
      body["address"] = {
        line1: options.address.line1,
        line2: options.address.line2,
        city: options.address.city,
        state: options.address.state,
        postal_code: options.address.postalCode,
        country: options.address.country,
      };
    }

    const result = await this.request<StripeCustomer>("/customers", {
      method: "POST",
      body,
    });

    return this.mapCustomer(result);
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    try {
      const result = await this.request<StripeCustomer>(`/customers/${customerId}`);
      return this.mapCustomer(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "resource_missing") {
        return null;
      }
      throw err;
    }
  }

  async updateCustomer(
    customerId: string,
    options: Partial<CreateCustomerOptions>
  ): Promise<Customer> {
    const body: Record<string, unknown> = {};

    if (options.email) body["email"] = options.email;
    if (options.name) body["name"] = options.name;
    if (options.phone) body["phone"] = options.phone;
    if (options.metadata) body["metadata"] = options.metadata;
    if (options.address) {
      body["address"] = {
        line1: options.address.line1,
        line2: options.address.line2,
        city: options.address.city,
        state: options.address.state,
        postal_code: options.address.postalCode,
        country: options.address.country,
      };
    }

    const result = await this.request<StripeCustomer>(`/customers/${customerId}`, {
      method: "POST",
      body,
    });

    return this.mapCustomer(result);
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await this.request(`/customers/${customerId}`, { method: "DELETE" });
  }

  private mapCustomer(stripe: StripeCustomer): Customer {
    return {
      id: stripe.id,
      email: stripe.email ?? "",
      name: stripe.name ?? undefined,
      phone: stripe.phone ?? undefined,
      address: stripe.address
        ? {
            line1: stripe.address.line1 ?? undefined,
            line2: stripe.address.line2 ?? undefined,
            city: stripe.address.city ?? undefined,
            state: stripe.address.state ?? undefined,
            postalCode: stripe.address.postal_code ?? undefined,
            country: stripe.address.country ?? undefined,
          }
        : undefined,
      metadata: stripe.metadata ?? undefined,
      providerData: stripe,
    };
  }

  // ============================================================================
  // Checkout
  // ============================================================================

  async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
    const body: Record<string, unknown> = {
      mode: options.mode,
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      line_items: options.lineItems.map((item) => ({
        price: item.priceId,
        quantity: item.quantity,
      })),
    };

    if (options.customerId) body["customer"] = options.customerId;
    if (options.customerEmail) body["customer_email"] = options.customerEmail;
    if (options.allowPromotionCodes) body["allow_promotion_codes"] = true;
    if (options.metadata) body["metadata"] = options.metadata;

    if (options.mode === "subscription" && options.trialDays) {
      body["subscription_data"] = {
        trial_period_days: options.trialDays,
      };
    }

    const result = await this.request<StripeCheckoutSession>("/checkout/sessions", {
      method: "POST",
      body,
    });

    return this.mapCheckoutSession(result);
  }

  async getCheckout(sessionId: string): Promise<CheckoutSession | null> {
    try {
      const result = await this.request<StripeCheckoutSession>(
        `/checkout/sessions/${sessionId}`
      );
      return this.mapCheckoutSession(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "resource_missing") {
        return null;
      }
      throw err;
    }
  }

  private mapCheckoutSession(stripe: StripeCheckoutSession): CheckoutSession {
    return {
      id: stripe.id,
      url: stripe.url ?? "",
      customerId: stripe.customer ?? undefined,
      status: stripe.status as "open" | "complete" | "expired",
      mode: stripe.mode as "payment" | "subscription" | "setup",
      amountTotal: stripe.amount_total ?? undefined,
      currency: stripe.currency ?? undefined,
      providerData: stripe,
    };
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  async createSubscription(options: CreateSubscriptionOptions): Promise<Subscription> {
    const body: Record<string, unknown> = {
      customer: options.customerId,
      items: [{ price: options.priceId }],
    };

    if (options.trialDays) body["trial_period_days"] = options.trialDays;
    if (options.metadata) body["metadata"] = options.metadata;
    if (options.paymentBehavior) body["payment_behavior"] = options.paymentBehavior;

    const result = await this.request<StripeSubscription>("/subscriptions", {
      method: "POST",
      body,
    });

    return this.mapSubscription(result);
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const result = await this.request<StripeSubscription>(
        `/subscriptions/${subscriptionId}`
      );
      return this.mapSubscription(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "resource_missing") {
        return null;
      }
      throw err;
    }
  }

  async updateSubscription(
    subscriptionId: string,
    options: UpdateSubscriptionOptions
  ): Promise<Subscription> {
    const body: Record<string, unknown> = {};

    if (options.cancelAtPeriodEnd !== undefined) {
      body["cancel_at_period_end"] = options.cancelAtPeriodEnd;
    }
    if (options.metadata) body["metadata"] = options.metadata;
    if (options.prorationBehavior) body["proration_behavior"] = options.prorationBehavior;

    // Price change requires updating subscription items
    if (options.priceId) {
      // Get current subscription to find item ID
      const current = await this.request<StripeSubscription>(
        `/subscriptions/${subscriptionId}`
      );
      const itemId = current.items.data[0]?.id;
      if (itemId) {
        body["items"] = [{ id: itemId, price: options.priceId }];
      }
    }

    const result = await this.request<StripeSubscription>(
      `/subscriptions/${subscriptionId}`,
      { method: "POST", body }
    );

    return this.mapSubscription(result);
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd = true
  ): Promise<Subscription> {
    if (cancelAtPeriodEnd) {
      return this.updateSubscription(subscriptionId, { cancelAtPeriodEnd: true });
    }

    const result = await this.request<StripeSubscription>(
      `/subscriptions/${subscriptionId}`,
      { method: "DELETE" }
    );

    return this.mapSubscription(result);
  }

  async listSubscriptions(customerId: string): Promise<Subscription[]> {
    const result = await this.request<{ data: StripeSubscription[] }>(
      `/subscriptions?customer=${customerId}`
    );

    return result.data.map((sub) => this.mapSubscription(sub));
  }

  private mapSubscription(stripe: StripeSubscription): Subscription {
    const item = stripe.items.data[0];

    return {
      id: stripe.id,
      customerId: typeof stripe.customer === "string" ? stripe.customer : stripe.customer.id,
      status: stripe.status as SubscriptionStatus,
      priceId: item?.price.id ?? "",
      productId: typeof item?.price.product === "string" ? item.price.product : item?.price.product?.id,
      currentPeriodStart: new Date(stripe.current_period_start * 1000),
      currentPeriodEnd: new Date(stripe.current_period_end * 1000),
      cancelAtPeriodEnd: stripe.cancel_at_period_end,
      canceledAt: stripe.canceled_at ? new Date(stripe.canceled_at * 1000) : undefined,
      trialStart: stripe.trial_start ? new Date(stripe.trial_start * 1000) : undefined,
      trialEnd: stripe.trial_end ? new Date(stripe.trial_end * 1000) : undefined,
      metadata: stripe.metadata ?? undefined,
      providerData: stripe,
    };
  }

  // ============================================================================
  // Portal
  // ============================================================================

  async createPortalSession(options: CreatePortalOptions): Promise<PortalSession> {
    const result = await this.request<{ url: string }>("/billing_portal/sessions", {
      method: "POST",
      body: {
        customer: options.customerId,
        return_url: options.returnUrl,
      },
    });

    return {
      url: result.url,
      returnUrl: options.returnUrl,
    };
  }

  // ============================================================================
  // Products & Prices
  // ============================================================================

  async getProduct(productId: string): Promise<Product | null> {
    try {
      const result = await this.request<StripeProduct>(`/products/${productId}`);
      return this.mapProduct(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "resource_missing") {
        return null;
      }
      throw err;
    }
  }

  async getPrice(priceId: string): Promise<Price | null> {
    try {
      const result = await this.request<StripePrice>(`/prices/${priceId}`);
      return this.mapPrice(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "resource_missing") {
        return null;
      }
      throw err;
    }
  }

  async listPrices(productId?: string): Promise<Price[]> {
    let endpoint = "/prices?active=true&limit=100";
    if (productId) {
      endpoint += `&product=${productId}`;
    }

    const result = await this.request<{ data: StripePrice[] }>(endpoint);
    return result.data.map((price) => this.mapPrice(price));
  }

  private mapProduct(stripe: StripeProduct): Product {
    return {
      id: stripe.id,
      name: stripe.name,
      description: stripe.description ?? undefined,
      active: stripe.active,
      metadata: stripe.metadata ?? undefined,
      providerData: stripe,
    };
  }

  private mapPrice(stripe: StripePrice): Price {
    return {
      id: stripe.id,
      productId: typeof stripe.product === "string" ? stripe.product : stripe.product.id,
      unitAmount: stripe.unit_amount ?? 0,
      currency: stripe.currency.toUpperCase(),
      recurring: stripe.recurring
        ? {
            interval: stripe.recurring.interval as "day" | "week" | "month" | "year",
            intervalCount: stripe.recurring.interval_count,
          }
        : undefined,
      active: stripe.active,
      metadata: stripe.metadata ?? undefined,
      providerData: stripe,
    };
  }

  // ============================================================================
  // Webhooks
  // ============================================================================

  async verifyWebhook(
    payload: string | Uint8Array,
    signature: string
  ): Promise<WebhookEvent | null> {
    if (!this.webhookSecret) {
      throw new PaymentError(
        "Webhook secret not configured",
        PaymentErrorCodes.INVALID_CONFIG
      );
    }

    const payloadString = typeof payload === "string" ? payload : new TextDecoder().decode(payload);

    // Parse signature header
    const signatureParts = signature.split(",").reduce((acc, part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    const timestamp = signatureParts["t"];
    const expectedSignature = signatureParts["v1"];

    if (!timestamp || !expectedSignature) {
      return null;
    }

    // Check timestamp (within 5 minutes)
    const timestampSeconds = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampSeconds) > 300) {
      return null;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payloadString}`;
    const computedSignature = await this.computeHmacSignature(
      signedPayload,
      this.webhookSecret
    );

    // Constant-time comparison
    if (!this.secureCompare(computedSignature, expectedSignature)) {
      return null;
    }

    // Parse event
    const event = JSON.parse(payloadString) as StripeWebhookEvent;

    return {
      id: event.id,
      type: this.mapEventType(event.type),
      data: event.data.object,
      created: new Date(event.created * 1000),
      provider: "stripe",
      raw: event,
    };
  }

  private async computeHmacSignature(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const signatureArray = new Uint8Array(signature);

    return Array.from(signatureArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  private mapEventType(stripeType: string): WebhookEventType {
    const mapping: Record<string, WebhookEventType> = {
      "checkout.session.completed": "checkout.session.completed",
      "checkout.session.expired": "checkout.session.expired",
      "customer.created": "customer.created",
      "customer.updated": "customer.updated",
      "customer.deleted": "customer.deleted",
      "customer.subscription.created": "subscription.created",
      "customer.subscription.updated": "subscription.updated",
      "customer.subscription.deleted": "subscription.deleted",
      "customer.subscription.trial_will_end": "subscription.trial_will_end",
      "payment_intent.succeeded": "payment.succeeded",
      "payment_intent.payment_failed": "payment.failed",
      "invoice.created": "invoice.created",
      "invoice.paid": "invoice.paid",
      "invoice.payment_failed": "invoice.payment_failed",
      "invoice.upcoming": "invoice.upcoming",
      "charge.refunded": "refund.created",
      "refund.created": "refund.created",
      "refund.updated": "refund.updated",
    };

    return mapping[stripeType] ?? ("unknown" as WebhookEventType);
  }

  // ============================================================================
  // Usage Reporting (Metered Billing)
  // ============================================================================

  /**
   * Report usage for metered billing
   *
   * @example
   * ```typescript
   * // Report 100 API calls for a subscription item
   * await stripe.reportUsage({
   *   subscriptionItemId: "si_xxx",
   *   quantity: 100,
   *   action: "increment", // or "set" to replace
   * });
   * ```
   */
  async reportUsage(record: {
    subscriptionItemId: string;
    quantity: number;
    timestamp?: Date;
    action?: "increment" | "set";
    idempotencyKey?: string;
  }): Promise<void> {
    const body: Record<string, unknown> = {
      quantity: record.quantity,
      action: record.action ?? "increment",
    };

    if (record.timestamp) {
      body["timestamp"] = Math.floor(record.timestamp.getTime() / 1000);
    }

    const headers: Record<string, string> = {};
    if (record.idempotencyKey) {
      headers["Idempotency-Key"] = record.idempotencyKey;
    }

    await this.request<StripeUsageRecord>(
      `/subscription_items/${record.subscriptionItemId}/usage_records`,
      {
        method: "POST",
        body,
      }
    );
  }

  /**
   * Report multiple usage records (batch)
   * Note: Stripe doesn't have a batch API, so this is sequential
   */
  async reportUsageBatch(records: Array<{
    subscriptionItemId: string;
    quantity: number;
    timestamp?: Date;
    action?: "increment" | "set";
    idempotencyKey?: string;
  }>): Promise<void> {
    for (const record of records) {
      await this.reportUsage(record);
    }
  }

  /**
   * Get subscription item ID for a subscription and price
   */
  async getSubscriptionItemId(
    subscriptionId: string,
    priceId: string
  ): Promise<string | null> {
    const subscription = await this.request<StripeSubscription>(
      `/subscriptions/${subscriptionId}`
    );

    const item = subscription.items.data.find((i) => i.price.id === priceId);
    return item?.id ?? null;
  }

  /**
   * Get usage records for a subscription item
   */
  async getUsageRecords(
    subscriptionItemId: string,
    options?: {
      startingAfter?: string;
      endingBefore?: string;
      limit?: number;
    }
  ): Promise<{
    data: Array<{
      id: string;
      quantity: number;
      timestamp: Date;
      subscriptionItem: string;
    }>;
    hasMore: boolean;
  }> {
    let endpoint = `/subscription_items/${subscriptionItemId}/usage_record_summaries?`;

    if (options?.limit) {
      endpoint += `limit=${options.limit}&`;
    }
    if (options?.startingAfter) {
      endpoint += `starting_after=${options.startingAfter}&`;
    }
    if (options?.endingBefore) {
      endpoint += `ending_before=${options.endingBefore}&`;
    }

    const result = await this.request<{
      data: StripeUsageRecordSummary[];
      has_more: boolean;
    }>(endpoint);

    return {
      data: result.data.map((r) => ({
        id: r.id,
        quantity: r.total_usage,
        timestamp: new Date(r.period.start * 1000),
        subscriptionItem: r.subscription_item,
      })),
      hasMore: result.has_more,
    };
  }

  /**
   * Get current period usage total for a subscription item
   */
  async getCurrentUsage(subscriptionItemId: string): Promise<number> {
    const result = await this.getUsageRecords(subscriptionItemId, { limit: 1 });
    return result.data[0]?.quantity ?? 0;
  }
}

// ============================================================================
// Stripe API Types
// ============================================================================

interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  metadata: Record<string, string> | null;
}

interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
  status: string;
  mode: string;
  amount_total: number | null;
  currency: string | null;
}

interface StripeSubscription {
  id: string;
  customer: string | { id: string };
  status: string;
  items: {
    data: Array<{
      id: string;
      price: StripePrice;
    }>;
  };
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
  metadata: Record<string, string> | null;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: Record<string, string> | null;
}

interface StripePrice {
  id: string;
  product: string | { id: string };
  unit_amount: number | null;
  currency: string;
  recurring: {
    interval: string;
    interval_count: number;
  } | null;
  active: boolean;
  metadata: Record<string, string> | null;
}

interface StripeWebhookEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: unknown;
  };
}

interface StripeUsageRecord {
  id: string;
  object: "usage_record";
  quantity: number;
  subscription_item: string;
  timestamp: number;
}

interface StripeUsageRecordSummary {
  id: string;
  object: "usage_record_summary";
  invoice: string | null;
  period: {
    start: number;
    end: number;
  };
  subscription_item: string;
  total_usage: number;
}

/**
 * Create a Stripe provider
 */
export function createStripeProvider(config: StripeProviderConfig): StripeProvider {
  return new StripeProvider(config);
}
