/**
 * @parsrun/payments - Dunning Manager
 * Main orchestrator for dunning state management and step execution
 */

import type {
  DunningManagerConfig,
  DunningSequence,
  DunningStep,
  DunningState,
  DunningStatus,
  DunningContext,
  DunningEvent,
  DunningEventHandler,
  PaymentFailure,
  ExecutedStep,
  DunningNotification,
  NotificationResult,
  DunningStorage,
  DunningLogger,
} from "./types.js";
import { standardSaasSequence } from "./dunning-sequence.js";

// ============================================================================
// Dunning Manager
// ============================================================================

/**
 * Dunning Manager
 * Orchestrates the dunning process including state management and step execution
 */
export class DunningManager {
  private config: DunningManagerConfig;
  private storage: DunningStorage;
  private eventHandlers: DunningEventHandler[] = [];
  private logger?: DunningLogger;

  constructor(config: DunningManagerConfig, storage: DunningStorage) {
    this.config = config;
    this.storage = storage;
    if (config.logger) {
      this.logger = config.logger;
    }

    // Register event handler from config
    if (config.onEvent) {
      this.eventHandlers.push(config.onEvent);
    }
  }

  // ============================================================================
  // Dunning Lifecycle
  // ============================================================================

  /**
   * Start dunning process for a payment failure
   */
  async startDunning(failure: PaymentFailure): Promise<DunningState> {
    // Check if dunning already exists
    const existingState = await this.storage.getDunningState(failure.customerId);
    if (existingState && existingState.status === "active") {
      this.logger?.info("Dunning already active, adding failure", {
        customerId: failure.customerId,
        dunningId: existingState.id,
      });

      // Add new failure to existing state
      existingState.failures.push(failure);
      await this.storage.updateDunningState(existingState.id, {
        failures: existingState.failures,
      });

      return existingState;
    }

    // Get appropriate sequence
    const sequence = await this.getSequenceForCustomer(failure.customerId);
    const firstStep = sequence.steps[0];

    if (!firstStep) {
      throw new Error(`Dunning sequence ${sequence.id} has no steps`);
    }

    // Create new dunning state
    const state: DunningState = {
      id: this.generateId(),
      customerId: failure.customerId,
      subscriptionId: failure.subscriptionId,
      sequenceId: sequence.id,
      currentStepIndex: 0,
      currentStepId: firstStep.id,
      status: "active",
      initialFailure: failure,
      failures: [failure],
      executedSteps: [],
      startedAt: new Date(),
      nextStepAt: this.calculateStepTime(firstStep, failure.failedAt),
      totalRetryAttempts: 0,
    };

    // Save state
    await this.storage.saveDunningState(state);

    // Record failure
    await this.storage.recordPaymentFailure(failure);

    // Emit event
    await this.emitEvent({
      type: "dunning.started",
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      dunningStateId: state.id,
      timestamp: new Date(),
      data: {
        sequenceId: sequence.id,
        initialFailure: failure,
      },
    });

    this.logger?.info("Dunning started", {
      customerId: state.customerId,
      dunningId: state.id,
      sequenceId: sequence.id,
    });

    return state;
  }

  /**
   * Execute the next step in dunning sequence
   */
  async executeStep(stateId: string): Promise<ExecutedStep | null> {
    const state = await this.getDunningStateById(stateId);
    if (!state || state.status !== "active") {
      this.logger?.warn("Cannot execute step - invalid state", {
        stateId,
        status: state?.status,
      });
      return null;
    }

    const sequence = this.getSequence(state.sequenceId);
    const step = sequence.steps[state.currentStepIndex];

    if (!step) {
      this.logger?.warn("No step found at index", {
        stateId,
        stepIndex: state.currentStepIndex,
      });
      return null;
    }

    // Build context
    const context = await this.buildContext(state, step);

    // Check step condition
    if (step.condition) {
      const shouldExecute = await step.condition(context);
      if (!shouldExecute) {
        this.logger?.info("Step condition not met, skipping", {
          stateId,
          stepId: step.id,
        });
        return this.advanceToNextStep(state);
      }
    }

    // Execute step
    const executedStep = await this.performStepActions(context, step);

    // Update state
    state.executedSteps.push(executedStep);
    state.lastStepAt = executedStep.executedAt;
    state.totalRetryAttempts += executedStep.paymentRetried ? 1 : 0;

    // Check if payment recovered
    if (executedStep.paymentSucceeded) {
      await this.recoverDunning(state, "payment_recovered");
      return executedStep;
    }

    // Check if final step
    if (step.isFinal) {
      await this.exhaustDunning(state);
      return executedStep;
    }

    // Advance to next step
    await this.advanceToNextStep(state);

    return executedStep;
  }

  /**
   * Recover from dunning (payment successful)
   */
  async recoverDunning(
    stateOrId: DunningState | string,
    reason: "payment_recovered" = "payment_recovered"
  ): Promise<void> {
    const state =
      typeof stateOrId === "string" ? await this.getDunningStateById(stateOrId) : stateOrId;

    if (!state) return;

    state.status = "recovered";
    state.endedAt = new Date();
    state.endReason = reason;

    await this.storage.updateDunningState(state.id, {
      status: state.status,
      endedAt: state.endedAt,
      endReason: state.endReason,
    });

    // Restore full access
    if (this.config.onAccessUpdate) {
      await this.config.onAccessUpdate(state.customerId, "full");
    }

    await this.emitEvent({
      type: "dunning.payment_recovered",
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      dunningStateId: state.id,
      timestamp: new Date(),
      data: { reason },
    });

    this.logger?.info("Dunning recovered", {
      dunningId: state.id,
      customerId: state.customerId,
    });
  }

  /**
   * Pause dunning process
   */
  async pauseDunning(stateId: string): Promise<void> {
    await this.storage.updateDunningState(stateId, {
      status: "paused",
    });

    const state = await this.getDunningStateById(stateId);
    if (state) {
      await this.emitEvent({
        type: "dunning.paused",
        customerId: state.customerId,
        subscriptionId: state.subscriptionId,
        dunningStateId: state.id,
        timestamp: new Date(),
        data: {},
      });
    }
  }

  /**
   * Resume paused dunning
   */
  async resumeDunning(stateId: string): Promise<void> {
    const state = await this.getDunningStateById(stateId);
    if (!state || state.status !== "paused") return;

    const sequence = this.getSequence(state.sequenceId);
    const step = sequence.steps[state.currentStepIndex];

    const updates: Partial<DunningState> = { status: "active" };
    if (step) {
      updates.nextStepAt = this.calculateStepTime(step, new Date());
    }
    await this.storage.updateDunningState(stateId, updates);

    await this.emitEvent({
      type: "dunning.resumed",
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      dunningStateId: state.id,
      timestamp: new Date(),
      data: {},
    });
  }

  /**
   * Cancel dunning manually
   */
  async cancelDunning(stateId: string, reason?: string): Promise<void> {
    const state = await this.getDunningStateById(stateId);
    if (!state) return;

    state.status = "canceled";
    state.endedAt = new Date();
    state.endReason = "manually_canceled";

    await this.storage.updateDunningState(stateId, {
      status: state.status,
      endedAt: state.endedAt,
      endReason: state.endReason,
      metadata: { ...state.metadata, cancelReason: reason },
    });

    await this.emitEvent({
      type: "dunning.canceled",
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      dunningStateId: state.id,
      timestamp: new Date(),
      data: { reason },
    });
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  /**
   * Get dunning state by customer ID
   */
  async getDunningState(customerId: string): Promise<DunningState | null> {
    return this.storage.getDunningState(customerId);
  }

  /**
   * Get dunning state by ID
   */
  async getDunningStateById(stateId: string): Promise<DunningState | null> {
    // Storage should support this - for now iterate active states
    const states = await this.storage.getActiveDunningStates();
    return states.find((s) => s.id === stateId) ?? null;
  }

  /**
   * Get all active dunning states
   */
  async getActiveDunningStates(): Promise<DunningState[]> {
    return this.storage.getActiveDunningStates();
  }

  /**
   * Get dunning states by status
   */
  async getDunningStatesByStatus(status: DunningStatus): Promise<DunningState[]> {
    return this.storage.getDunningStatesByStatus(status);
  }

  /**
   * Get scheduled steps due for execution
   */
  async getScheduledSteps(
    before: Date
  ): Promise<Array<{ stateId: string; stepId: string; scheduledAt: Date }>> {
    return this.storage.getScheduledSteps(before);
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event handler
   */
  onEvent(handler: DunningEventHandler): this {
    this.eventHandlers.push(handler);
    return this;
  }

  /**
   * Emit dunning event
   */
  private async emitEvent(event: DunningEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger?.error("Event handler error", {
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  /**
   * Perform step actions
   */
  private async performStepActions(
    context: DunningContext,
    step: DunningStep
  ): Promise<ExecutedStep> {
    const executed: ExecutedStep = {
      stepId: step.id,
      stepName: step.name,
      executedAt: new Date(),
      actionsTaken: [],
      paymentRetried: false,
      notificationsSent: [],
    };

    for (const action of step.actions) {
      try {
        switch (action) {
          case "notify":
            const notifyResults = await this.sendNotifications(context, step);
            executed.notificationsSent = notifyResults
              .filter((r) => r.success)
              .map((r) => r.channel);
            executed.actionsTaken.push("notify");
            break;

          case "retry_payment":
            if (this.config.onRetryPayment) {
              const retryResult = await this.config.onRetryPayment(context);
              executed.paymentRetried = true;
              executed.paymentSucceeded = retryResult.success;
              executed.actionsTaken.push("retry_payment");

              await this.emitEvent({
                type: "dunning.payment_retried",
                customerId: context.customer.id,
                subscriptionId: context.subscription.id,
                dunningStateId: context.state.id,
                timestamp: new Date(),
                data: {
                  success: retryResult.success,
                  transactionId: retryResult.transactionId,
                },
              });

              // If retry succeeded, stop processing other actions
              if (retryResult.success) {
                return executed;
              }
            }
            break;

          case "limit_features":
            if (this.config.onAccessUpdate && step.accessLevel) {
              await this.config.onAccessUpdate(context.customer.id, step.accessLevel);
              executed.actionsTaken.push("limit_features");

              await this.emitEvent({
                type: "dunning.access_limited",
                customerId: context.customer.id,
                subscriptionId: context.subscription.id,
                dunningStateId: context.state.id,
                timestamp: new Date(),
                data: { accessLevel: step.accessLevel },
              });
            }
            break;

          case "suspend":
            if (this.config.onAccessUpdate) {
              await this.config.onAccessUpdate(context.customer.id, "read_only");
              executed.actionsTaken.push("suspend");

              await this.emitEvent({
                type: "dunning.suspended",
                customerId: context.customer.id,
                subscriptionId: context.subscription.id,
                dunningStateId: context.state.id,
                timestamp: new Date(),
                data: {},
              });
            }
            break;

          case "cancel":
            if (this.config.onCancelSubscription) {
              await this.config.onCancelSubscription(
                context.subscription.id,
                "dunning_exhausted"
              );
              executed.actionsTaken.push("cancel");
            }
            break;

          case "custom":
            if (step.customAction) {
              await step.customAction(context);
              executed.actionsTaken.push("custom");
            }
            break;
        }
      } catch (error) {
        this.logger?.error("Step action failed", {
          stepId: step.id,
          action,
          error: error instanceof Error ? error.message : String(error),
        });
        executed.error = error instanceof Error ? error.message : String(error);
      }
    }

    // Emit step executed event
    await this.emitEvent({
      type: "dunning.step_executed",
      customerId: context.customer.id,
      subscriptionId: context.subscription.id,
      dunningStateId: context.state.id,
      timestamp: new Date(),
      data: {
        stepId: step.id,
        stepName: step.name,
        actionsTaken: executed.actionsTaken,
      },
    });

    return executed;
  }

  /**
   * Send notifications for a step
   */
  private async sendNotifications(
    context: DunningContext,
    step: DunningStep
  ): Promise<NotificationResult[]> {
    if (!step.notificationChannels?.length || !this.config.onNotification) {
      return [];
    }

    const results: NotificationResult[] = [];

    for (const channel of step.notificationChannels) {
      // Build recipient with only defined properties
      const recipient: DunningNotification["recipient"] = {
        customerId: context.customer.id,
      };
      if (context.customer.email) {
        recipient.email = context.customer.email;
      }

      // Build variables with only defined properties
      const variables: DunningNotification["variables"] = {
        amount: context.amountOwed,
        currency: context.currency,
        daysSinceFailure: context.daysSinceFailure,
      };
      if (context.customer.name) {
        variables.customerName = context.customer.name;
      }
      if (this.config.urls?.updatePayment) {
        variables.updatePaymentUrl = this.config.urls.updatePayment;
      }
      if (this.config.urls?.viewInvoice) {
        variables.invoiceUrl = this.config.urls.viewInvoice;
      }
      if (this.config.urls?.support) {
        variables.supportUrl = this.config.urls.support;
      }

      const notification: DunningNotification = {
        channel,
        templateId: step.notificationTemplateId ?? `dunning-${step.id}`,
        recipient,
        variables,
        context,
      };

      try {
        const result = await this.config.onNotification(notification);
        results.push(result);

        if (result.success) {
          await this.emitEvent({
            type: "dunning.notification_sent",
            customerId: context.customer.id,
            subscriptionId: context.subscription.id,
            dunningStateId: context.state.id,
            timestamp: new Date(),
            data: {
              channel,
              templateId: notification.templateId,
            },
          });
        }
      } catch (error) {
        results.push({
          success: false,
          channel,
          error: error instanceof Error ? error.message : String(error),
          sentAt: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Advance to next step
   */
  private async advanceToNextStep(state: DunningState): Promise<ExecutedStep | null> {
    const sequence = this.getSequence(state.sequenceId);
    const nextIndex = state.currentStepIndex + 1;

    if (nextIndex >= sequence.steps.length) {
      await this.exhaustDunning(state);
      return null;
    }

    const nextStep = sequence.steps[nextIndex];
    if (!nextStep) {
      await this.exhaustDunning(state);
      return null;
    }

    const nextStepTime = this.calculateStepTime(nextStep, state.startedAt);

    await this.storage.updateDunningState(state.id, {
      currentStepIndex: nextIndex,
      currentStepId: nextStep.id,
      nextStepAt: nextStepTime,
    });

    // Schedule step
    await this.storage.scheduleStep(state.id, nextStep.id, nextStepTime);

    return null;
  }

  /**
   * Mark dunning as exhausted (all steps completed without recovery)
   */
  private async exhaustDunning(state: DunningState): Promise<void> {
    state.status = "exhausted";
    state.endedAt = new Date();
    state.endReason = "max_retries";

    await this.storage.updateDunningState(state.id, {
      status: state.status,
      endedAt: state.endedAt,
      endReason: state.endReason,
    });

    await this.emitEvent({
      type: "dunning.exhausted",
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      dunningStateId: state.id,
      timestamp: new Date(),
      data: {
        totalRetries: state.totalRetryAttempts,
        stepsExecuted: state.executedSteps.length,
      },
    });

    this.logger?.info("Dunning exhausted", {
      dunningId: state.id,
      customerId: state.customerId,
    });
  }

  /**
   * Build dunning context for step execution
   */
  private async buildContext(state: DunningState, step: DunningStep): Promise<DunningContext> {
    const latestFailure = state.failures[state.failures.length - 1] ?? state.initialFailure;

    // Build customer object with only defined properties
    const customer: DunningContext["customer"] = {
      id: state.customerId,
    };
    const customerEmail = state.metadata?.["customerEmail"];
    if (typeof customerEmail === "string") {
      customer.email = customerEmail;
    }
    const customerName = state.metadata?.["customerName"];
    if (typeof customerName === "string") {
      customer.name = customerName;
    }
    const customerMetadata = state.metadata?.["customer"];
    if (customerMetadata && typeof customerMetadata === "object") {
      customer.metadata = customerMetadata as Record<string, unknown>;
    }

    // Build subscription object with only defined properties
    const subscription: DunningContext["subscription"] = {
      id: state.subscriptionId,
      status: "past_due",
    };
    const planId = state.metadata?.["planId"];
    if (typeof planId === "string") {
      subscription.planId = planId;
    }

    return {
      state,
      step,
      latestFailure,
      customer,
      subscription,
      daysSinceFailure: Math.floor(
        (Date.now() - state.initialFailure.failedAt.getTime()) / (1000 * 60 * 60 * 24)
      ),
      amountOwed: state.failures.reduce((sum, f) => sum + f.amount, 0),
      currency: latestFailure.currency,
    };
  }

  /**
   * Calculate when a step should execute
   */
  private calculateStepTime(step: DunningStep, baseTime: Date): Date {
    const time = new Date(baseTime);
    time.setDate(time.getDate() + step.daysAfterFailure);

    if (step.hoursOffset !== undefined) {
      time.setHours(step.hoursOffset, 0, 0, 0);
    }

    return time;
  }

  /**
   * Get sequence for a customer (by tier if configured)
   */
  private async getSequenceForCustomer(_customerId: string): Promise<DunningSequence> {
    // TODO: Could lookup customer tier and return appropriate sequence
    // For now, return default sequence
    return this.config.defaultSequence;
  }

  /**
   * Get sequence by ID
   */
  private getSequence(sequenceId: string): DunningSequence {
    if (sequenceId === this.config.defaultSequence.id) {
      return this.config.defaultSequence;
    }

    // Check tier sequences
    if (this.config.sequencesByPlanTier) {
      for (const seq of Object.values(this.config.sequencesByPlanTier)) {
        if (seq.id === sequenceId) return seq;
      }
    }

    return this.config.defaultSequence;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `dun_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a dunning manager
 */
export function createDunningManager(
  config: DunningManagerConfig,
  storage: DunningStorage
): DunningManager {
  return new DunningManager(config, storage);
}

/**
 * Create default dunning config
 */
export function createDefaultDunningConfig(
  overrides?: Partial<DunningManagerConfig>
): DunningManagerConfig {
  return {
    defaultSequence: standardSaasSequence,
    ...overrides,
  };
}
