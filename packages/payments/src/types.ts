/**
 * @parsrun/payments - Type Definitions
 * Payment types and interfaces
 */

// Re-export types from @parsrun/types for convenience
export {
  type,
  currencyCode,
  money,
  paymentCustomer,
  createCustomerRequest,
  cardDetails,
  paymentMethod,
  paymentIntentStatus,
  paymentIntent as parsPaymentIntent,
  createPaymentIntentRequest,
  subscriptionStatus as parsSubscriptionStatus,
  priceInterval,
  price as parsPrice,
  subscription as parsSubscription,
  createSubscriptionRequest,
  refundStatus,
  refund,
  createRefundRequest,
  webhookEventType,
  webhookEvent,
  stripeConfig,
  paddleConfig,
  iyzicoConfig,
  paymentsConfig,
  type CurrencyCode as ParsCurrencyCode,
  type Money,
  type PaymentCustomer,
  type CreateCustomerRequest as ParsCreateCustomerRequest,
  type CardDetails,
  type PaymentMethod as ParsPaymentMethod,
  type PaymentIntentStatus,
  type PaymentIntent as ParsPaymentIntentType,
  type CreatePaymentIntentRequest,
  type SubscriptionStatus as ParsSubscriptionStatus,
  type PriceInterval,
  type Price as ParsPrice,
  type Subscription as ParsSubscription,
  type CreateSubscriptionRequest as ParsCreateSubscriptionRequest,
  type RefundStatus,
  type Refund,
  type CreateRefundRequest,
  type WebhookEventType as ParsWebhookEventType,
  type WebhookEvent as ParsWebhookEvent,
  type StripeConfig,
  type PaddleConfig,
  type IyzicoConfig,
  type PaymentsConfig,
} from "@parsrun/types";

/**
 * Payment provider type
 */
export type PaymentProviderType = "stripe" | "paddle" | "iyzico";

/**
 * Currency code (ISO 4217)
 */
export type CurrencyCode = "USD" | "EUR" | "GBP" | "TRY" | "JPY" | "CAD" | "AUD" | string;

/**
 * Payment status
 */
export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded"
  | "partially_refunded";

/**
 * Subscription status
 */
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "paused";

/**
 * Billing interval
 */
export type BillingInterval = "day" | "week" | "month" | "year";

// ============================================================================
// Customer
// ============================================================================

/**
 * Customer data
 */
export interface Customer {
  /** Provider customer ID */
  id: string;
  /** Customer email */
  email: string;
  /** Customer name */
  name?: string | undefined;
  /** Phone number */
  phone?: string | undefined;
  /** Billing address */
  address?: Address | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** Provider-specific data */
  providerData?: unknown;
}

/**
 * Address
 */
export interface Address {
  line1?: string | undefined;
  line2?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  postalCode?: string | undefined;
  country?: string | undefined;
}

/**
 * Create customer options
 */
export interface CreateCustomerOptions {
  email: string;
  name?: string | undefined;
  phone?: string | undefined;
  address?: Address | undefined;
  metadata?: Record<string, string> | undefined;
}

// ============================================================================
// Products & Prices
// ============================================================================

/**
 * Product
 */
export interface Product {
  /** Provider product ID */
  id: string;
  /** Product name */
  name: string;
  /** Description */
  description?: string | undefined;
  /** Active status */
  active: boolean;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** Provider-specific data */
  providerData?: unknown;
}

/**
 * Price
 */
export interface Price {
  /** Provider price ID */
  id: string;
  /** Product ID */
  productId: string;
  /** Price in smallest currency unit (cents) */
  unitAmount: number;
  /** Currency */
  currency: CurrencyCode;
  /** Recurring billing details */
  recurring?: {
    interval: BillingInterval;
    intervalCount: number;
  } | undefined;
  /** Active status */
  active: boolean;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** Provider-specific data */
  providerData?: unknown;
}

// ============================================================================
// Checkout
// ============================================================================

/**
 * Checkout line item
 */
export interface CheckoutLineItem {
  /** Price ID */
  priceId: string;
  /** Quantity */
  quantity: number;
}

/**
 * Create checkout options
 */
export interface CreateCheckoutOptions {
  /** Customer ID (optional, creates new if not provided) */
  customerId?: string | undefined;
  /** Customer email (for new customers) */
  customerEmail?: string | undefined;
  /** Line items */
  lineItems: CheckoutLineItem[];
  /** Success redirect URL */
  successUrl: string;
  /** Cancel redirect URL */
  cancelUrl: string;
  /** Checkout mode */
  mode: "payment" | "subscription" | "setup";
  /** Allow promotion codes */
  allowPromotionCodes?: boolean | undefined;
  /** Trial period days (subscription only) */
  trialDays?: number | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** Tenant ID for multi-tenant */
  tenantId?: string | undefined;
}

/**
 * Checkout session
 */
export interface CheckoutSession {
  /** Provider session ID */
  id: string;
  /** Checkout URL */
  url: string;
  /** Customer ID */
  customerId?: string | undefined;
  /** Payment status */
  status: "open" | "complete" | "expired";
  /** Mode */
  mode: "payment" | "subscription" | "setup";
  /** Amount total */
  amountTotal?: number | undefined;
  /** Currency */
  currency?: CurrencyCode | undefined;
  /** Provider-specific data */
  providerData?: unknown;
}

// ============================================================================
// Subscriptions
// ============================================================================

/**
 * Subscription
 */
export interface Subscription {
  /** Provider subscription ID */
  id: string;
  /** Customer ID */
  customerId: string;
  /** Status */
  status: SubscriptionStatus;
  /** Price ID */
  priceId: string;
  /** Product ID */
  productId?: string | undefined;
  /** Current period start */
  currentPeriodStart: Date;
  /** Current period end */
  currentPeriodEnd: Date;
  /** Cancel at period end */
  cancelAtPeriodEnd: boolean;
  /** Canceled at */
  canceledAt?: Date | undefined;
  /** Trial start */
  trialStart?: Date | undefined;
  /** Trial end */
  trialEnd?: Date | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** Provider-specific data */
  providerData?: unknown;
}

/**
 * Create subscription options
 */
export interface CreateSubscriptionOptions {
  /** Customer ID */
  customerId: string;
  /** Price ID */
  priceId: string;
  /** Trial period days */
  trialDays?: number | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** Payment behavior */
  paymentBehavior?: "default_incomplete" | "error_if_incomplete" | "allow_incomplete" | undefined;
}

/**
 * Update subscription options
 */
export interface UpdateSubscriptionOptions {
  /** New price ID */
  priceId?: string | undefined;
  /** Cancel at period end */
  cancelAtPeriodEnd?: boolean | undefined;
  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
  /** Proration behavior */
  prorationBehavior?: "create_prorations" | "none" | "always_invoice" | undefined;
}

// ============================================================================
// Payments & Invoices
// ============================================================================

/**
 * Payment intent
 */
export interface PaymentIntent {
  /** Provider payment ID */
  id: string;
  /** Amount */
  amount: number;
  /** Currency */
  currency: CurrencyCode;
  /** Status */
  status: PaymentStatus;
  /** Customer ID */
  customerId?: string | undefined;
  /** Provider-specific data */
  providerData?: unknown;
}

/**
 * Invoice
 */
export interface Invoice {
  /** Provider invoice ID */
  id: string;
  /** Customer ID */
  customerId: string;
  /** Subscription ID */
  subscriptionId?: string | undefined;
  /** Status */
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  /** Amount due */
  amountDue: number;
  /** Amount paid */
  amountPaid: number;
  /** Currency */
  currency: CurrencyCode;
  /** Invoice URL */
  hostedInvoiceUrl?: string | undefined;
  /** PDF URL */
  invoicePdf?: string | undefined;
  /** Due date */
  dueDate?: Date | undefined;
  /** Provider-specific data */
  providerData?: unknown;
}

// ============================================================================
// Portal
// ============================================================================

/**
 * Customer portal session
 */
export interface PortalSession {
  /** Portal URL */
  url: string;
  /** Return URL */
  returnUrl: string;
}

/**
 * Create portal options
 */
export interface CreatePortalOptions {
  /** Customer ID */
  customerId: string;
  /** Return URL */
  returnUrl: string;
}

// ============================================================================
// Webhooks
// ============================================================================

/**
 * Webhook event types
 */
export type WebhookEventType =
  // Checkout
  | "checkout.session.completed"
  | "checkout.session.expired"
  // Customer
  | "customer.created"
  | "customer.updated"
  | "customer.deleted"
  // Subscription
  | "subscription.created"
  | "subscription.updated"
  | "subscription.deleted"
  | "subscription.trial_will_end"
  // Payment
  | "payment.succeeded"
  | "payment.failed"
  // Invoice
  | "invoice.created"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.upcoming"
  // Refund
  | "refund.created"
  | "refund.updated";

/**
 * Webhook event
 */
export interface WebhookEvent<T = unknown> {
  /** Event ID */
  id: string;
  /** Event type */
  type: WebhookEventType;
  /** Event data */
  data: T;
  /** Created timestamp */
  created: Date;
  /** Provider type */
  provider: PaymentProviderType;
  /** Raw event data */
  raw: unknown;
}

/**
 * Webhook handler
 */
export type WebhookHandler<T = unknown> = (
  event: WebhookEvent<T>
) => void | Promise<void>;

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Payment provider interface
 */
export interface PaymentProvider {
  /** Provider type */
  readonly type: PaymentProviderType;

  // Customer
  createCustomer(options: CreateCustomerOptions): Promise<Customer>;
  getCustomer(customerId: string): Promise<Customer | null>;
  updateCustomer(customerId: string, options: Partial<CreateCustomerOptions>): Promise<Customer>;
  deleteCustomer(customerId: string): Promise<void>;

  // Checkout
  createCheckout(options: CreateCheckoutOptions): Promise<CheckoutSession>;
  getCheckout(sessionId: string): Promise<CheckoutSession | null>;

  // Subscriptions
  createSubscription(options: CreateSubscriptionOptions): Promise<Subscription>;
  getSubscription(subscriptionId: string): Promise<Subscription | null>;
  updateSubscription(subscriptionId: string, options: UpdateSubscriptionOptions): Promise<Subscription>;
  cancelSubscription(subscriptionId: string, cancelAtPeriodEnd?: boolean): Promise<Subscription>;
  listSubscriptions(customerId: string): Promise<Subscription[]>;

  // Portal
  createPortalSession(options: CreatePortalOptions): Promise<PortalSession>;

  // Webhooks
  verifyWebhook(payload: string | Uint8Array, signature: string): Promise<WebhookEvent | null>;

  // Products & Prices (optional)
  getProduct?(productId: string): Promise<Product | null>;
  getPrice?(priceId: string): Promise<Price | null>;
  listPrices?(productId?: string): Promise<Price[]>;
}

// ============================================================================
// Provider Config
// ============================================================================

/**
 * Stripe provider config
 */
export interface StripeProviderConfig {
  /** Stripe secret key */
  secretKey: string;
  /** Webhook signing secret */
  webhookSecret?: string | undefined;
  /** API version */
  apiVersion?: string | undefined;
}

/**
 * Paddle provider config
 */
export interface PaddleProviderConfig {
  /** Paddle API key */
  apiKey: string;
  /** Paddle environment */
  environment?: "sandbox" | "production" | undefined;
  /** Webhook secret key */
  webhookSecret?: string | undefined;
  /** Seller ID */
  sellerId?: string | undefined;
}

// ============================================================================
// Service Config
// ============================================================================

/**
 * Payment service config
 */
export interface PaymentServiceConfig {
  /** Payment provider */
  provider: PaymentProvider;
  /** Enable debug logging */
  debug?: boolean | undefined;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Payment error
 */
export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

/**
 * Common payment error codes
 */
export const PaymentErrorCodes = {
  INVALID_CONFIG: "INVALID_CONFIG",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  SUBSCRIPTION_NOT_FOUND: "SUBSCRIPTION_NOT_FOUND",
  CHECKOUT_FAILED: "CHECKOUT_FAILED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  WEBHOOK_VERIFICATION_FAILED: "WEBHOOK_VERIFICATION_FAILED",
  API_ERROR: "API_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
} as const;
