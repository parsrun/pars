/**
 * @parsrun/payments - Dunning Scheduler
 * Automated scheduling and execution of dunning steps
 */

import type { DunningLogger } from "./types.js";
import { DunningManager } from "./dunning-manager.js";

// ============================================================================
// Scheduler Configuration
// ============================================================================

/**
 * Dunning scheduler configuration
 */
export interface DunningSchedulerConfig {
  /** Dunning manager instance */
  manager: DunningManager;

  /** Poll interval in milliseconds (default: 60000 = 1 minute) */
  pollInterval?: number;

  /** Batch size for processing (default: 50) */
  batchSize?: number;

  /** Maximum concurrent executions (default: 5) */
  maxConcurrent?: number;

  /** Timezone for scheduling (default: UTC) */
  timezone?: string;

  /** Logger */
  logger?: DunningLogger;

  /** Error handler */
  onError?: (error: Error, stateId: string) => void | Promise<void>;

  /** Before step execution hook */
  beforeStep?: (stateId: string, stepId: string) => void | Promise<void>;

  /** After step execution hook */
  afterStep?: (stateId: string, stepId: string, success: boolean) => void | Promise<void>;
}

// ============================================================================
// Dunning Scheduler
// ============================================================================

/**
 * Dunning Scheduler
 * Handles automated execution of scheduled dunning steps
 */
export class DunningScheduler {
  private manager: DunningManager;
  private pollInterval: number;
  private batchSize: number;
  private maxConcurrent: number;
  private logger?: DunningLogger;
  private onError?: (error: Error, stateId: string) => void | Promise<void>;
  private beforeStep?: (stateId: string, stepId: string) => void | Promise<void>;
  private afterStep?: (stateId: string, stepId: string, success: boolean) => void | Promise<void>;

  private isRunning = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private processingStates: Set<string> = new Set();

  /** Timezone for scheduling (reserved for future use) */
  readonly timezone: string;

  constructor(config: DunningSchedulerConfig) {
    this.manager = config.manager;
    this.pollInterval = config.pollInterval ?? 60000; // 1 minute
    this.batchSize = config.batchSize ?? 50;
    this.maxConcurrent = config.maxConcurrent ?? 5;
    this.timezone = config.timezone ?? "UTC";
    if (config.logger) {
      this.logger = config.logger;
    }
    if (config.onError) {
      this.onError = config.onError;
    }
    if (config.beforeStep) {
      this.beforeStep = config.beforeStep;
    }
    if (config.afterStep) {
      this.afterStep = config.afterStep;
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      this.logger?.warn("Scheduler already running");
      return;
    }

    this.isRunning = true;
    this.logger?.info("Dunning scheduler started", {
      pollInterval: this.pollInterval,
      batchSize: this.batchSize,
      maxConcurrent: this.maxConcurrent,
    });

    // Start polling
    this.poll();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      delete this.pollTimer;
    }

    this.logger?.info("Dunning scheduler stopped");
  }

  /**
   * Check if scheduler is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get current processing count
   */
  get processingCount(): number {
    return this.processingStates.size;
  }

  // ============================================================================
  // Processing
  // ============================================================================

  /**
   * Poll for scheduled steps
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.processScheduledSteps();
    } catch (error) {
      this.logger?.error("Poll error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    }
  }

  /**
   * Process all scheduled steps that are due
   */
  async processScheduledSteps(): Promise<number> {
    const now = new Date();
    const scheduled = await this.manager.getScheduledSteps(now);

    if (scheduled.length === 0) {
      return 0;
    }

    this.logger?.debug("Found scheduled steps", {
      count: scheduled.length,
      before: now.toISOString(),
    });

    // Filter out already processing
    const toProcess = scheduled
      .filter((s) => !this.processingStates.has(s.stateId))
      .slice(0, this.batchSize);

    if (toProcess.length === 0) {
      return 0;
    }

    // Process in batches respecting maxConcurrent
    let processed = 0;
    const batches = this.chunk(toProcess, this.maxConcurrent);

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map((item) => this.executeScheduledStep(item.stateId, item.stepId))
      );

      processed += results.filter((r) => r.status === "fulfilled").length;
    }

    return processed;
  }

  /**
   * Execute a single scheduled step
   */
  private async executeScheduledStep(stateId: string, stepId: string): Promise<void> {
    // Mark as processing
    this.processingStates.add(stateId);

    try {
      // Before hook
      if (this.beforeStep) {
        await this.beforeStep(stateId, stepId);
      }

      this.logger?.debug("Executing scheduled step", { stateId, stepId });

      // Execute step
      const result = await this.manager.executeStep(stateId);
      const success = result !== null;

      this.logger?.info("Scheduled step executed", {
        stateId,
        stepId,
        success,
        actionsTaken: result?.actionsTaken,
      });

      // After hook
      if (this.afterStep) {
        await this.afterStep(stateId, stepId, success);
      }
    } catch (error) {
      this.logger?.error("Step execution failed", {
        stateId,
        stepId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (this.onError) {
        await this.onError(error instanceof Error ? error : new Error(String(error)), stateId);
      }
    } finally {
      // Remove from processing
      this.processingStates.delete(stateId);
    }
  }

  /**
   * Manually trigger processing (for testing or cron jobs)
   */
  async trigger(): Promise<number> {
    return this.processScheduledSteps();
  }

  /**
   * Process a specific dunning state immediately
   */
  async processNow(stateId: string): Promise<boolean> {
    const state = await this.manager.getDunningState(stateId);
    if (!state) {
      this.logger?.warn("State not found for immediate processing", { stateId });
      return false;
    }

    try {
      await this.executeScheduledStep(state.id, state.currentStepId);
      return true;
    } catch (error) {
      this.logger?.error("Immediate processing failed", {
        stateId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Split array into chunks
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a dunning scheduler
 */
export function createDunningScheduler(config: DunningSchedulerConfig): DunningScheduler {
  return new DunningScheduler(config);
}

// ============================================================================
// Cron Integration
// ============================================================================

/**
 * Create a cron-compatible handler for dunning processing
 *
 * @example
 * ```typescript
 * // In a cron job or serverless function
 * export async function handler() {
 *   const processor = createDunningCronHandler(manager);
 *   const result = await processor();
 *   console.log(`Processed ${result.processed} dunning steps`);
 * }
 * ```
 */
export function createDunningCronHandler(
  manager: DunningManager,
  options?: {
    batchSize?: number;
    maxConcurrent?: number;
    logger?: DunningLogger;
  }
): () => Promise<{ processed: number; errors: number }> {
  return async () => {
    const config: DunningSchedulerConfig = {
      manager,
      batchSize: options?.batchSize ?? 100,
      maxConcurrent: options?.maxConcurrent ?? 10,
    };
    if (options?.logger) {
      config.logger = options.logger;
    }

    const scheduler = new DunningScheduler(config);

    let errors = 0;
    const originalOnError = scheduler["onError"];
    scheduler["onError"] = async (error, stateId) => {
      errors++;
      if (originalOnError) await originalOnError(error, stateId);
    };

    const processed = await scheduler.trigger();

    return { processed, errors };
  };
}

// ============================================================================
// Edge/Serverless Handler
// ============================================================================

/**
 * Create a handler for edge/serverless environments
 * Processes dunning in a single invocation
 *
 * @example
 * ```typescript
 * // In a Cloudflare Worker or similar
 * export default {
 *   async scheduled(event, env, ctx) {
 *     const handler = createDunningEdgeHandler(manager, { maxDurationMs: 25000 });
 *     const result = await handler();
 *     console.log(result);
 *   }
 * }
 * ```
 */
export function createDunningEdgeHandler(
  manager: DunningManager,
  options?: {
    maxDurationMs?: number;
    batchSize?: number;
    logger?: DunningLogger;
  }
): () => Promise<{
  processed: number;
  errors: number;
  duration: number;
  timedOut: boolean;
}> {
  const maxDuration = options?.maxDurationMs ?? 30000; // 30 seconds default
  const batchSize = options?.batchSize ?? 25;

  return async () => {
    const startTime = Date.now();
    let processed = 0;
    let errors = 0;
    let timedOut = false;

    const now = new Date();
    const scheduled = await manager.getScheduledSteps(now);

    for (let i = 0; i < scheduled.length; i += batchSize) {
      // Check timeout
      if (Date.now() - startTime > maxDuration) {
        timedOut = true;
        options?.logger?.warn("Edge handler timed out", {
          processed,
          remaining: scheduled.length - i,
        });
        break;
      }

      const batch = scheduled.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            await manager.executeStep(item.stateId);
            return true;
          } catch (error) {
            options?.logger?.error("Step execution error", {
              stateId: item.stateId,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          processed++;
        } else {
          errors++;
        }
      }
    }

    const duration = Date.now() - startTime;

    return { processed, errors, duration, timedOut };
  };
}
