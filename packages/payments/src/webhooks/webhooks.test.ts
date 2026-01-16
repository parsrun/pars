import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WebhookHandlerRegistry,
  WebhookProcessor,
  createWebhookProcessor,
  createWebhookHandlerRegistry,
  createWebhookHandler,
} from "./index.js";
import type { PaymentProvider, WebhookEvent } from "../types.js";

// Mock provider
function createMockProvider(
  verifyResult: WebhookEvent | null = null
): PaymentProvider {
  return {
    type: "stripe",
    createCustomer: vi.fn(),
    getCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
    createCheckout: vi.fn(),
    getCheckout: vi.fn(),
    createSubscription: vi.fn(),
    getSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    listSubscriptions: vi.fn(),
    createPortalSession: vi.fn(),
    verifyWebhook: vi.fn().mockResolvedValue(verifyResult),
  };
}

// Create mock webhook event
function createMockEvent(type = "checkout.session.completed"): WebhookEvent {
  return {
    id: "evt_test_123",
    type: type as WebhookEvent["type"],
    data: { id: "session_123" },
    created: new Date(),
    provider: "stripe",
    raw: { id: "evt_test_123" },
  };
}

describe("@parsrun/payments - Webhooks", () => {
  describe("WebhookHandlerRegistry", () => {
    let registry: WebhookHandlerRegistry;

    beforeEach(() => {
      registry = new WebhookHandlerRegistry();
    });

    describe("on", () => {
      it("should register handler for specific event type", () => {
        const handler = vi.fn();
        registry.on("checkout.session.completed", handler);

        const handlers = registry.getHandlers("checkout.session.completed");
        expect(handlers).toContain(handler);
      });

      it("should register multiple handlers for same type", () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        registry.on("checkout.session.completed", handler1);
        registry.on("checkout.session.completed", handler2);

        const handlers = registry.getHandlers("checkout.session.completed");
        expect(handlers).toHaveLength(2);
        expect(handlers).toContain(handler1);
        expect(handlers).toContain(handler2);
      });

      it("should register wildcard handler", () => {
        const handler = vi.fn();
        registry.on("*", handler);

        const checkoutHandlers = registry.getHandlers("checkout.session.completed");
        const subscriptionHandlers = registry.getHandlers("subscription.created");

        expect(checkoutHandlers).toContain(handler);
        expect(subscriptionHandlers).toContain(handler);
      });

      it("should be chainable", () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        const result = registry
          .on("checkout.session.completed", handler1)
          .on("subscription.created", handler2);

        expect(result).toBe(registry);
      });
    });

    describe("onCheckout", () => {
      it("should register handler for checkout events", () => {
        const handler = vi.fn();
        registry.onCheckout(handler);

        const completedHandlers = registry.getHandlers("checkout.session.completed");
        const expiredHandlers = registry.getHandlers("checkout.session.expired");

        expect(completedHandlers).toContain(handler);
        expect(expiredHandlers).toContain(handler);
      });
    });

    describe("onSubscription", () => {
      it("should register handler for subscription events", () => {
        const handler = vi.fn();
        registry.onSubscription(handler);

        expect(registry.getHandlers("subscription.created")).toContain(handler);
        expect(registry.getHandlers("subscription.updated")).toContain(handler);
        expect(registry.getHandlers("subscription.deleted")).toContain(handler);
        expect(registry.getHandlers("subscription.trial_will_end")).toContain(handler);
      });
    });

    describe("onPayment", () => {
      it("should register handler for payment events", () => {
        const handler = vi.fn();
        registry.onPayment(handler);

        expect(registry.getHandlers("payment.succeeded")).toContain(handler);
        expect(registry.getHandlers("payment.failed")).toContain(handler);
      });
    });

    describe("onInvoice", () => {
      it("should register handler for invoice events", () => {
        const handler = vi.fn();
        registry.onInvoice(handler);

        expect(registry.getHandlers("invoice.created")).toContain(handler);
        expect(registry.getHandlers("invoice.paid")).toContain(handler);
        expect(registry.getHandlers("invoice.payment_failed")).toContain(handler);
        expect(registry.getHandlers("invoice.upcoming")).toContain(handler);
      });
    });

    describe("onCustomer", () => {
      it("should register handler for customer events", () => {
        const handler = vi.fn();
        registry.onCustomer(handler);

        expect(registry.getHandlers("customer.created")).toContain(handler);
        expect(registry.getHandlers("customer.updated")).toContain(handler);
        expect(registry.getHandlers("customer.deleted")).toContain(handler);
      });
    });

    describe("getHandlers", () => {
      it("should return empty array for unregistered type", () => {
        const handlers = registry.getHandlers("checkout.session.completed");
        expect(handlers).toEqual([]);
      });

      it("should combine specific and wildcard handlers", () => {
        const specificHandler = vi.fn();
        const wildcardHandler = vi.fn();

        registry.on("checkout.session.completed", specificHandler);
        registry.on("*", wildcardHandler);

        const handlers = registry.getHandlers("checkout.session.completed");

        expect(handlers).toContain(specificHandler);
        expect(handlers).toContain(wildcardHandler);
        expect(handlers).toHaveLength(2);
      });
    });

    describe("handle", () => {
      it("should execute all handlers for event", async () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        registry.on("checkout.session.completed", handler1);
        registry.on("checkout.session.completed", handler2);

        const event = createMockEvent("checkout.session.completed");
        await registry.handle(event);

        expect(handler1).toHaveBeenCalledWith(event);
        expect(handler2).toHaveBeenCalledWith(event);
      });

      it("should execute handlers in order", async () => {
        const order: number[] = [];

        registry.on("checkout.session.completed", () => {
          order.push(1);
        });
        registry.on("checkout.session.completed", () => {
          order.push(2);
        });

        await registry.handle(createMockEvent("checkout.session.completed"));

        expect(order).toEqual([1, 2]);
      });

      it("should execute async handlers", async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        registry.on("checkout.session.completed", handler);

        await registry.handle(createMockEvent("checkout.session.completed"));

        expect(handler).toHaveBeenCalled();
      });
    });
  });

  describe("WebhookProcessor", () => {
    describe("constructor", () => {
      it("should create with provider only", () => {
        const provider = createMockProvider();
        const processor = new WebhookProcessor(provider);

        expect(processor.handlers).toBeDefined();
        expect(processor.handlers).toBeInstanceOf(WebhookHandlerRegistry);
      });

      it("should create with custom registry", () => {
        const provider = createMockProvider();
        const registry = new WebhookHandlerRegistry();
        const processor = new WebhookProcessor(provider, registry);

        expect(processor.handlers).toBe(registry);
      });
    });

    describe("processRaw", () => {
      it("should verify webhook and call handlers", async () => {
        const event = createMockEvent();
        const provider = createMockProvider(event);
        const handler = vi.fn();

        const processor = new WebhookProcessor(provider);
        processor.handlers.on("checkout.session.completed", handler);

        const result = await processor.processRaw("payload", "signature");

        expect(result.success).toBe(true);
        expect(result.event).toBe(event);
        expect(provider.verifyWebhook).toHaveBeenCalledWith("payload", "signature");
        expect(handler).toHaveBeenCalledWith(event);
      });

      it("should return error for invalid signature", async () => {
        const provider = createMockProvider(null);
        const processor = new WebhookProcessor(provider);

        const result = await processor.processRaw("payload", "invalid");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid webhook signature");
      });

      it("should return error when handler throws", async () => {
        const event = createMockEvent();
        const provider = createMockProvider(event);
        const processor = new WebhookProcessor(provider);

        processor.handlers.on("checkout.session.completed", () => {
          throw new Error("Handler error");
        });

        const result = await processor.processRaw("payload", "signature");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Handler error");
      });
    });

    describe("process", () => {
      it("should process request with stripe-signature header", async () => {
        const event = createMockEvent();
        const provider = createMockProvider(event);
        const processor = new WebhookProcessor(provider);

        const request = new Request("https://example.com/webhook", {
          method: "POST",
          headers: { "stripe-signature": "test-signature" },
          body: JSON.stringify({ test: "payload" }),
        });

        const result = await processor.process(request);

        expect(result.success).toBe(true);
        expect(provider.verifyWebhook).toHaveBeenCalled();
      });

      it("should process request with paddle-signature header", async () => {
        const event = createMockEvent();
        const provider = createMockProvider(event);
        const processor = new WebhookProcessor(provider);

        const request = new Request("https://example.com/webhook", {
          method: "POST",
          headers: { "paddle-signature": "test-signature" },
          body: JSON.stringify({ test: "payload" }),
        });

        const result = await processor.process(request);

        expect(result.success).toBe(true);
        expect(provider.verifyWebhook).toHaveBeenCalled();
      });

      it("should return error for missing signature", async () => {
        const provider = createMockProvider();
        const processor = new WebhookProcessor(provider);

        const request = new Request("https://example.com/webhook", {
          method: "POST",
          body: JSON.stringify({ test: "payload" }),
        });

        const result = await processor.process(request);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Missing webhook signature");
      });
    });
  });

  describe("factory functions", () => {
    describe("createWebhookProcessor", () => {
      it("should create WebhookProcessor instance", () => {
        const provider = createMockProvider();
        const processor = createWebhookProcessor(provider);

        expect(processor).toBeInstanceOf(WebhookProcessor);
      });

      it("should accept custom registry", () => {
        const provider = createMockProvider();
        const registry = new WebhookHandlerRegistry();
        const processor = createWebhookProcessor(provider, registry);

        expect(processor.handlers).toBe(registry);
      });
    });

    describe("createWebhookHandlerRegistry", () => {
      it("should create WebhookHandlerRegistry instance", () => {
        const registry = createWebhookHandlerRegistry();
        expect(registry).toBeInstanceOf(WebhookHandlerRegistry);
      });
    });

    describe("createWebhookHandler", () => {
      it("should create request handler function", async () => {
        const event = createMockEvent();
        const provider = createMockProvider(event);
        const handler = vi.fn();

        const webhookHandler = createWebhookHandler(provider, {
          "checkout.session.completed": handler,
        });

        const request = new Request("https://example.com/webhook", {
          method: "POST",
          headers: { "stripe-signature": "test" },
          body: JSON.stringify({}),
        });

        const response = await webhookHandler(request);

        expect(response.status).toBe(200);
        expect(handler).toHaveBeenCalled();

        const json = await response.json();
        expect(json).toEqual({ received: true });
      });

      it("should return 400 for invalid webhook", async () => {
        const provider = createMockProvider(null);
        const webhookHandler = createWebhookHandler(provider, {});

        const request = new Request("https://example.com/webhook", {
          method: "POST",
          headers: { "stripe-signature": "invalid" },
          body: JSON.stringify({}),
        });

        const response = await webhookHandler(request);

        expect(response.status).toBe(400);

        const json = await response.json();
        expect(json).toHaveProperty("error");
      });

      it("should support wildcard handler", async () => {
        const event = createMockEvent();
        const provider = createMockProvider(event);
        const handler = vi.fn();

        const webhookHandler = createWebhookHandler(provider, {
          "*": handler,
        });

        const request = new Request("https://example.com/webhook", {
          method: "POST",
          headers: { "stripe-signature": "test" },
          body: JSON.stringify({}),
        });

        await webhookHandler(request);

        expect(handler).toHaveBeenCalledWith(event);
      });
    });
  });
});
