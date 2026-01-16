# @parsrun/payments

Edge-compatible payment processing for Pars with subscription and billing support.

## Features

- **Multi-Provider**: Stripe, Paddle, iyzico
- **Subscriptions**: Full subscription lifecycle management
- **Usage Billing**: Metered billing support
- **Webhooks**: Secure webhook handling
- **Dunning**: Failed payment recovery

## Installation

```bash
pnpm add @parsrun/payments
```

## Quick Start

```typescript
import { createPaymentService } from '@parsrun/payments';

const payments = createPaymentService({
  provider: 'stripe',
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
});

// Create checkout session
const session = await payments.createCheckout({
  customerId: 'cus_xxx',
  priceId: 'price_xxx',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
});
```

## API Overview

### Providers

#### Stripe

```typescript
import { createStripeProvider } from '@parsrun/payments/providers/stripe';

const stripe = createStripeProvider({
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
});
```

#### Paddle

```typescript
import { createPaddleProvider } from '@parsrun/payments/providers/paddle';

const paddle = createPaddleProvider({
  vendorId: process.env.PADDLE_VENDOR_ID,
  apiKey: process.env.PADDLE_API_KEY,
});
```

#### iyzico

```typescript
import { createIyzicoProvider } from '@parsrun/payments/providers/iyzico';

const iyzico = createIyzicoProvider({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  sandbox: true,
});
```

### Subscriptions

```typescript
// Create subscription
const subscription = await payments.createSubscription({
  customerId: 'cus_xxx',
  priceId: 'price_xxx',
  trialDays: 14,
});

// Cancel subscription
await payments.cancelSubscription(subscriptionId, {
  cancelAtPeriodEnd: true,
});

// Update subscription
await payments.updateSubscription(subscriptionId, {
  priceId: 'price_new',
});
```

### Billing

```typescript
import { createBillingManager } from '@parsrun/payments/billing';

const billing = createBillingManager({
  provider: stripeProvider,
  database: db,
});

// Get customer billing info
const info = await billing.getCustomerBilling(customerId);

// Create invoice
const invoice = await billing.createInvoice({
  customerId,
  items: [{ description: 'Service', amount: 1000 }],
});
```

### Usage Billing

```typescript
import { createUsageTracker } from '@parsrun/payments/usage';

const usage = createUsageTracker({
  provider: stripeProvider,
});

// Record usage
await usage.record({
  subscriptionId: 'sub_xxx',
  quantity: 100,
  timestamp: new Date(),
});
```

### Webhooks

```typescript
import { createWebhookHandler } from '@parsrun/payments/webhooks';

const webhooks = createWebhookHandler({
  provider: stripeProvider,
  handlers: {
    'checkout.session.completed': async (event) => {
      // Handle successful checkout
    },
    'invoice.payment_failed': async (event) => {
      // Handle failed payment
    },
  },
});

app.post('/webhooks/stripe', webhooks.handle);
```

### Dunning (Payment Recovery)

```typescript
import { createDunningManager } from '@parsrun/payments/dunning';

const dunning = createDunningManager({
  provider: stripeProvider,
  retrySchedule: [1, 3, 7, 14], // Days
  onFinalFailure: async (subscription) => {
    // Handle subscription cancellation
  },
});
```

## Exports

```typescript
import { ... } from '@parsrun/payments';                 // Main exports
import { ... } from '@parsrun/payments/providers/stripe';  // Stripe
import { ... } from '@parsrun/payments/providers/paddle';  // Paddle
import { ... } from '@parsrun/payments/providers/iyzico';  // iyzico
import { ... } from '@parsrun/payments/billing';           // Billing
import { ... } from '@parsrun/payments/usage';             // Usage billing
import { ... } from '@parsrun/payments/webhooks';          // Webhooks
import { ... } from '@parsrun/payments/dunning';           // Dunning
```

## License

MIT
