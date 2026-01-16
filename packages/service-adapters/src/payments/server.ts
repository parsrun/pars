/**
 * @parsrun/service-adapters - Payments Service Server
 * Server-side implementation of the Payments microservice
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import {
  createRpcServer,
  createEventEmitter,
  createMemoryEventTransport,
  getEmbeddedRegistry,
  type RpcServer,
  type RpcHandlers,
  type EventEmitter,
} from "@parsrun/service";
import { paymentsServiceDefinition } from "./definition.js";

// ============================================================================
// PAYMENTS SERVICE SERVER
// ============================================================================

export interface PaymentsServiceServerOptions {
  /** Payment provider configurations */
  providers: {
    default: PaymentProviderConfig;
    regions?: Record<string, PaymentProviderConfig>;
  };
  /** Database/storage for usage tracking */
  storage?: PaymentsStorage;
  /** Logger */
  logger?: Logger;
  /** Event transport (for emitting events) */
  eventTransport?: ReturnType<typeof createMemoryEventTransport>;
}

export interface PaymentProviderConfig {
  type: "stripe" | "paddle" | "iyzico" | "mock";
  secretKey?: string;
  webhookSecret?: string;
}

export interface PaymentsStorage {
  // Usage tracking
  getUsage(customerId: string, featureKey: string): Promise<number>;
  trackUsage(customerId: string, featureKey: string, quantity: number): Promise<number>;
  resetUsage(customerId: string, featureKey?: string): Promise<void>;

  // Plans
  getPlan(planId: string): Promise<Plan | null>;
  getPlans(): Promise<Plan[]>;
  getCustomerPlan(customerId: string): Promise<string | null>;
  setCustomerPlan(customerId: string, planId: string): Promise<void>;
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

// In-memory storage for demo
class InMemoryPaymentsStorage implements PaymentsStorage {
  private usage: Map<string, number> = new Map();
  private customerPlans: Map<string, string> = new Map();
  private plans: Plan[] = [
    {
      id: "free",
      name: "free",
      displayName: "Free",
      tier: 0,
      basePrice: 0,
      currency: "USD",
      billingInterval: "month",
      features: [
        { featureKey: "api_calls", limitValue: 1000, limitPeriod: "month" },
        { featureKey: "storage_mb", limitValue: 100, limitPeriod: null },
      ],
    },
    {
      id: "pro",
      name: "pro",
      displayName: "Pro",
      tier: 1,
      basePrice: 2900,
      currency: "USD",
      billingInterval: "month",
      features: [
        { featureKey: "api_calls", limitValue: 100000, limitPeriod: "month" },
        { featureKey: "storage_mb", limitValue: 10000, limitPeriod: null },
      ],
    },
    {
      id: "enterprise",
      name: "enterprise",
      displayName: "Enterprise",
      tier: 2,
      basePrice: 9900,
      currency: "USD",
      billingInterval: "month",
      features: [
        { featureKey: "api_calls", limitValue: null, limitPeriod: "month" },
        { featureKey: "storage_mb", limitValue: null, limitPeriod: null },
      ],
    },
  ];

  async getUsage(customerId: string, featureKey: string): Promise<number> {
    return this.usage.get(`${customerId}:${featureKey}`) ?? 0;
  }

  async trackUsage(customerId: string, featureKey: string, quantity: number): Promise<number> {
    const key = `${customerId}:${featureKey}`;
    const current = this.usage.get(key) ?? 0;
    const newTotal = current + quantity;
    this.usage.set(key, newTotal);
    return newTotal;
  }

  async resetUsage(customerId: string, featureKey?: string): Promise<void> {
    if (featureKey) {
      this.usage.delete(`${customerId}:${featureKey}`);
    } else {
      for (const key of this.usage.keys()) {
        if (key.startsWith(`${customerId}:`)) {
          this.usage.delete(key);
        }
      }
    }
  }

  async getPlan(planId: string): Promise<Plan | null> {
    return this.plans.find((p) => p.id === planId) ?? null;
  }

  async getPlans(): Promise<Plan[]> {
    return this.plans;
  }

  async getCustomerPlan(customerId: string): Promise<string | null> {
    return this.customerPlans.get(customerId) ?? "free";
  }

  async setCustomerPlan(customerId: string, planId: string): Promise<void> {
    this.customerPlans.set(customerId, planId);
  }
}

/**
 * Create Payments Service Server
 */
export function createPaymentsServiceServer(
  options: PaymentsServiceServerOptions
): {
  rpcServer: RpcServer;
  eventEmitter: EventEmitter;
  register: () => void;
} {
  const logger = options.logger ?? createLogger({ name: "payments-service" });
  const eventTransport = options.eventTransport ?? createMemoryEventTransport();
  const storage = options.storage ?? new InMemoryPaymentsStorage();

  // Create event emitter
  const eventEmitter = createEventEmitter({
    service: "payments",
    definition: paymentsServiceDefinition,
    transport: eventTransport,
    logger,
  });

  // Create handlers
  const handlers: RpcHandlers = {
    queries: {
      getSubscription: async (input, ctx) => {
        const { subscriptionId, customerId } = input as {
          subscriptionId?: string;
          customerId?: string;
        };
        ctx.logger.debug("Getting subscription", { subscriptionId, customerId });

        // Mock response
        if (!subscriptionId && !customerId) {
          return null;
        }

        return {
          id: subscriptionId ?? `sub_${customerId}`,
          customerId: customerId ?? "cus_123",
          status: "active",
          planId: "pro",
          planName: "Pro",
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          cancelAtPeriodEnd: false,
          provider: options.providers.default.type,
        };
      },

      getCustomer: async (input, ctx) => {
        const { customerId } = input as { customerId: string };
        ctx.logger.debug("Getting customer", { customerId });

        return {
          id: customerId,
          email: `${customerId}@example.com`,
          name: "Test Customer",
          provider: options.providers.default.type,
        };
      },

      checkQuota: async (input, ctx) => {
        const { customerId, featureKey } = input as {
          customerId: string;
          featureKey: string;
        };
        ctx.logger.debug("Checking quota", { customerId, featureKey });

        const planId = await storage.getCustomerPlan(customerId);
        const plan = planId ? await storage.getPlan(planId) : null;
        const feature = plan?.features.find((f) => f.featureKey === featureKey);
        const used = await storage.getUsage(customerId, featureKey);
        const limit = feature?.limitValue ?? null;

        const percentage = limit ? Math.round((used / limit) * 100) : 0;
        const allowed = limit === null || used < limit;

        return {
          allowed,
          remaining: limit !== null ? Math.max(0, limit - used) : null,
          limit,
          percentage,
        };
      },

      getUsage: async (input, ctx) => {
        const { customerId, featureKey } = input as {
          customerId: string;
          featureKey?: string;
        };
        ctx.logger.debug("Getting usage", { customerId, featureKey });

        const planId = await storage.getCustomerPlan(customerId);
        const plan = planId ? await storage.getPlan(planId) : null;

        const features = [];
        const featuresToCheck = featureKey
          ? plan?.features.filter((f) => f.featureKey === featureKey) ?? []
          : plan?.features ?? [];

        for (const f of featuresToCheck) {
          const used = await storage.getUsage(customerId, f.featureKey);
          features.push({
            featureKey: f.featureKey,
            used,
            limit: f.limitValue,
            percentage: f.limitValue ? Math.round((used / f.limitValue) * 100) : 0,
          });
        }

        return {
          features,
          period: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            end: new Date().toISOString(),
          },
        };
      },

      getPlans: async (_input, ctx) => {
        ctx.logger.debug("Getting plans");
        const plans = await storage.getPlans();
        return { plans };
      },

      getDunningStatus: async (input, ctx) => {
        const { customerId } = input as { customerId: string };
        ctx.logger.debug("Getting dunning status", { customerId });

        // Mock - no dunning
        return { inDunning: false };
      },
    },

    mutations: {
      createCheckout: async (input, ctx) => {
        const { email, planId, successUrl: _successUrl, cancelUrl: _cancelUrl, countryCode } = input as {
          email: string;
          planId: string;
          successUrl: string;
          cancelUrl: string;
          countryCode?: string;
        };
        void _successUrl; void _cancelUrl; // Reserved for real implementation
        ctx.logger.info("Creating checkout", { email, planId, countryCode });

        const sessionId = `cs_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const customerId = `cus_${Date.now()}`;

        return {
          checkoutUrl: `https://checkout.example.com/${sessionId}`,
          sessionId,
          customerId,
          provider: options.providers.default.type,
        };
      },

      cancelSubscription: async (input, ctx) => {
        const { subscriptionId, cancelAtPeriodEnd, reason } = input as {
          subscriptionId: string;
          cancelAtPeriodEnd?: boolean;
          reason?: string;
        };
        ctx.logger.info("Canceling subscription", { subscriptionId, reason });

        await eventEmitter.emit("subscription.canceled", {
          subscriptionId,
          customerId: "cus_123",
          reason,
          effectiveAt: cancelAtPeriodEnd
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : new Date().toISOString(),
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          canceledAt: new Date().toISOString(),
          effectiveAt: cancelAtPeriodEnd
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : new Date().toISOString(),
        };
      },

      updateSubscription: async (input, ctx) => {
        const { subscriptionId, planId } = input as {
          subscriptionId: string;
          planId?: string;
        };
        ctx.logger.info("Updating subscription", { subscriptionId, planId });

        if (planId) {
          await eventEmitter.emit("subscription.plan_changed", {
            subscriptionId,
            customerId: "cus_123",
            previousPlanId: "pro",
            newPlanId: planId,
            timestamp: new Date().toISOString(),
          });
        }

        return {
          success: true,
          subscription: {
            id: subscriptionId,
            planId: planId ?? "pro",
            status: "active",
          },
        };
      },

      createPortalSession: async (input, ctx) => {
        const { customerId, returnUrl: _returnUrl } = input as {
          customerId: string;
          returnUrl: string;
        };
        void _returnUrl; // Reserved for real implementation
        ctx.logger.info("Creating portal session", { customerId });

        return {
          portalUrl: `https://billing.example.com/portal/${customerId}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        };
      },

      trackUsage: async (input, ctx) => {
        const { customerId, featureKey, quantity } = input as {
          customerId: string;
          featureKey: string;
          quantity: number;
        };
        ctx.logger.debug("Tracking usage", { customerId, featureKey, quantity });

        const newTotal = await storage.trackUsage(customerId, featureKey, quantity);

        // Check quota
        const planId = await storage.getCustomerPlan(customerId);
        const plan = planId ? await storage.getPlan(planId) : null;
        const feature = plan?.features.find((f) => f.featureKey === featureKey);
        const limit = feature?.limitValue ?? null;

        // Emit events if thresholds reached
        if (limit !== null) {
          const percentage = Math.round((newTotal / limit) * 100);

          if (percentage >= 100 && newTotal - quantity < limit) {
            await eventEmitter.emit("quota.exceeded", {
              customerId,
              featureKey,
              used: newTotal,
              limit,
              timestamp: new Date().toISOString(),
            });
          } else if (percentage >= 80 && Math.round(((newTotal - quantity) / limit) * 100) < 80) {
            await eventEmitter.emit("quota.threshold_reached", {
              customerId,
              featureKey,
              percentage,
              used: newTotal,
              limit,
              timestamp: new Date().toISOString(),
            });
          }
        }

        return {
          success: true,
          newTotal,
          remaining: limit !== null ? Math.max(0, limit - newTotal) : null,
        };
      },

      assignPlan: async (input, ctx) => {
        const { customerId, planId } = input as {
          customerId: string;
          planId: string;
        };
        ctx.logger.info("Assigning plan", { customerId, planId });

        const previousPlanId = await storage.getCustomerPlan(customerId);
        await storage.setCustomerPlan(customerId, planId);

        return {
          success: true,
          previousPlanId: previousPlanId ?? undefined,
          newPlanId: planId,
        };
      },

      handleWebhook: async (input, ctx) => {
        const { provider, payload: _payload, signature: _signature } = input as {
          provider: string;
          payload: string;
          signature: string;
        };
        void _payload; void _signature; // Reserved for real webhook verification
        ctx.logger.info("Handling webhook", { provider });

        // In real implementation, would verify signature and process event
        return {
          success: true,
          eventType: "payment.succeeded",
          eventId: `evt_${Date.now()}`,
        };
      },
    },
  };

  // Create RPC server
  const rpcServer = createRpcServer({
    definition: paymentsServiceDefinition,
    handlers,
    logger,
  });

  // Register function
  const register = () => {
    const registry = getEmbeddedRegistry();
    registry.register("payments", rpcServer);
    logger.info("Payments service registered");
  };

  return {
    rpcServer,
    eventEmitter,
    register,
  };
}
