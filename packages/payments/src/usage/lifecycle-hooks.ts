/**
 * @parsrun/payments - Subscription Lifecycle Hooks
 * Event-driven subscription lifecycle management
 */

import type {
  SubscriptionEventType,
  SubscriptionEvent,
  SubscriptionHandler,
  BillingLogger,
} from "./types.js";

/**
 * Null logger
 */
const nullLogger: BillingLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Subscription Lifecycle
 * Manages subscription event handlers
 */
export class SubscriptionLifecycle {
  private readonly handlers: Map<SubscriptionEventType | "*", SubscriptionHandler[]>;
  private readonly logger: BillingLogger;

  constructor(logger?: BillingLogger) {
    this.handlers = new Map();
    this.logger = logger ?? nullLogger;
  }

  /**
   * Register an event handler
   */
  on(event: SubscriptionEventType | "*", handler: SubscriptionHandler): this {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);

    this.logger.debug("Lifecycle handler registered", { event });
    return this;
  }

  /**
   * Remove an event handler
   */
  off(event: SubscriptionEventType | "*", handler: SubscriptionHandler): this {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Emit an event to all handlers
   */
  async emit(event: SubscriptionEvent): Promise<void> {
    this.logger.info("Lifecycle event", {
      type: event.type,
      subscriptionId: event.subscription.id,
      provider: event.provider,
    });

    // Get specific handlers
    const specificHandlers = this.handlers.get(event.type) ?? [];

    // Get wildcard handlers
    const wildcardHandlers = this.handlers.get("*") ?? [];

    // Combine all handlers
    const allHandlers = [...specificHandlers, ...wildcardHandlers];

    // Execute all handlers
    const results = await Promise.allSettled(
      allHandlers.map((handler) => handler(event))
    );

    // Log any failures
    for (const result of results) {
      if (result.status === "rejected") {
        this.logger.error("Lifecycle handler failed", {
          type: event.type,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  /**
   * Check if there are handlers for an event
   */
  hasHandlers(event: SubscriptionEventType | "*"): boolean {
    const handlers = this.handlers.get(event);
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Get handler count for an event
   */
  handlerCount(event: SubscriptionEventType | "*"): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Handle subscription created
   */
  onCreated(handler: SubscriptionHandler): this {
    return this.on("subscription.created", handler);
  }

  /**
   * Handle subscription activated
   */
  onActivated(handler: SubscriptionHandler): this {
    return this.on("subscription.activated", handler);
  }

  /**
   * Handle subscription updated
   */
  onUpdated(handler: SubscriptionHandler): this {
    return this.on("subscription.updated", handler);
  }

  /**
   * Handle plan changed
   */
  onPlanChanged(handler: SubscriptionHandler): this {
    return this.on("subscription.plan_changed", handler);
  }

  /**
   * Handle subscription canceled
   */
  onCanceled(handler: SubscriptionHandler): this {
    return this.on("subscription.canceled", handler);
  }

  /**
   * Handle subscription expired
   */
  onExpired(handler: SubscriptionHandler): this {
    return this.on("subscription.expired", handler);
  }

  /**
   * Handle subscription renewed
   */
  onRenewed(handler: SubscriptionHandler): this {
    return this.on("subscription.renewed", handler);
  }

  /**
   * Handle trial started
   */
  onTrialStarted(handler: SubscriptionHandler): this {
    return this.on("subscription.trial_started", handler);
  }

  /**
   * Handle trial ended
   */
  onTrialEnded(handler: SubscriptionHandler): this {
    return this.on("subscription.trial_ended", handler);
  }

  /**
   * Handle payment failed
   */
  onPaymentFailed(handler: SubscriptionHandler): this {
    return this.on("subscription.payment_failed", handler);
  }

  /**
   * Handle payment succeeded
   */
  onPaymentSucceeded(handler: SubscriptionHandler): this {
    return this.on("subscription.payment_succeeded", handler);
  }

  /**
   * Handle period reset
   */
  onPeriodReset(handler: SubscriptionHandler): this {
    return this.on("subscription.period_reset", handler);
  }

  /**
   * Handle all events
   */
  onAll(handler: SubscriptionHandler): this {
    return this.on("*", handler);
  }
}

/**
 * Create subscription lifecycle manager
 */
export function createSubscriptionLifecycle(logger?: BillingLogger): SubscriptionLifecycle {
  return new SubscriptionLifecycle(logger);
}
