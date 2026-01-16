/**
 * @parsrun/payments - Dunning Drizzle Storage
 * Persistent storage implementation using Drizzle ORM
 */

import { eq, and, lt, desc } from "drizzle-orm";
import type {
  DunningStorage,
  DunningState,
  DunningStatus,
  PaymentFailure,
  PaymentFailureCategory,
  ExecutedStep,
  DunningAction,
  NotificationChannel,
} from "./types.js";
import {
  dunningStates,
  paymentFailures,
  scheduledSteps,
  executedSteps as executedStepsTable,
  type DunningStateRow,
  type PaymentFailureRow,
} from "./schema.js";

// ============================================================================
// Types
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = Promise<unknown[]> & {
  where: (condition: unknown) => QueryBuilder;
  orderBy: (...order: unknown[]) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
};

/**
 * Drizzle database type (compatible with various drivers)
 */
export type DrizzleDb = {
  select: () => {
    from: (table: unknown) => QueryBuilder;
  };
  insert: (table: unknown) => {
    values: (values: unknown) => {
      onConflictDoUpdate: (config: unknown) => Promise<unknown>;
      returning: () => Promise<unknown[]>;
    } & Promise<unknown>;
  };
  update: (table: unknown) => {
    set: (values: unknown) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
  delete: (table: unknown) => {
    where: (condition: unknown) => Promise<unknown>;
  };
};

/**
 * Configuration for Drizzle dunning storage
 */
export interface DrizzleDunningStorageConfig {
  /** Drizzle database instance */
  db: DrizzleDb;
}

// ============================================================================
// Storage Implementation
// ============================================================================

/**
 * Drizzle-based dunning storage implementation
 */
export class DrizzleDunningStorage implements DunningStorage {
  private db: DrizzleDb;

  constructor(config: DrizzleDunningStorageConfig) {
    this.db = config.db;
  }

  // ============================================================================
  // Dunning State Methods
  // ============================================================================

  async getDunningState(customerId: string): Promise<DunningState | null> {
    const rows = (await this.db
      .select()
      .from(dunningStates)
      .where(eq(dunningStates.customerId, customerId))) as DunningStateRow[];

    const row = rows[0];
    if (!row) return null;

    return this.mapRowToState(row);
  }

  async getActiveDunningStates(): Promise<DunningState[]> {
    const rows = (await this.db
      .select()
      .from(dunningStates)
      .where(eq(dunningStates.status, "active"))) as DunningStateRow[];

    return Promise.all(rows.map((row) => this.mapRowToState(row)));
  }

  async getDunningStatesByStatus(status: DunningStatus): Promise<DunningState[]> {
    const rows = (await this.db
      .select()
      .from(dunningStates)
      .where(eq(dunningStates.status, status))) as DunningStateRow[];

    return Promise.all(rows.map((row) => this.mapRowToState(row)));
  }

  async saveDunningState(state: DunningState): Promise<void> {
    await this.db.insert(dunningStates).values({
      id: state.id,
      customerId: state.customerId,
      subscriptionId: state.subscriptionId,
      sequenceId: state.sequenceId,
      currentStepIndex: state.currentStepIndex,
      currentStepId: state.currentStepId,
      status: state.status,
      initialFailureId: state.initialFailure.id,
      failureIds: state.failures.map((f) => f.id),
      startedAt: state.startedAt,
      lastStepAt: state.lastStepAt,
      nextStepAt: state.nextStepAt,
      endedAt: state.endedAt,
      endReason: state.endReason,
      totalRetryAttempts: state.totalRetryAttempts,
      metadata: state.metadata,
    });

    // Save executed steps
    for (const step of state.executedSteps) {
      await this.saveExecutedStep(state.id, step);
    }
  }

  async updateDunningState(id: string, updates: Partial<DunningState>): Promise<void> {
    const setValues: Record<string, unknown> = {};

    if (updates["currentStepIndex"] !== undefined)
      setValues["currentStepIndex"] = updates["currentStepIndex"];
    if (updates["currentStepId"] !== undefined)
      setValues["currentStepId"] = updates["currentStepId"];
    if (updates["status"] !== undefined) setValues["status"] = updates["status"];
    if (updates["lastStepAt"] !== undefined) setValues["lastStepAt"] = updates["lastStepAt"];
    if (updates["nextStepAt"] !== undefined) setValues["nextStepAt"] = updates["nextStepAt"];
    if (updates["endedAt"] !== undefined) setValues["endedAt"] = updates["endedAt"];
    if (updates["endReason"] !== undefined) setValues["endReason"] = updates["endReason"];
    if (updates["totalRetryAttempts"] !== undefined)
      setValues["totalRetryAttempts"] = updates["totalRetryAttempts"];
    if (updates["metadata"] !== undefined) setValues["metadata"] = updates["metadata"];
    if (updates["failures"] !== undefined)
      setValues["failureIds"] = updates["failures"].map((f) => f.id);

    if (Object.keys(setValues).length > 0) {
      await this.db.update(dunningStates).set(setValues).where(eq(dunningStates.id, id));
    }
  }

  // ============================================================================
  // Payment Failure Methods
  // ============================================================================

  async recordPaymentFailure(failure: PaymentFailure): Promise<void> {
    await this.db.insert(paymentFailures).values({
      id: failure.id,
      customerId: failure.customerId,
      subscriptionId: failure.subscriptionId,
      invoiceId: failure.invoiceId,
      amount: failure.amount,
      currency: failure.currency,
      category: failure.category,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      provider: failure.provider,
      failedAt: failure.failedAt,
      retryCount: failure.retryCount,
      nextRetryAt: failure.nextRetryAt,
      isRecoverable: failure.isRecoverable,
      metadata: failure.metadata,
    });
  }

  async getPaymentFailures(customerId: string, limit = 50): Promise<PaymentFailure[]> {
    const rows = (await this.db
      .select()
      .from(paymentFailures)
      .where(eq(paymentFailures.customerId, customerId))
      .orderBy(desc(paymentFailures.failedAt))
      .limit(limit)) as PaymentFailureRow[];

    return rows.map((row) => this.mapRowToFailure(row));
  }

  // ============================================================================
  // Scheduled Steps Methods
  // ============================================================================

  async getScheduledSteps(
    before: Date
  ): Promise<Array<{ stateId: string; stepId: string; scheduledAt: Date }>> {
    const rows = (await this.db
      .select()
      .from(scheduledSteps)
      .where(lt(scheduledSteps.scheduledAt, before))) as Array<{
      dunningStateId: string;
      stepId: string;
      scheduledAt: Date;
    }>;

    return rows.map((row) => ({
      stateId: row.dunningStateId,
      stepId: row.stepId,
      scheduledAt: row.scheduledAt,
    }));
  }

  async scheduleStep(stateId: string, stepId: string, scheduledAt: Date): Promise<void> {
    const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await this.db.insert(scheduledSteps).values({
      id,
      dunningStateId: stateId,
      stepId,
      scheduledAt,
    });
  }

  async removeScheduledStep(stateId: string, stepId: string): Promise<void> {
    await this.db
      .delete(scheduledSteps)
      .where(
        and(eq(scheduledSteps.dunningStateId, stateId), eq(scheduledSteps.stepId, stepId))
      );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async saveExecutedStep(stateId: string, step: ExecutedStep): Promise<void> {
    const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await this.db.insert(executedStepsTable).values({
      id,
      dunningStateId: stateId,
      stepId: step.stepId,
      stepName: step.stepName,
      executedAt: step.executedAt,
      actionsTaken: step.actionsTaken,
      paymentRetried: step.paymentRetried,
      paymentSucceeded: step.paymentSucceeded,
      notificationsSent: step.notificationsSent,
      error: step.error,
    });
  }

  private async mapRowToState(row: DunningStateRow): Promise<DunningState> {
    // Get initial failure
    const failureRows = (await this.db
      .select()
      .from(paymentFailures)
      .where(eq(paymentFailures.id, row.initialFailureId))) as PaymentFailureRow[];

    const initialFailureRow = failureRows[0];
    if (!initialFailureRow) {
      throw new Error(`Initial failure not found: ${row.initialFailureId}`);
    }

    const initialFailure = this.mapRowToFailure(initialFailureRow);

    // Get all failures
    const failures: PaymentFailure[] = [initialFailure];
    const failureIds = (row.failureIds as string[]) || [];
    for (const failureId of failureIds) {
      if (failureId !== row.initialFailureId) {
        const additionalRows = (await this.db
          .select()
          .from(paymentFailures)
          .where(eq(paymentFailures.id, failureId))) as PaymentFailureRow[];

        const additionalRow = additionalRows[0];
        if (additionalRow) {
          failures.push(this.mapRowToFailure(additionalRow));
        }
      }
    }

    // Get executed steps
    const execStepRows = (await this.db
      .select()
      .from(executedStepsTable)
      .where(eq(executedStepsTable.dunningStateId, row.id))
      .orderBy(executedStepsTable.executedAt)) as Array<{
      stepId: string;
      stepName: string;
      executedAt: Date;
      actionsTaken: string[] | null;
      paymentRetried: boolean;
      paymentSucceeded: boolean | null;
      notificationsSent: string[] | null;
      error: string | null;
    }>;

    const executedStepsList: ExecutedStep[] = execStepRows.map((es) => {
      const step: ExecutedStep = {
        stepId: es.stepId,
        stepName: es.stepName,
        executedAt: es.executedAt,
        actionsTaken: (es.actionsTaken || []) as DunningAction[],
        paymentRetried: es.paymentRetried,
        notificationsSent: (es.notificationsSent || []) as NotificationChannel[],
      };
      if (es.paymentSucceeded !== null) step.paymentSucceeded = es.paymentSucceeded;
      if (es.error !== null) step.error = es.error;
      return step;
    });

    const result: DunningState = {
      id: row.id,
      customerId: row.customerId,
      subscriptionId: row.subscriptionId,
      sequenceId: row.sequenceId,
      currentStepIndex: row.currentStepIndex,
      currentStepId: row.currentStepId,
      status: row.status as DunningStatus,
      initialFailure,
      failures,
      executedSteps: executedStepsList,
      startedAt: row.startedAt,
      totalRetryAttempts: row.totalRetryAttempts,
    };
    if (row.lastStepAt) result.lastStepAt = row.lastStepAt;
    if (row.nextStepAt) result.nextStepAt = row.nextStepAt;
    if (row.endedAt) result.endedAt = row.endedAt;
    const endReason = row.endReason;
    if (
      endReason === "payment_recovered" ||
      endReason === "max_retries" ||
      endReason === "manually_canceled" ||
      endReason === "subscription_canceled"
    ) {
      result.endReason = endReason;
    }
    if (row.metadata) result.metadata = row.metadata as Record<string, unknown>;

    return result;
  }

  private mapRowToFailure(row: PaymentFailureRow): PaymentFailure {
    const result: PaymentFailure = {
      id: row.id,
      customerId: row.customerId,
      subscriptionId: row.subscriptionId,
      amount: row.amount,
      currency: row.currency,
      category: row.category as PaymentFailureCategory,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      provider: row.provider as PaymentFailure["provider"],
      failedAt: row.failedAt,
      retryCount: row.retryCount,
      isRecoverable: row.isRecoverable,
    };
    if (row.invoiceId) result.invoiceId = row.invoiceId;
    if (row.nextRetryAt) result.nextRetryAt = row.nextRetryAt;
    if (row.metadata) result.metadata = row.metadata as Record<string, unknown>;

    return result;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a Drizzle dunning storage instance
 */
export function createDrizzleDunningStorage(
  config: DrizzleDunningStorageConfig
): DrizzleDunningStorage {
  return new DrizzleDunningStorage(config);
}
