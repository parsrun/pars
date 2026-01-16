/**
 * @parsrun/payments - Webhook Handlers
 * Utilities for handling payment webhooks
 */

import type {
  PaymentProvider,
  WebhookEvent,
  WebhookEventType,
  WebhookHandler,
} from "../types.js";

/**
 * Webhook event handler registry
 */
export class WebhookHandlerRegistry {
  private handlers = new Map<WebhookEventType | "*", WebhookHandler[]>();

  /**
   * Register a handler for a specific event type
   */
  on<T = unknown>(type: WebhookEventType | "*", handler: WebhookHandler<T>): this {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler as WebhookHandler);
    this.handlers.set(type, handlers);
    return this;
  }

  /**
   * Register handlers for checkout events
   */
  onCheckout(handler: WebhookHandler): this {
    this.on("checkout.session.completed", handler);
    this.on("checkout.session.expired", handler);
    return this;
  }

  /**
   * Register handlers for subscription events
   */
  onSubscription(handler: WebhookHandler): this {
    this.on("subscription.created", handler);
    this.on("subscription.updated", handler);
    this.on("subscription.deleted", handler);
    this.on("subscription.trial_will_end", handler);
    return this;
  }

  /**
   * Register handlers for payment events
   */
  onPayment(handler: WebhookHandler): this {
    this.on("payment.succeeded", handler);
    this.on("payment.failed", handler);
    return this;
  }

  /**
   * Register handlers for invoice events
   */
  onInvoice(handler: WebhookHandler): this {
    this.on("invoice.created", handler);
    this.on("invoice.paid", handler);
    this.on("invoice.payment_failed", handler);
    this.on("invoice.upcoming", handler);
    return this;
  }

  /**
   * Register handlers for customer events
   */
  onCustomer(handler: WebhookHandler): this {
    this.on("customer.created", handler);
    this.on("customer.updated", handler);
    this.on("customer.deleted", handler);
    return this;
  }

  /**
   * Get handlers for an event type
   */
  getHandlers(type: WebhookEventType): WebhookHandler[] {
    const specificHandlers = this.handlers.get(type) ?? [];
    const globalHandlers = this.handlers.get("*") ?? [];
    return [...specificHandlers, ...globalHandlers];
  }

  /**
   * Execute all handlers for an event
   */
  async handle(event: WebhookEvent): Promise<void> {
    const handlers = this.getHandlers(event.type);

    for (const handler of handlers) {
      await handler(event);
    }
  }
}

/**
 * Webhook processor for handling incoming webhooks
 */
export class WebhookProcessor {
  private provider: PaymentProvider;
  private registry: WebhookHandlerRegistry;

  constructor(provider: PaymentProvider, registry?: WebhookHandlerRegistry) {
    this.provider = provider;
    this.registry = registry ?? new WebhookHandlerRegistry();
  }

  /**
   * Get the handler registry
   */
  get handlers(): WebhookHandlerRegistry {
    return this.registry;
  }

  /**
   * Process a webhook request
   */
  async process(request: Request): Promise<WebhookProcessResult> {
    try {
      // Get payload and signature
      const payload = await request.text();
      const signature = this.getSignature(request);

      if (!signature) {
        return {
          success: false,
          error: "Missing webhook signature",
        };
      }

      // Verify webhook
      const event = await this.provider.verifyWebhook(payload, signature);

      if (!event) {
        return {
          success: false,
          error: "Invalid webhook signature",
        };
      }

      // Handle event
      await this.registry.handle(event);

      return {
        success: true,
        event,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Process raw webhook payload
   */
  async processRaw(
    payload: string | Uint8Array,
    signature: string
  ): Promise<WebhookProcessResult> {
    try {
      // Verify webhook
      const event = await this.provider.verifyWebhook(payload, signature);

      if (!event) {
        return {
          success: false,
          error: "Invalid webhook signature",
        };
      }

      // Handle event
      await this.registry.handle(event);

      return {
        success: true,
        event,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private getSignature(request: Request): string | null {
    // Stripe uses stripe-signature header
    const stripeSignature = request.headers.get("stripe-signature");
    if (stripeSignature) return stripeSignature;

    // Paddle uses paddle-signature header
    const paddleSignature = request.headers.get("paddle-signature");
    if (paddleSignature) return paddleSignature;

    return null;
  }
}

/**
 * Webhook process result
 */
export interface WebhookProcessResult {
  success: boolean;
  event?: WebhookEvent | undefined;
  error?: string | undefined;
}

/**
 * Create a webhook processor
 */
export function createWebhookProcessor(
  provider: PaymentProvider,
  registry?: WebhookHandlerRegistry
): WebhookProcessor {
  return new WebhookProcessor(provider, registry);
}

/**
 * Create a webhook handler registry
 */
export function createWebhookHandlerRegistry(): WebhookHandlerRegistry {
  return new WebhookHandlerRegistry();
}

/**
 * Create a Hono/Express-compatible webhook handler
 */
export function createWebhookHandler(
  provider: PaymentProvider,
  handlers: Partial<Record<WebhookEventType | "*", WebhookHandler>>
): (request: Request) => Promise<Response> {
  const registry = new WebhookHandlerRegistry();

  for (const [type, handler] of Object.entries(handlers)) {
    if (handler) {
      registry.on(type as WebhookEventType, handler);
    }
  }

  const processor = new WebhookProcessor(provider, registry);

  return async (request: Request): Promise<Response> => {
    const result = await processor.process(request);

    if (result.success) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  };
}
