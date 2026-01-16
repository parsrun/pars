/**
 * @parsrun/payments - Dunning Memory Storage
 * In-memory storage implementation for development and testing
 */

import type {
  DunningStorage,
  DunningState,
  DunningStatus,
  PaymentFailure,
} from "./types.js";

// ============================================================================
// Memory Storage Implementation
// ============================================================================

/**
 * In-memory dunning storage implementation
 * Use only for development/testing - data is lost on restart
 */
export class MemoryDunningStorage implements DunningStorage {
  private states: Map<string, DunningState> = new Map();
  private failures: Map<string, PaymentFailure[]> = new Map();
  private scheduledSteps: Array<{
    stateId: string;
    stepId: string;
    scheduledAt: Date;
  }> = [];

  // ============================================================================
  // Dunning State Methods
  // ============================================================================

  async getDunningState(customerId: string): Promise<DunningState | null> {
    for (const state of this.states.values()) {
      if (state.customerId === customerId) {
        return state;
      }
    }
    return null;
  }

  async getActiveDunningStates(): Promise<DunningState[]> {
    return Array.from(this.states.values()).filter((s) => s.status === "active");
  }

  async getDunningStatesByStatus(status: DunningStatus): Promise<DunningState[]> {
    return Array.from(this.states.values()).filter((s) => s.status === status);
  }

  async saveDunningState(state: DunningState): Promise<void> {
    this.states.set(state.id, { ...state });
  }

  async updateDunningState(id: string, updates: Partial<DunningState>): Promise<void> {
    const state = this.states.get(id);
    if (state) {
      this.states.set(id, { ...state, ...updates });
    }
  }

  // ============================================================================
  // Payment Failure Methods
  // ============================================================================

  async recordPaymentFailure(failure: PaymentFailure): Promise<void> {
    const customerFailures = this.failures.get(failure.customerId) ?? [];
    customerFailures.push({ ...failure });
    this.failures.set(failure.customerId, customerFailures);
  }

  async getPaymentFailures(customerId: string, limit = 50): Promise<PaymentFailure[]> {
    const customerFailures = this.failures.get(customerId) ?? [];
    return customerFailures
      .sort((a, b) => b.failedAt.getTime() - a.failedAt.getTime())
      .slice(0, limit);
  }

  // ============================================================================
  // Scheduled Steps Methods
  // ============================================================================

  async getScheduledSteps(
    before: Date
  ): Promise<Array<{ stateId: string; stepId: string; scheduledAt: Date }>> {
    return this.scheduledSteps.filter((s) => s.scheduledAt <= before);
  }

  async scheduleStep(stateId: string, stepId: string, scheduledAt: Date): Promise<void> {
    // Remove existing schedule for this step
    await this.removeScheduledStep(stateId, stepId);

    this.scheduledSteps.push({ stateId, stepId, scheduledAt });
  }

  async removeScheduledStep(stateId: string, stepId: string): Promise<void> {
    this.scheduledSteps = this.scheduledSteps.filter(
      (s) => !(s.stateId === stateId && s.stepId === stepId)
    );
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.states.clear();
    this.failures.clear();
    this.scheduledSteps = [];
  }

  /**
   * Get state by ID
   */
  getStateById(id: string): DunningState | undefined {
    return this.states.get(id);
  }

  /**
   * Get all states (for debugging)
   */
  getAllStates(): DunningState[] {
    return Array.from(this.states.values());
  }

  /**
   * Get all scheduled steps (for debugging)
   */
  getAllScheduledSteps(): Array<{ stateId: string; stepId: string; scheduledAt: Date }> {
    return [...this.scheduledSteps];
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an in-memory dunning storage instance
 */
export function createMemoryDunningStorage(): MemoryDunningStorage {
  return new MemoryDunningStorage();
}
