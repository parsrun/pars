/**
 * @parsrun/payments - Dunning Sequence
 * Default sequences and step builders for dunning automation
 */

import type {
  DunningSequence,
  DunningStep,
  DunningAction,
  NotificationChannel,
  DunningContext,
} from "./types.js";

// ============================================================================
// Step Builder
// ============================================================================

/**
 * Fluent builder for dunning steps
 */
export class DunningStepBuilder {
  private step: Partial<DunningStep> = {
    actions: [],
    notificationChannels: [],
  };

  constructor(id: string, name: string) {
    this.step.id = id;
    this.step.name = name;
  }

  /**
   * Set days after initial failure
   */
  afterDays(days: number): this {
    this.step.daysAfterFailure = days;
    return this;
  }

  /**
   * Set hours offset within the day
   */
  atHour(hour: number): this {
    this.step.hoursOffset = hour;
    return this;
  }

  /**
   * Add actions to take
   */
  withActions(...actions: DunningAction[]): this {
    this.step.actions = actions;
    return this;
  }

  /**
   * Add notification channels
   */
  notify(...channels: NotificationChannel[]): this {
    this.step.notificationChannels = channels;
    return this;
  }

  /**
   * Set notification template
   */
  withTemplate(templateId: string): this {
    this.step.notificationTemplateId = templateId;
    return this;
  }

  /**
   * Enable payment retry in this step
   */
  retryPayment(retry = true): this {
    this.step.retryPayment = retry;
    if (retry && !this.step.actions?.includes("retry_payment")) {
      this.step.actions = [...(this.step.actions || []), "retry_payment"];
    }
    return this;
  }

  /**
   * Set access level for this step
   */
  setAccessLevel(level: "full" | "limited" | "read_only" | "none"): this {
    this.step.accessLevel = level;
    if (!this.step.actions?.includes("limit_features")) {
      this.step.actions = [...(this.step.actions || []), "limit_features"];
    }
    return this;
  }

  /**
   * Mark this as the final step
   */
  final(isFinal = true): this {
    this.step.isFinal = isFinal;
    return this;
  }

  /**
   * Add custom action handler
   */
  withCustomAction(handler: (context: DunningContext) => Promise<void>): this {
    this.step.customAction = handler;
    if (!this.step.actions?.includes("custom")) {
      this.step.actions = [...(this.step.actions || []), "custom"];
    }
    return this;
  }

  /**
   * Add condition for this step
   */
  when(condition: (context: DunningContext) => boolean | Promise<boolean>): this {
    this.step.condition = condition;
    return this;
  }

  /**
   * Add metadata
   */
  withMetadata(metadata: Record<string, unknown>): this {
    this.step.metadata = metadata;
    return this;
  }

  /**
   * Build the step
   */
  build(): DunningStep {
    if (!this.step.id || !this.step.name || this.step.daysAfterFailure === undefined) {
      throw new Error("DunningStep requires id, name, and daysAfterFailure");
    }

    const result: DunningStep = {
      id: this.step.id,
      name: this.step.name,
      daysAfterFailure: this.step.daysAfterFailure,
      actions: this.step.actions || [],
    };

    // Only add optional properties if they have values
    if (this.step.hoursOffset !== undefined) result.hoursOffset = this.step.hoursOffset;
    if (this.step.notificationChannels !== undefined)
      result.notificationChannels = this.step.notificationChannels;
    if (this.step.notificationTemplateId !== undefined)
      result.notificationTemplateId = this.step.notificationTemplateId;
    if (this.step.retryPayment !== undefined) result.retryPayment = this.step.retryPayment;
    if (this.step.accessLevel !== undefined) result.accessLevel = this.step.accessLevel;
    if (this.step.isFinal !== undefined) result.isFinal = this.step.isFinal;
    if (this.step.customAction !== undefined) result.customAction = this.step.customAction;
    if (this.step.condition !== undefined) result.condition = this.step.condition;
    if (this.step.metadata !== undefined) result.metadata = this.step.metadata;

    return result;
  }
}

/**
 * Create a new dunning step builder
 */
export function step(id: string, name: string): DunningStepBuilder {
  return new DunningStepBuilder(id, name);
}

// ============================================================================
// Sequence Builder
// ============================================================================

/**
 * Fluent builder for dunning sequences
 */
export class DunningSequenceBuilder {
  private sequence: Partial<DunningSequence> = {
    steps: [],
    isActive: true,
  };

  constructor(id: string, name: string) {
    this.sequence.id = id;
    this.sequence.name = name;
  }

  /**
   * Set description
   */
  describe(description: string): this {
    this.sequence.description = description;
    return this;
  }

  /**
   * Add steps
   */
  withSteps(...steps: DunningStep[]): this {
    this.sequence.steps = steps;
    return this;
  }

  /**
   * Set maximum duration before auto-cancel
   */
  maxDays(days: number): this {
    this.sequence.maxDurationDays = days;
    return this;
  }

  /**
   * Set active status
   */
  active(isActive = true): this {
    this.sequence.isActive = isActive;
    return this;
  }

  /**
   * Add metadata
   */
  withMetadata(metadata: Record<string, unknown>): this {
    this.sequence.metadata = metadata;
    return this;
  }

  /**
   * Build the sequence
   */
  build(): DunningSequence {
    if (!this.sequence.id || !this.sequence.name || !this.sequence.maxDurationDays) {
      throw new Error("DunningSequence requires id, name, and maxDurationDays");
    }

    // Sort steps by daysAfterFailure
    const sortedSteps = [...(this.sequence.steps || [])].sort(
      (a, b) => a.daysAfterFailure - b.daysAfterFailure
    );

    const result: DunningSequence = {
      id: this.sequence.id,
      name: this.sequence.name,
      steps: sortedSteps,
      maxDurationDays: this.sequence.maxDurationDays,
      isActive: this.sequence.isActive ?? true,
    };

    // Only add optional properties if they have values
    if (this.sequence.description !== undefined) result.description = this.sequence.description;
    if (this.sequence.metadata !== undefined) result.metadata = this.sequence.metadata;

    return result;
  }
}

/**
 * Create a new dunning sequence builder
 */
export function sequence(id: string, name: string): DunningSequenceBuilder {
  return new DunningSequenceBuilder(id, name);
}

// ============================================================================
// Default Sequences
// ============================================================================

/**
 * Standard SaaS dunning sequence (28 days)
 *
 * Day 0: Immediate retry + email notification
 * Day 1: Retry + email reminder
 * Day 3: Retry + email warning
 * Day 7: Retry + email + in-app notification, limit features
 * Day 14: Retry + email, suspend account
 * Day 21: Final warning email
 * Day 28: Cancel subscription
 */
export const standardSaasSequence: DunningSequence = sequence("standard-saas", "Standard SaaS Dunning")
  .describe("Standard 28-day dunning sequence for SaaS applications")
  .maxDays(28)
  .withSteps(
    step("immediate-retry", "Immediate Retry")
      .afterDays(0)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-payment-failed")
      .retryPayment()
      .build(),

    step("day-1-reminder", "Day 1 Reminder")
      .afterDays(1)
      .atHour(10) // 10 AM
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-reminder")
      .retryPayment()
      .build(),

    step("day-3-warning", "Day 3 Warning")
      .afterDays(3)
      .atHour(10)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-warning")
      .retryPayment()
      .build(),

    step("day-7-limit", "Day 7 Feature Limit")
      .afterDays(7)
      .atHour(10)
      .withActions("retry_payment", "notify", "limit_features")
      .notify("email", "in_app")
      .withTemplate("dunning-feature-limit")
      .retryPayment()
      .setAccessLevel("limited")
      .build(),

    step("day-14-suspend", "Day 14 Suspension")
      .afterDays(14)
      .atHour(10)
      .withActions("retry_payment", "notify", "suspend")
      .notify("email", "in_app")
      .withTemplate("dunning-suspension")
      .retryPayment()
      .setAccessLevel("read_only")
      .build(),

    step("day-21-final-warning", "Day 21 Final Warning")
      .afterDays(21)
      .atHour(10)
      .withActions("notify")
      .notify("email")
      .withTemplate("dunning-final-warning")
      .build(),

    step("day-28-cancel", "Day 28 Cancellation")
      .afterDays(28)
      .atHour(10)
      .withActions("notify", "cancel")
      .notify("email")
      .withTemplate("dunning-canceled")
      .final()
      .setAccessLevel("none")
      .build()
  )
  .build();

/**
 * Aggressive dunning sequence (14 days)
 * For lower-tier plans or high-risk customers
 */
export const aggressiveSequence: DunningSequence = sequence("aggressive", "Aggressive Dunning")
  .describe("Aggressive 14-day dunning sequence")
  .maxDays(14)
  .withSteps(
    step("immediate", "Immediate Retry")
      .afterDays(0)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-payment-failed")
      .retryPayment()
      .build(),

    step("day-1", "Day 1")
      .afterDays(1)
      .withActions("retry_payment", "notify")
      .notify("email", "sms")
      .withTemplate("dunning-urgent")
      .retryPayment()
      .build(),

    step("day-3-limit", "Day 3 Limit")
      .afterDays(3)
      .withActions("retry_payment", "notify", "limit_features")
      .notify("email", "in_app")
      .withTemplate("dunning-feature-limit")
      .retryPayment()
      .setAccessLevel("limited")
      .build(),

    step("day-7-suspend", "Day 7 Suspend")
      .afterDays(7)
      .withActions("retry_payment", "notify", "suspend")
      .notify("email", "sms", "in_app")
      .withTemplate("dunning-suspension")
      .retryPayment()
      .setAccessLevel("read_only")
      .build(),

    step("day-14-cancel", "Day 14 Cancel")
      .afterDays(14)
      .withActions("notify", "cancel")
      .notify("email")
      .withTemplate("dunning-canceled")
      .final()
      .setAccessLevel("none")
      .build()
  )
  .build();

/**
 * Lenient dunning sequence (45 days)
 * For enterprise or high-value customers
 */
export const lenientSequence: DunningSequence = sequence("lenient", "Lenient Dunning")
  .describe("Lenient 45-day dunning sequence for enterprise customers")
  .maxDays(45)
  .withSteps(
    step("immediate", "Immediate Retry")
      .afterDays(0)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-payment-failed-enterprise")
      .retryPayment()
      .build(),

    step("day-3", "Day 3 Reminder")
      .afterDays(3)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-reminder-enterprise")
      .retryPayment()
      .build(),

    step("day-7", "Day 7 Reminder")
      .afterDays(7)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-reminder-enterprise")
      .retryPayment()
      .build(),

    step("day-14", "Day 14 Warning")
      .afterDays(14)
      .withActions("retry_payment", "notify")
      .notify("email", "in_app")
      .withTemplate("dunning-warning-enterprise")
      .retryPayment()
      .build(),

    step("day-21-limit", "Day 21 Feature Limit")
      .afterDays(21)
      .withActions("retry_payment", "notify", "limit_features")
      .notify("email", "in_app")
      .withTemplate("dunning-feature-limit-enterprise")
      .retryPayment()
      .setAccessLevel("limited")
      .build(),

    step("day-30-suspend", "Day 30 Suspension")
      .afterDays(30)
      .withActions("retry_payment", "notify", "suspend")
      .notify("email", "in_app")
      .withTemplate("dunning-suspension-enterprise")
      .retryPayment()
      .setAccessLevel("read_only")
      .build(),

    step("day-40-final", "Day 40 Final Warning")
      .afterDays(40)
      .withActions("notify")
      .notify("email")
      .withTemplate("dunning-final-warning-enterprise")
      .build(),

    step("day-45-cancel", "Day 45 Cancel")
      .afterDays(45)
      .withActions("notify", "cancel")
      .notify("email")
      .withTemplate("dunning-canceled-enterprise")
      .final()
      .setAccessLevel("none")
      .build()
  )
  .build();

/**
 * Minimal dunning sequence (7 days)
 * For free-to-paid conversions or trials
 */
export const minimalSequence: DunningSequence = sequence("minimal", "Minimal Dunning")
  .describe("Minimal 7-day dunning sequence")
  .maxDays(7)
  .withSteps(
    step("immediate", "Immediate Retry")
      .afterDays(0)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-payment-failed")
      .retryPayment()
      .build(),

    step("day-3", "Day 3")
      .afterDays(3)
      .withActions("retry_payment", "notify")
      .notify("email")
      .withTemplate("dunning-reminder")
      .retryPayment()
      .build(),

    step("day-7-cancel", "Day 7 Cancel")
      .afterDays(7)
      .withActions("notify", "cancel")
      .notify("email")
      .withTemplate("dunning-canceled")
      .final()
      .setAccessLevel("none")
      .build()
  )
  .build();

// ============================================================================
// Sequence Registry
// ============================================================================

/**
 * Default sequences by tier
 */
export const defaultSequences: Record<string, DunningSequence> = {
  standard: standardSaasSequence,
  aggressive: aggressiveSequence,
  lenient: lenientSequence,
  minimal: minimalSequence,
};

/**
 * Get sequence by tier level
 *
 * @param tier - Plan tier (0=free, 1=starter, 2=pro, 3=enterprise)
 * @returns Appropriate dunning sequence
 */
export function getSequenceByTier(tier: number): DunningSequence {
  if (tier >= 3) return lenientSequence; // Enterprise
  if (tier >= 2) return standardSaasSequence; // Pro
  if (tier >= 1) return aggressiveSequence; // Starter
  return minimalSequence; // Free/Trial
}
