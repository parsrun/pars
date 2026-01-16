/**
 * @module
 * Payment provider validation schemas for subscriptions and transactions.
 * Supports Stripe, Paddle, and iyzico providers.
 *
 * @example
 * ```typescript
 * import { subscription, paymentIntent, type Subscription } from '@parsrun/types';
 *
 * const sub: Subscription = {
 *   id: '...',
 *   customerId: '...',
 *   priceId: '...',
 *   status: 'active',
 *   currentPeriodStart: '2024-01-01T00:00:00Z',
 *   currentPeriodEnd: '2024-02-01T00:00:00Z'
 * };
 * ```
 */

import { type } from "arktype";
import { timestamp, uuid } from "./common";

// ============================================================================
// Currency & Amount Schemas
// ============================================================================

/** Currency code (ISO 4217) */
export const currencyCode = type("string >= 3");

/** Money amount with currency */
export const money = type({
  amount: "number",
  currency: currencyCode,
});

// ============================================================================
// Customer Schemas
// ============================================================================

/** Payment customer */
export const paymentCustomer = type({
  id: uuid,
  "externalId?": "string",
  email: "string.email",
  "name?": "string",
  "phone?": "string",
  "metadata?": "object",
  insertedAt: timestamp,
  updatedAt: timestamp,
});

/** Create customer request */
export const createCustomerRequest = type({
  email: "string.email",
  "name?": "string",
  "phone?": "string",
  "metadata?": "object",
});

// ============================================================================
// Payment Method Schemas
// ============================================================================

/** Card details */
export const cardDetails = type({
  brand: "string",
  last4: "string",
  expMonth: "number >= 1",
  expYear: "number >= 2000",
  "fingerprint?": "string",
});

/** Payment method */
export const paymentMethod = type({
  id: uuid,
  "externalId?": "string",
  customerId: uuid,
  type: "'card' | 'bank_account' | 'paypal' | 'crypto' | 'other'",
  "card?": cardDetails,
  isDefault: "boolean",
  "metadata?": "object",
  insertedAt: timestamp,
  updatedAt: timestamp,
});

// ============================================================================
// Payment Intent Schemas
// ============================================================================

/** Payment intent status */
export const paymentIntentStatus = type(
  "'created' | 'processing' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'"
);

/** Payment intent */
export const paymentIntent = type({
  id: uuid,
  "externalId?": "string",
  customerId: uuid,
  "paymentMethodId?": uuid,
  amount: "number > 0",
  currency: currencyCode,
  status: paymentIntentStatus,
  "description?": "string",
  "metadata?": "object",
  "clientSecret?": "string",
  "failureReason?": "string",
  insertedAt: timestamp,
  updatedAt: timestamp,
});

/** Create payment intent request */
export const createPaymentIntentRequest = type({
  customerId: uuid,
  amount: "number > 0",
  currency: currencyCode,
  "paymentMethodId?": uuid,
  "description?": "string",
  "metadata?": "object",
  "confirm?": "boolean",
  "returnUrl?": "string",
});

// ============================================================================
// Subscription Schemas
// ============================================================================

/** Subscription status */
export const subscriptionStatus = type(
  "'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused'"
);

/** Price interval */
export const priceInterval = type("'day' | 'week' | 'month' | 'year'");

/** Price */
export const price = type({
  id: uuid,
  "externalId?": "string",
  productId: uuid,
  amount: "number >= 0",
  currency: currencyCode,
  interval: priceInterval,
  "intervalCount?": "number >= 1",
  "trialDays?": "number >= 0",
  isActive: "boolean",
  "metadata?": "object",
});

/** Subscription */
export const subscription = type({
  id: uuid,
  "externalId?": "string",
  customerId: uuid,
  priceId: uuid,
  status: subscriptionStatus,
  currentPeriodStart: timestamp,
  currentPeriodEnd: timestamp,
  "cancelAt?": timestamp,
  "canceledAt?": timestamp,
  "trialStart?": timestamp,
  "trialEnd?": timestamp,
  "metadata?": "object",
  insertedAt: timestamp,
  updatedAt: timestamp,
});

/** Create subscription request */
export const createSubscriptionRequest = type({
  customerId: uuid,
  priceId: uuid,
  "paymentMethodId?": uuid,
  "trialDays?": "number >= 0",
  "metadata?": "object",
});

// ============================================================================
// Refund Schemas
// ============================================================================

/** Refund status */
export const refundStatus = type("'pending' | 'succeeded' | 'failed' | 'canceled'");

/** Refund */
export const refund = type({
  id: uuid,
  "externalId?": "string",
  paymentIntentId: uuid,
  amount: "number > 0",
  currency: currencyCode,
  status: refundStatus,
  "reason?": "string",
  "metadata?": "object",
  insertedAt: timestamp,
  updatedAt: timestamp,
});

/** Create refund request */
export const createRefundRequest = type({
  paymentIntentId: uuid,
  "amount?": "number > 0",
  "reason?": "string",
  "metadata?": "object",
});

// ============================================================================
// Webhook Schemas
// ============================================================================

/** Webhook event types */
export const webhookEventType = type(
  "'payment.succeeded' | 'payment.failed' | 'subscription.created' | 'subscription.updated' | 'subscription.canceled' | 'refund.created' | 'customer.created' | 'customer.updated'"
);

/** Webhook event */
export const webhookEvent = type({
  id: uuid,
  type: webhookEventType,
  data: "object",
  "livemode?": "boolean",
  "apiVersion?": "string",
  createdAt: timestamp,
});

// ============================================================================
// Provider Config Schemas
// ============================================================================

/** Stripe config */
export const stripeConfig = type({
  secretKey: "string >= 1",
  "publishableKey?": "string",
  "webhookSecret?": "string",
  "apiVersion?": "string",
});

/** Paddle config */
export const paddleConfig = type({
  vendorId: "string >= 1",
  vendorAuthCode: "string >= 1",
  "publicKey?": "string",
  "webhookSecret?": "string",
  "sandbox?": "boolean",
});

/** iyzico config */
export const iyzicoConfig = type({
  apiKey: "string >= 1",
  secretKey: "string >= 1",
  baseUrl: "string >= 1",
  "sandbox?": "boolean",
});

/** Payments config */
export const paymentsConfig = type({
  provider: "'stripe' | 'paddle' | 'iyzico'",
  "currency?": currencyCode,
  "stripe?": stripeConfig,
  "paddle?": paddleConfig,
  "iyzico?": iyzicoConfig,
  "webhookPath?": "string",
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * ISO 4217 currency code type.
 * Represents a 3-letter currency code (e.g., "USD", "EUR", "GBP").
 */
export type CurrencyCode = typeof currencyCode.infer;

/**
 * Money type with amount and currency.
 * Represents a monetary value with its currency code.
 */
export type Money = typeof money.infer;

/**
 * Payment customer type.
 * Represents a customer in the payment system with email, name, and metadata.
 */
export type PaymentCustomer = typeof paymentCustomer.infer;

/**
 * Create customer request type.
 * Contains email, optional name, phone, and metadata for creating customers.
 */
export type CreateCustomerRequest = typeof createCustomerRequest.infer;

/**
 * Card details type.
 * Contains card brand, last 4 digits, expiration, and optional fingerprint.
 */
export type CardDetails = typeof cardDetails.infer;

/**
 * Payment method type.
 * Represents a stored payment method (card, bank account, etc.) for a customer.
 */
export type PaymentMethod = typeof paymentMethod.infer;

/**
 * Payment intent status type.
 * Represents payment lifecycle: 'created' | 'processing' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'.
 */
export type PaymentIntentStatus = typeof paymentIntentStatus.infer;

/**
 * Payment intent type.
 * Represents a payment attempt with amount, currency, status, and customer info.
 */
export type PaymentIntent = typeof paymentIntent.infer;

/**
 * Create payment intent request type.
 * Contains customer ID, amount, currency, and optional payment method.
 */
export type CreatePaymentIntentRequest = typeof createPaymentIntentRequest.infer;

/**
 * Subscription status type.
 * Represents subscription states: 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' | 'paused'.
 */
export type SubscriptionStatus = typeof subscriptionStatus.infer;

/**
 * Price interval type.
 * Represents billing frequency: 'day' | 'week' | 'month' | 'year'.
 */
export type PriceInterval = typeof priceInterval.infer;

/**
 * Price type.
 * Represents a recurring price with amount, currency, interval, and trial settings.
 */
export type Price = typeof price.infer;

/**
 * Subscription type.
 * Represents a recurring subscription with status, billing period, and trial info.
 */
export type Subscription = typeof subscription.infer;

/**
 * Create subscription request type.
 * Contains customer ID, price ID, optional payment method, and trial days.
 */
export type CreateSubscriptionRequest = typeof createSubscriptionRequest.infer;

/**
 * Refund status type.
 * Represents refund states: 'pending' | 'succeeded' | 'failed' | 'canceled'.
 */
export type RefundStatus = typeof refundStatus.infer;

/**
 * Refund type.
 * Represents a refund for a payment with amount, status, and reason.
 */
export type Refund = typeof refund.infer;

/**
 * Create refund request type.
 * Contains payment intent ID, optional amount for partial refunds, and reason.
 */
export type CreateRefundRequest = typeof createRefundRequest.infer;

/**
 * Webhook event type.
 * Represents payment webhook event types like payment.succeeded, subscription.created, etc.
 */
export type WebhookEventType = typeof webhookEventType.infer;

/**
 * Webhook event type.
 * Represents a payment provider webhook event with type, data, and timestamp.
 */
export type WebhookEvent = typeof webhookEvent.infer;

/**
 * Stripe configuration type.
 * Contains Stripe API keys and webhook secret.
 */
export type StripeConfig = typeof stripeConfig.infer;

/**
 * Paddle configuration type.
 * Contains Paddle vendor credentials and webhook settings.
 */
export type PaddleConfig = typeof paddleConfig.infer;

/**
 * iyzico configuration type.
 * Contains iyzico API credentials and base URL.
 */
export type IyzicoConfig = typeof iyzicoConfig.infer;

/**
 * Payments configuration type.
 * Contains provider selection and provider-specific configuration.
 */
export type PaymentsConfig = typeof paymentsConfig.infer;
