/**
 * @parsrun/types - Payments Schemas
 * Payment provider validation schemas
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

export type CurrencyCode = typeof currencyCode.infer;
export type Money = typeof money.infer;
export type PaymentCustomer = typeof paymentCustomer.infer;
export type CreateCustomerRequest = typeof createCustomerRequest.infer;
export type CardDetails = typeof cardDetails.infer;
export type PaymentMethod = typeof paymentMethod.infer;
export type PaymentIntentStatus = typeof paymentIntentStatus.infer;
export type PaymentIntent = typeof paymentIntent.infer;
export type CreatePaymentIntentRequest = typeof createPaymentIntentRequest.infer;
export type SubscriptionStatus = typeof subscriptionStatus.infer;
export type PriceInterval = typeof priceInterval.infer;
export type Price = typeof price.infer;
export type Subscription = typeof subscription.infer;
export type CreateSubscriptionRequest = typeof createSubscriptionRequest.infer;
export type RefundStatus = typeof refundStatus.infer;
export type Refund = typeof refund.infer;
export type CreateRefundRequest = typeof createRefundRequest.infer;
export type WebhookEventType = typeof webhookEventType.infer;
export type WebhookEvent = typeof webhookEvent.infer;
export type StripeConfig = typeof stripeConfig.infer;
export type PaddleConfig = typeof paddleConfig.infer;
export type IyzicoConfig = typeof iyzicoConfig.infer;
export type PaymentsConfig = typeof paymentsConfig.infer;
