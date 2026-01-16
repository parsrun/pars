import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentService, createPaymentService } from "./index.js";
import type {
  PaymentProvider,
  Customer,
  CheckoutSession,
  Subscription,
  PortalSession,
  Product,
  Price,
  WebhookEvent,
} from "./types.js";

// Mock customer
const mockCustomer: Customer = {
  id: "cus_123",
  email: "test@example.com",
  name: "Test User",
};

// Mock checkout session
const mockCheckoutSession: CheckoutSession = {
  id: "cs_123",
  url: "https://checkout.stripe.com/c/pay/cs_123",
  customerId: "cus_123",
  status: "open",
  mode: "subscription",
  amountTotal: 2999,
  currency: "USD",
};

// Mock subscription
const mockSubscription: Subscription = {
  id: "sub_123",
  customerId: "cus_123",
  status: "active",
  priceId: "price_123",
  productId: "prod_123",
  currentPeriodStart: new Date("2024-01-01"),
  currentPeriodEnd: new Date("2024-02-01"),
  cancelAtPeriodEnd: false,
};

// Mock portal session
const mockPortalSession: PortalSession = {
  url: "https://billing.stripe.com/p/session/ps_123",
  returnUrl: "https://example.com/account",
};

// Mock product
const mockProduct: Product = {
  id: "prod_123",
  name: "Pro Plan",
  description: "Professional plan with all features",
  active: true,
};

// Mock price
const mockPrice: Price = {
  id: "price_123",
  productId: "prod_123",
  unitAmount: 2999,
  currency: "USD",
  recurring: { interval: "month", intervalCount: 1 },
  active: true,
};

// Create mock provider
function createMockProvider(): PaymentProvider {
  return {
    type: "stripe",
    createCustomer: vi.fn().mockResolvedValue(mockCustomer),
    getCustomer: vi.fn().mockResolvedValue(mockCustomer),
    updateCustomer: vi.fn().mockResolvedValue(mockCustomer),
    deleteCustomer: vi.fn().mockResolvedValue(undefined),
    createCheckout: vi.fn().mockResolvedValue(mockCheckoutSession),
    getCheckout: vi.fn().mockResolvedValue(mockCheckoutSession),
    createSubscription: vi.fn().mockResolvedValue(mockSubscription),
    getSubscription: vi.fn().mockResolvedValue(mockSubscription),
    updateSubscription: vi.fn().mockResolvedValue(mockSubscription),
    cancelSubscription: vi.fn().mockResolvedValue({ ...mockSubscription, cancelAtPeriodEnd: true }),
    listSubscriptions: vi.fn().mockResolvedValue([mockSubscription]),
    createPortalSession: vi.fn().mockResolvedValue(mockPortalSession),
    verifyWebhook: vi.fn().mockResolvedValue(null),
    getProduct: vi.fn().mockResolvedValue(mockProduct),
    getPrice: vi.fn().mockResolvedValue(mockPrice),
    listPrices: vi.fn().mockResolvedValue([mockPrice]),
  };
}

describe("@parsrun/payments - PaymentService", () => {
  let service: PaymentService;
  let mockProvider: PaymentProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
    service = new PaymentService({ provider: mockProvider });
  });

  describe("constructor", () => {
    it("should create service with provider", () => {
      expect(service.providerType).toBe("stripe");
    });

    it("should create service with debug mode", () => {
      const debugService = new PaymentService({
        provider: mockProvider,
        debug: true,
      });
      expect(debugService.providerType).toBe("stripe");
    });
  });

  describe("providerType", () => {
    it("should return provider type", () => {
      expect(service.providerType).toBe("stripe");
    });
  });

  describe("webhooks", () => {
    it("should return webhook handler registry", () => {
      expect(service.webhooks).toBeDefined();
    });
  });

  describe("Customer", () => {
    describe("createCustomer", () => {
      it("should create customer", async () => {
        const result = await service.createCustomer({
          email: "test@example.com",
          name: "Test User",
        });

        expect(result).toEqual(mockCustomer);
        expect(mockProvider.createCustomer).toHaveBeenCalledWith({
          email: "test@example.com",
          name: "Test User",
        });
      });
    });

    describe("getCustomer", () => {
      it("should get customer by ID", async () => {
        const result = await service.getCustomer("cus_123");

        expect(result).toEqual(mockCustomer);
        expect(mockProvider.getCustomer).toHaveBeenCalledWith("cus_123");
      });

      it("should return null for non-existent customer", async () => {
        vi.mocked(mockProvider.getCustomer).mockResolvedValue(null);

        const result = await service.getCustomer("cus_invalid");
        expect(result).toBeNull();
      });
    });

    describe("updateCustomer", () => {
      it("should update customer", async () => {
        const result = await service.updateCustomer("cus_123", {
          name: "Updated Name",
        });

        expect(result).toEqual(mockCustomer);
        expect(mockProvider.updateCustomer).toHaveBeenCalledWith("cus_123", {
          name: "Updated Name",
        });
      });
    });

    describe("deleteCustomer", () => {
      it("should delete customer", async () => {
        await service.deleteCustomer("cus_123");

        expect(mockProvider.deleteCustomer).toHaveBeenCalledWith("cus_123");
      });
    });
  });

  describe("Checkout", () => {
    describe("createCheckout", () => {
      it("should create checkout session", async () => {
        const result = await service.createCheckout({
          lineItems: [{ priceId: "price_123", quantity: 1 }],
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
          mode: "subscription",
        });

        expect(result).toEqual(mockCheckoutSession);
        expect(mockProvider.createCheckout).toHaveBeenCalledWith({
          lineItems: [{ priceId: "price_123", quantity: 1 }],
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
          mode: "subscription",
        });
      });
    });

    describe("getCheckout", () => {
      it("should get checkout session", async () => {
        const result = await service.getCheckout("cs_123");

        expect(result).toEqual(mockCheckoutSession);
        expect(mockProvider.getCheckout).toHaveBeenCalledWith("cs_123");
      });

      it("should return null for non-existent session", async () => {
        vi.mocked(mockProvider.getCheckout).mockResolvedValue(null);

        const result = await service.getCheckout("cs_invalid");
        expect(result).toBeNull();
      });
    });
  });

  describe("Subscriptions", () => {
    describe("createSubscription", () => {
      it("should create subscription", async () => {
        const result = await service.createSubscription({
          customerId: "cus_123",
          priceId: "price_123",
        });

        expect(result).toEqual(mockSubscription);
        expect(mockProvider.createSubscription).toHaveBeenCalledWith({
          customerId: "cus_123",
          priceId: "price_123",
        });
      });

      it("should create subscription with trial", async () => {
        await service.createSubscription({
          customerId: "cus_123",
          priceId: "price_123",
          trialDays: 14,
        });

        expect(mockProvider.createSubscription).toHaveBeenCalledWith({
          customerId: "cus_123",
          priceId: "price_123",
          trialDays: 14,
        });
      });
    });

    describe("getSubscription", () => {
      it("should get subscription", async () => {
        const result = await service.getSubscription("sub_123");

        expect(result).toEqual(mockSubscription);
        expect(mockProvider.getSubscription).toHaveBeenCalledWith("sub_123");
      });

      it("should return null for non-existent subscription", async () => {
        vi.mocked(mockProvider.getSubscription).mockResolvedValue(null);

        const result = await service.getSubscription("sub_invalid");
        expect(result).toBeNull();
      });
    });

    describe("updateSubscription", () => {
      it("should update subscription", async () => {
        const result = await service.updateSubscription("sub_123", {
          priceId: "price_456",
        });

        expect(result).toEqual(mockSubscription);
        expect(mockProvider.updateSubscription).toHaveBeenCalledWith("sub_123", {
          priceId: "price_456",
        });
      });
    });

    describe("cancelSubscription", () => {
      it("should cancel subscription at period end", async () => {
        const result = await service.cancelSubscription("sub_123");

        expect(result.cancelAtPeriodEnd).toBe(true);
        expect(mockProvider.cancelSubscription).toHaveBeenCalledWith("sub_123", true);
      });

      it("should cancel subscription immediately", async () => {
        await service.cancelSubscription("sub_123", false);

        expect(mockProvider.cancelSubscription).toHaveBeenCalledWith("sub_123", false);
      });
    });

    describe("listSubscriptions", () => {
      it("should list customer subscriptions", async () => {
        const result = await service.listSubscriptions("cus_123");

        expect(result).toEqual([mockSubscription]);
        expect(mockProvider.listSubscriptions).toHaveBeenCalledWith("cus_123");
      });
    });
  });

  describe("Portal", () => {
    describe("createPortalSession", () => {
      it("should create portal session", async () => {
        const result = await service.createPortalSession({
          customerId: "cus_123",
          returnUrl: "https://example.com/account",
        });

        expect(result).toEqual(mockPortalSession);
        expect(mockProvider.createPortalSession).toHaveBeenCalledWith({
          customerId: "cus_123",
          returnUrl: "https://example.com/account",
        });
      });
    });
  });

  describe("Products & Prices", () => {
    describe("getProduct", () => {
      it("should get product", async () => {
        const result = await service.getProduct("prod_123");

        expect(result).toEqual(mockProduct);
        expect(mockProvider.getProduct).toHaveBeenCalledWith("prod_123");
      });

      it("should return null if provider does not support getProduct", async () => {
        const basicProvider = createMockProvider();
        delete basicProvider.getProduct;

        const basicService = new PaymentService({ provider: basicProvider });
        const result = await basicService.getProduct("prod_123");

        expect(result).toBeNull();
      });
    });

    describe("getPrice", () => {
      it("should get price", async () => {
        const result = await service.getPrice("price_123");

        expect(result).toEqual(mockPrice);
        expect(mockProvider.getPrice).toHaveBeenCalledWith("price_123");
      });

      it("should return null if provider does not support getPrice", async () => {
        const basicProvider = createMockProvider();
        delete basicProvider.getPrice;

        const basicService = new PaymentService({ provider: basicProvider });
        const result = await basicService.getPrice("price_123");

        expect(result).toBeNull();
      });
    });

    describe("listPrices", () => {
      it("should list prices", async () => {
        const result = await service.listPrices();

        expect(result).toEqual([mockPrice]);
        expect(mockProvider.listPrices).toHaveBeenCalled();
      });

      it("should list prices for product", async () => {
        await service.listPrices("prod_123");

        expect(mockProvider.listPrices).toHaveBeenCalledWith("prod_123");
      });

      it("should return empty array if provider does not support listPrices", async () => {
        const basicProvider = createMockProvider();
        delete basicProvider.listPrices;

        const basicService = new PaymentService({ provider: basicProvider });
        const result = await basicService.listPrices();

        expect(result).toEqual([]);
      });
    });
  });

  describe("Webhooks", () => {
    describe("onWebhook", () => {
      it("should register webhook handler", () => {
        const handler = vi.fn();
        const result = service.onWebhook("checkout.session.completed", handler);

        expect(result).toBe(service);
      });

      it("should be chainable", () => {
        const result = service
          .onWebhook("checkout.session.completed", vi.fn())
          .onWebhook("subscription.created", vi.fn());

        expect(result).toBe(service);
      });
    });

    describe("verifyWebhook", () => {
      it("should verify webhook", async () => {
        const mockEvent: WebhookEvent = {
          id: "evt_123",
          type: "checkout.session.completed",
          data: {},
          created: new Date(),
          provider: "stripe",
          raw: {},
        };
        vi.mocked(mockProvider.verifyWebhook).mockResolvedValue(mockEvent);

        const result = await service.verifyWebhook("payload", "signature");

        expect(result).toEqual(mockEvent);
        expect(mockProvider.verifyWebhook).toHaveBeenCalledWith("payload", "signature");
      });

      it("should return null for invalid signature", async () => {
        vi.mocked(mockProvider.verifyWebhook).mockResolvedValue(null);

        const result = await service.verifyWebhook("payload", "invalid");
        expect(result).toBeNull();
      });
    });

    describe("handleWebhookRaw", () => {
      it("should process raw webhook", async () => {
        const mockEvent: WebhookEvent = {
          id: "evt_123",
          type: "checkout.session.completed",
          data: {},
          created: new Date(),
          provider: "stripe",
          raw: {},
        };
        vi.mocked(mockProvider.verifyWebhook).mockResolvedValue(mockEvent);

        const handler = vi.fn();
        service.onWebhook("checkout.session.completed", handler);

        const result = await service.handleWebhookRaw("payload", "signature");

        expect(result.success).toBe(true);
        expect(result.event).toEqual(mockEvent);
        expect(handler).toHaveBeenCalledWith(mockEvent);
      });

      it("should return error for invalid signature", async () => {
        vi.mocked(mockProvider.verifyWebhook).mockResolvedValue(null);

        const result = await service.handleWebhookRaw("payload", "invalid");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid webhook signature");
      });
    });

    describe("handleWebhook", () => {
      it("should process webhook request", async () => {
        const mockEvent: WebhookEvent = {
          id: "evt_123",
          type: "checkout.session.completed",
          data: {},
          created: new Date(),
          provider: "stripe",
          raw: {},
        };
        vi.mocked(mockProvider.verifyWebhook).mockResolvedValue(mockEvent);

        const request = new Request("https://example.com/webhook", {
          method: "POST",
          headers: { "stripe-signature": "test" },
          body: JSON.stringify({}),
        });

        const result = await service.handleWebhook(request);

        expect(result.success).toBe(true);
      });
    });
  });

  describe("createPaymentService factory", () => {
    it("should create PaymentService instance", () => {
      const result = createPaymentService({ provider: mockProvider });

      expect(result).toBeInstanceOf(PaymentService);
    });
  });
});
