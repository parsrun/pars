/**
 * @parsrun/payments - Paddle Provider
 * Edge-compatible Paddle provider using fetch API (Paddle Billing API v2)
 */

import type {
  CheckoutSession,
  CreateCheckoutOptions,
  CreateCustomerOptions,
  CreatePortalOptions,
  CreateSubscriptionOptions,
  Customer,
  PaddleProviderConfig,
  PaymentProvider,
  PortalSession,
  Price,
  Product,
  Subscription,
  SubscriptionStatus,
  UpdateSubscriptionOptions,
  WebhookEvent,
  WebhookEventType,
} from "../types.js";
import { PaymentError, PaymentErrorCodes } from "../types.js";

/**
 * Paddle Payment Provider
 * Edge-compatible using fetch API (Paddle Billing API v2)
 *
 * @example
 * ```typescript
 * const paddle = new PaddleProvider({
 *   apiKey: process.env.PADDLE_API_KEY,
 *   environment: 'sandbox', // or 'production'
 *   webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
 * });
 *
 * const checkout = await paddle.createCheckout({
 *   lineItems: [{ priceId: 'pri_xxx', quantity: 1 }],
 *   successUrl: 'https://example.com/success',
 *   cancelUrl: 'https://example.com/cancel',
 *   mode: 'subscription',
 * });
 * ```
 */
export class PaddleProvider implements PaymentProvider {
  readonly type = "paddle" as const;

  private apiKey: string;
  private webhookSecret: string | undefined;
  private baseUrl: string;

  constructor(config: PaddleProviderConfig) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl =
      config.environment === "production"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";
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
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, fetchOptions);

    const data = await response.json() as {
      data?: T;
      error?: { type: string; code: string; detail: string };
    };

    if (!response.ok || data.error) {
      const errorMessage = data.error?.detail ?? `HTTP ${response.status}`;
      throw new PaymentError(
        `Paddle API error: ${errorMessage}`,
        data.error?.code ?? PaymentErrorCodes.API_ERROR,
        data.error
      );
    }

    return data.data as T;
  }

  // ============================================================================
  // Customer
  // ============================================================================

  async createCustomer(options: CreateCustomerOptions): Promise<Customer> {
    const body: Record<string, unknown> = {
      email: options.email,
    };

    if (options.name) body["name"] = options.name;
    if (options.metadata) body["custom_data"] = options.metadata;

    const result = await this.request<PaddleCustomer>("/customers", {
      method: "POST",
      body,
    });

    return this.mapCustomer(result);
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    try {
      const result = await this.request<PaddleCustomer>(`/customers/${customerId}`);
      return this.mapCustomer(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "not_found") {
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
    if (options.metadata) body["custom_data"] = options.metadata;

    const result = await this.request<PaddleCustomer>(`/customers/${customerId}`, {
      method: "PATCH",
      body,
    });

    return this.mapCustomer(result);
  }

  async deleteCustomer(_customerId: string): Promise<void> {
    // Paddle doesn't support customer deletion via API
    // Customers can only be archived
    throw new PaymentError(
      "Paddle does not support customer deletion",
      PaymentErrorCodes.API_ERROR
    );
  }

  private mapCustomer(paddle: PaddleCustomer): Customer {
    return {
      id: paddle.id,
      email: paddle.email,
      name: paddle.name ?? undefined,
      metadata: paddle.custom_data ?? undefined,
      providerData: paddle,
    };
  }

  // ============================================================================
  // Checkout
  // ============================================================================

  async createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession> {
    const items = options.lineItems.map((item) => ({
      price_id: item.priceId,
      quantity: item.quantity,
    }));

    const body: Record<string, unknown> = {
      items,
    };

    if (options.customerId) body["customer_id"] = options.customerId;
    if (options.customerEmail) {
      body["customer"] = { email: options.customerEmail };
    }
    if (options.metadata) body["custom_data"] = options.metadata;

    // Paddle handles return URLs differently - they're configured in dashboard
    // or passed as settings
    body["settings"] = {
      success_url: options.successUrl,
    };

    const result = await this.request<PaddleTransaction>("/transactions", {
      method: "POST",
      body,
    });

    return {
      id: result.id,
      url: result.checkout?.url ?? "",
      customerId: result.customer_id ?? undefined,
      status: result.status === "completed" ? "complete" : "open",
      mode: result.subscription_id ? "subscription" : "payment",
      amountTotal: this.parsePaddleAmount(result.details?.totals?.total),
      currency: result.currency_code,
      providerData: result,
    };
  }

  async getCheckout(sessionId: string): Promise<CheckoutSession | null> {
    try {
      const result = await this.request<PaddleTransaction>(`/transactions/${sessionId}`);

      return {
        id: result.id,
        url: result.checkout?.url ?? "",
        customerId: result.customer_id ?? undefined,
        status: result.status === "completed" ? "complete" : "open",
        mode: result.subscription_id ? "subscription" : "payment",
        amountTotal: this.parsePaddleAmount(result.details?.totals?.total),
        currency: result.currency_code,
        providerData: result,
      };
    } catch (err) {
      if (err instanceof PaymentError && err.code === "not_found") {
        return null;
      }
      throw err;
    }
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  async createSubscription(_options: CreateSubscriptionOptions): Promise<Subscription> {
    // Paddle subscriptions are created through the checkout flow
    // Direct subscription creation is not supported
    throw new PaymentError(
      "Paddle subscriptions must be created through checkout",
      PaymentErrorCodes.API_ERROR
    );
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const result = await this.request<PaddleSubscription>(
        `/subscriptions/${subscriptionId}`
      );
      return this.mapSubscription(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "not_found") {
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

    if (options.priceId) {
      body["items"] = [{ price_id: options.priceId, quantity: 1 }];
    }
    if (options.metadata) body["custom_data"] = options.metadata;
    if (options.prorationBehavior) {
      body["proration_billing_mode"] =
        options.prorationBehavior === "none" ? "do_not_bill" : "prorated_immediately";
    }

    const result = await this.request<PaddleSubscription>(
      `/subscriptions/${subscriptionId}`,
      { method: "PATCH", body }
    );

    return this.mapSubscription(result);
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd = true
  ): Promise<Subscription> {
    const body: Record<string, unknown> = {
      effective_from: cancelAtPeriodEnd ? "next_billing_period" : "immediately",
    };

    const result = await this.request<PaddleSubscription>(
      `/subscriptions/${subscriptionId}/cancel`,
      { method: "POST", body }
    );

    return this.mapSubscription(result);
  }

  async listSubscriptions(customerId: string): Promise<Subscription[]> {
    const result = await this.request<PaddleSubscription[]>(
      `/subscriptions?customer_id=${customerId}`
    );

    return result.map((sub) => this.mapSubscription(sub));
  }

  private mapSubscription(paddle: PaddleSubscription): Subscription {
    const item = paddle.items?.[0];

    const statusMap: Record<string, SubscriptionStatus> = {
      active: "active",
      canceled: "canceled",
      past_due: "past_due",
      paused: "paused",
      trialing: "trialing",
    };

    return {
      id: paddle.id,
      customerId: paddle.customer_id,
      status: statusMap[paddle.status] ?? "active",
      priceId: item?.price?.id ?? "",
      productId: item?.price?.product_id,
      currentPeriodStart: new Date(paddle.current_billing_period?.starts_at ?? Date.now()),
      currentPeriodEnd: new Date(paddle.current_billing_period?.ends_at ?? Date.now()),
      cancelAtPeriodEnd: paddle.scheduled_change?.action === "cancel",
      canceledAt: paddle.canceled_at ? new Date(paddle.canceled_at) : undefined,
      trialStart: paddle.started_at ? new Date(paddle.started_at) : undefined,
      trialEnd: paddle.first_billed_at ? new Date(paddle.first_billed_at) : undefined,
      metadata: paddle.custom_data ?? undefined,
      providerData: paddle,
    };
  }

  // ============================================================================
  // Portal
  // ============================================================================

  async createPortalSession(options: CreatePortalOptions): Promise<PortalSession> {
    // Paddle uses customer portal links that are generated per customer
    // Get customer to retrieve portal session
    const customer = await this.getCustomer(options.customerId);
    if (!customer) {
      throw new PaymentError(
        "Customer not found",
        PaymentErrorCodes.CUSTOMER_NOT_FOUND
      );
    }

    // In Paddle Billing, you need to create a portal session
    // This creates a session link for the customer portal
    const result = await this.request<{ urls: { general: { overview: string } } }>(
      `/customers/${options.customerId}/portal-sessions`,
      { method: "POST" }
    );

    return {
      url: result.urls.general.overview,
      returnUrl: options.returnUrl,
    };
  }

  // ============================================================================
  // Products & Prices
  // ============================================================================

  async getProduct(productId: string): Promise<Product | null> {
    try {
      const result = await this.request<PaddleProduct>(`/products/${productId}`);
      return this.mapProduct(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "not_found") {
        return null;
      }
      throw err;
    }
  }

  async getPrice(priceId: string): Promise<Price | null> {
    try {
      const result = await this.request<PaddlePrice>(`/prices/${priceId}`);
      return this.mapPrice(result);
    } catch (err) {
      if (err instanceof PaymentError && err.code === "not_found") {
        return null;
      }
      throw err;
    }
  }

  async listPrices(productId?: string): Promise<Price[]> {
    let endpoint = "/prices?status=active";
    if (productId) {
      endpoint += `&product_id=${productId}`;
    }

    const result = await this.request<PaddlePrice[]>(endpoint);
    return result.map((price) => this.mapPrice(price));
  }

  private mapProduct(paddle: PaddleProduct): Product {
    return {
      id: paddle.id,
      name: paddle.name,
      description: paddle.description ?? undefined,
      active: paddle.status === "active",
      metadata: paddle.custom_data ?? undefined,
      providerData: paddle,
    };
  }

  private mapPrice(paddle: PaddlePrice): Price {
    const amount = paddle.unit_price?.amount
      ? parseInt(paddle.unit_price.amount, 10)
      : 0;

    return {
      id: paddle.id,
      productId: paddle.product_id,
      unitAmount: amount,
      currency: paddle.unit_price?.currency_code ?? "USD",
      recurring: paddle.billing_cycle
        ? {
            interval: paddle.billing_cycle.interval as "day" | "week" | "month" | "year",
            intervalCount: paddle.billing_cycle.frequency,
          }
        : undefined,
      active: paddle.status === "active",
      metadata: paddle.custom_data ?? undefined,
      providerData: paddle,
    };
  }

  private parsePaddleAmount(amount?: string): number | undefined {
    if (!amount) return undefined;
    return parseInt(amount, 10);
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

    // Parse Paddle signature header (ts=xxx;h1=xxx)
    const signatureParts = signature.split(";").reduce((acc, part) => {
      const [key, value] = part.split("=");
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    const timestamp = signatureParts["ts"];
    const expectedSignature = signatureParts["h1"];

    if (!timestamp || !expectedSignature) {
      return null;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}:${payloadString}`;
    const computedSignature = await this.computeHmacSignature(
      signedPayload,
      this.webhookSecret
    );

    // Constant-time comparison
    if (!this.secureCompare(computedSignature, expectedSignature)) {
      return null;
    }

    // Parse event
    const event = JSON.parse(payloadString) as PaddleWebhookEvent;

    return {
      id: event.event_id,
      type: this.mapEventType(event.event_type),
      data: event.data,
      created: new Date(event.occurred_at),
      provider: "paddle",
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

  private mapEventType(paddleType: string): WebhookEventType {
    const mapping: Record<string, WebhookEventType> = {
      "transaction.completed": "checkout.session.completed",
      "customer.created": "customer.created",
      "customer.updated": "customer.updated",
      "subscription.created": "subscription.created",
      "subscription.updated": "subscription.updated",
      "subscription.canceled": "subscription.deleted",
      "subscription.past_due": "subscription.updated",
      "subscription.activated": "subscription.created",
      "transaction.payment_failed": "payment.failed",
      "adjustment.created": "refund.created",
    };

    return mapping[paddleType] ?? ("unknown" as WebhookEventType);
  }
}

// ============================================================================
// Paddle API Types
// ============================================================================

interface PaddleCustomer {
  id: string;
  email: string;
  name: string | null;
  custom_data: Record<string, string> | null;
}

interface PaddleTransaction {
  id: string;
  status: string;
  customer_id: string | null;
  subscription_id: string | null;
  currency_code: string;
  checkout?: {
    url: string;
  };
  details?: {
    totals?: {
      total: string;
    };
  };
}

interface PaddleSubscription {
  id: string;
  customer_id: string;
  status: string;
  items?: Array<{
    price: {
      id: string;
      product_id: string;
    };
  }>;
  current_billing_period?: {
    starts_at: string;
    ends_at: string;
  };
  scheduled_change?: {
    action: string;
  };
  started_at: string | null;
  first_billed_at: string | null;
  canceled_at: string | null;
  custom_data: Record<string, string> | null;
}

interface PaddleProduct {
  id: string;
  name: string;
  description: string | null;
  status: string;
  custom_data: Record<string, string> | null;
}

interface PaddlePrice {
  id: string;
  product_id: string;
  status: string;
  unit_price?: {
    amount: string;
    currency_code: string;
  };
  billing_cycle?: {
    interval: string;
    frequency: number;
  };
  custom_data: Record<string, string> | null;
}

interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: unknown;
}

/**
 * Create a Paddle provider
 */
export function createPaddleProvider(config: PaddleProviderConfig): PaddleProvider {
  return new PaddleProvider(config);
}
