/**
 * @parsrun/service-adapters - Payments Service Definition
 */

import { defineService } from "@parsrun/service";

/**
 * Payments Service Definition
 *
 * Provides payment processing, billing, usage tracking,
 * and dunning capabilities as a microservice.
 */
export const paymentsServiceDefinition = defineService({
  name: "payments",
  version: "1.0.0",
  description: "Payments, billing, and subscription management microservice",

  queries: {
    /**
     * Get subscription details
     */
    getSubscription: {
      input: undefined as unknown as {
        subscriptionId?: string;
        customerId?: string;
      },
      output: undefined as unknown as {
        id: string;
        customerId: string;
        status: "active" | "canceled" | "past_due" | "trialing" | "paused";
        planId: string;
        planName: string;
        currentPeriodStart: string;
        currentPeriodEnd: string;
        cancelAtPeriodEnd: boolean;
        provider: string;
      } | null,
      description: "Get subscription details by ID or customer ID",
    },

    /**
     * Get customer details
     */
    getCustomer: {
      input: undefined as unknown as { customerId: string },
      output: undefined as unknown as {
        id: string;
        email: string;
        name?: string;
        metadata?: Record<string, unknown>;
        provider: string;
      } | null,
      description: "Get customer details",
    },

    /**
     * Check quota status
     */
    checkQuota: {
      input: undefined as unknown as {
        customerId: string;
        featureKey: string;
      },
      output: undefined as unknown as {
        allowed: boolean;
        remaining: number | null;
        limit: number | null;
        resetAt?: string;
        percentage: number;
      },
      description: "Check if customer has quota for a feature",
    },

    /**
     * Get usage summary
     */
    getUsage: {
      input: undefined as unknown as {
        customerId: string;
        featureKey?: string;
        period?: "hour" | "day" | "month";
      },
      output: undefined as unknown as {
        features: Array<{
          featureKey: string;
          used: number;
          limit: number | null;
          percentage: number;
        }>;
        period: {
          start: string;
          end: string;
        };
      },
      description: "Get usage summary for a customer",
    },

    /**
     * Get available plans
     */
    getPlans: {
      input: undefined,
      output: undefined as unknown as {
        plans: Array<{
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
        }>;
      },
      description: "Get available subscription plans",
    },

    /**
     * Get dunning status
     */
    getDunningStatus: {
      input: undefined as unknown as { customerId: string },
      output: undefined as unknown as {
        inDunning: boolean;
        status?: "active" | "resolved" | "abandoned" | "recovered";
        currentStep?: number;
        totalSteps?: number;
        nextActionAt?: string;
        daysSinceFailure?: number;
      },
      description: "Get dunning status for a customer",
    },
  },

  mutations: {
    /**
     * Create a checkout session
     */
    createCheckout: {
      input: undefined as unknown as {
        email: string;
        planId: string;
        successUrl: string;
        cancelUrl: string;
        countryCode?: string;
        metadata?: Record<string, unknown>;
      },
      output: undefined as unknown as {
        checkoutUrl: string;
        sessionId: string;
        customerId?: string;
        provider: string;
      },
      description: "Create a checkout session for subscription",
    },

    /**
     * Cancel a subscription
     */
    cancelSubscription: {
      input: undefined as unknown as {
        subscriptionId: string;
        cancelAtPeriodEnd?: boolean;
        reason?: string;
      },
      output: undefined as unknown as {
        success: boolean;
        canceledAt?: string;
        effectiveAt?: string;
      },
      description: "Cancel a subscription",
    },

    /**
     * Update subscription
     */
    updateSubscription: {
      input: undefined as unknown as {
        subscriptionId: string;
        planId?: string;
        metadata?: Record<string, unknown>;
      },
      output: undefined as unknown as {
        success: boolean;
        subscription: {
          id: string;
          planId: string;
          status: string;
        };
      },
      description: "Update a subscription (e.g., change plan)",
    },

    /**
     * Create customer portal session
     */
    createPortalSession: {
      input: undefined as unknown as {
        customerId: string;
        returnUrl: string;
      },
      output: undefined as unknown as {
        portalUrl: string;
        expiresAt?: string;
      },
      description: "Create a customer portal session for self-service",
    },

    /**
     * Track usage
     */
    trackUsage: {
      input: undefined as unknown as {
        customerId: string;
        featureKey: string;
        quantity: number;
        metadata?: Record<string, unknown>;
      },
      output: undefined as unknown as {
        success: boolean;
        newTotal: number;
        remaining: number | null;
      },
      description: "Track usage of a metered feature",
    },

    /**
     * Assign plan to customer
     */
    assignPlan: {
      input: undefined as unknown as {
        customerId: string;
        planId: string;
        expiresAt?: string;
      },
      output: undefined as unknown as {
        success: boolean;
        previousPlanId?: string;
        newPlanId: string;
      },
      description: "Manually assign a plan to a customer",
    },

    /**
     * Handle webhook
     */
    handleWebhook: {
      input: undefined as unknown as {
        provider: "stripe" | "paddle" | "iyzico";
        payload: string;
        signature: string;
      },
      output: undefined as unknown as {
        success: boolean;
        eventType?: string;
        eventId?: string;
      },
      description: "Handle payment provider webhook",
    },
  },

  events: {
    emits: {
      /**
       * Subscription was created
       */
      "subscription.created": {
        data: undefined as unknown as {
          subscriptionId: string;
          customerId: string;
          planId: string;
          provider: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "A new subscription was created",
      },

      /**
       * Subscription was renewed
       */
      "subscription.renewed": {
        data: undefined as unknown as {
          subscriptionId: string;
          customerId: string;
          planId: string;
          periodStart: string;
          periodEnd: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Subscription was renewed for a new period",
      },

      /**
       * Subscription was canceled
       */
      "subscription.canceled": {
        data: undefined as unknown as {
          subscriptionId: string;
          customerId: string;
          reason?: string;
          effectiveAt: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Subscription was canceled",
      },

      /**
       * Subscription plan changed
       */
      "subscription.plan_changed": {
        data: undefined as unknown as {
          subscriptionId: string;
          customerId: string;
          previousPlanId: string;
          newPlanId: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Subscription plan was changed",
      },

      /**
       * Payment succeeded
       */
      "payment.succeeded": {
        data: undefined as unknown as {
          paymentId: string;
          customerId: string;
          amount: number;
          currency: string;
          invoiceId?: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Payment was successful",
      },

      /**
       * Payment failed
       */
      "payment.failed": {
        data: undefined as unknown as {
          customerId: string;
          subscriptionId?: string;
          amount: number;
          currency: string;
          errorCode?: string;
          errorMessage?: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Payment failed",
      },

      /**
       * Quota exceeded
       */
      "quota.exceeded": {
        data: undefined as unknown as {
          customerId: string;
          featureKey: string;
          used: number;
          limit: number;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Customer exceeded their quota for a feature",
      },

      /**
       * Quota threshold reached
       */
      "quota.threshold_reached": {
        data: undefined as unknown as {
          customerId: string;
          featureKey: string;
          percentage: number;
          used: number;
          limit: number;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Customer reached a usage threshold (e.g., 80%)",
      },

      /**
       * Dunning started
       */
      "dunning.started": {
        data: undefined as unknown as {
          customerId: string;
          subscriptionId: string;
          amount: number;
          currency: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Dunning process started for a customer",
      },

      /**
       * Dunning resolved
       */
      "dunning.resolved": {
        data: undefined as unknown as {
          customerId: string;
          resolution: "recovered" | "canceled" | "manual";
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Dunning process was resolved",
      },
    },

    handles: [
      // Events this service listens to
      "user.created", // Create customer record
      "user.deleted", // Cancel subscriptions
      "tenant.suspended", // Pause billing
    ],
  },
});

/**
 * Type export for the payments service definition
 */
export type PaymentsServiceDefinition = typeof paymentsServiceDefinition;
