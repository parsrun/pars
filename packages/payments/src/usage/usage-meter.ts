/**
 * @parsrun/payments - Usage Meter
 * Buffers usage events and syncs to payment provider
 *
 * This solves the problem of:
 * - Not hitting provider API limits with per-request calls
 * - Reducing latency by batching usage reports
 * - Ensuring reliable usage reporting with retry logic
 */

import type { PaymentProviderType } from "../types.js";
import type { BillingLogger } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Usage record to report to provider
 */
export interface UsageRecord {
  /** Subscription item ID (Stripe) or subscription ID (Paddle) */
  subscriptionItemId: string;
  /** Usage quantity */
  quantity: number;
  /** Timestamp of usage (defaults to now) */
  timestamp?: Date;
  /** Action: increment (add to existing) or set (replace) */
  action?: "increment" | "set";
  /** Idempotency key to prevent duplicates */
  idempotencyKey?: string;
}

/**
 * Buffered usage record with metadata
 */
interface BufferedRecord {
  record: UsageRecord;
  customerId: string;
  featureKey: string;
  addedAt: Date;
  attempts: number;
}

/**
 * Usage reporter interface - implemented by providers
 */
export interface UsageReporter {
  /**
   * Report usage to the payment provider
   */
  reportUsage(record: UsageRecord): Promise<void>;

  /**
   * Report multiple usage records (batch)
   */
  reportUsageBatch?(records: UsageRecord[]): Promise<void>;

  /**
   * Get subscription item ID for a subscription and price
   */
  getSubscriptionItemId?(subscriptionId: string, priceId: string): Promise<string | null>;
}

/**
 * Sync strategy configuration
 */
export type SyncStrategy =
  | { type: "interval"; intervalMs: number }
  | { type: "threshold"; maxRecords: number; maxAgeMs: number }
  | { type: "manual" };

/**
 * Usage meter configuration
 */
export interface UsageMeterConfig {
  /** Usage reporter (provider with reportUsage method) */
  reporter: UsageReporter;

  /** Provider type for logging */
  providerType: PaymentProviderType;

  /** Sync strategy */
  strategy: SyncStrategy;

  /** Logger */
  logger?: BillingLogger;

  /** Max retry attempts for failed syncs */
  maxRetries?: number;

  /** Retry delay in ms */
  retryDelayMs?: number;

  /** Callback on successful sync */
  onSyncSuccess?: (count: number) => void;

  /** Callback on sync failure */
  onSyncError?: (error: Error, records: BufferedRecord[]) => void;

  /** Callback when buffer is getting full (>80%) */
  onBufferWarning?: (size: number, maxSize: number) => void;

  /** Maximum buffer size before forcing sync */
  maxBufferSize?: number;
}

/**
 * Null logger
 */
const nullLogger: BillingLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ============================================================================
// Usage Meter
// ============================================================================

/**
 * Usage Meter
 *
 * Buffers usage events and syncs to payment provider periodically.
 * Supports multiple sync strategies:
 * - interval: Sync every N milliseconds
 * - threshold: Sync when buffer reaches N records or records are older than N ms
 * - manual: Only sync when explicitly called
 *
 * @example
 * ```typescript
 * import { createUsageMeter } from "@parsrun/payments";
 *
 * const meter = createUsageMeter({
 *   reporter: stripeProvider, // Provider must implement UsageReporter
 *   providerType: "stripe",
 *   strategy: { type: "interval", intervalMs: 60000 }, // Sync every minute
 * });
 *
 * // Record usage (buffered, not sent immediately)
 * meter.record({
 *   customerId: "cus_123",
 *   featureKey: "api_calls",
 *   subscriptionItemId: "si_xxx",
 *   quantity: 1,
 * });
 *
 * // Force immediate sync
 * await meter.flush();
 *
 * // Cleanup when done
 * meter.stop();
 * ```
 */
export class UsageMeter {
  private readonly reporter: UsageReporter;
  private readonly providerType: PaymentProviderType;
  private readonly logger: BillingLogger;
  private readonly strategy: SyncStrategy;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly maxBufferSize: number;
  private readonly config: UsageMeterConfig;

  private buffer: BufferedRecord[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private isRunning = false;

  constructor(config: UsageMeterConfig) {
    this.reporter = config.reporter;
    this.providerType = config.providerType;
    this.logger = config.logger ?? nullLogger;
    this.strategy = config.strategy;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.maxBufferSize = config.maxBufferSize ?? 10000;
    this.config = config;

    this.start();
  }

  /**
   * Start the meter (auto-sync based on strategy)
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    if (this.strategy.type === "interval") {
      this.intervalId = setInterval(() => {
        this.flush().catch((err) => {
          this.logger.error("Auto-sync failed", { error: err.message });
        });
      }, this.strategy.intervalMs);

      this.logger.info("Usage meter started", {
        strategy: "interval",
        intervalMs: this.strategy.intervalMs,
        provider: this.providerType,
      });
    } else if (this.strategy.type === "threshold") {
      // Threshold strategy uses checkThreshold on each record
      this.logger.info("Usage meter started", {
        strategy: "threshold",
        maxRecords: this.strategy.maxRecords,
        maxAgeMs: this.strategy.maxAgeMs,
        provider: this.providerType,
      });
    } else {
      this.logger.info("Usage meter started", {
        strategy: "manual",
        provider: this.providerType,
      });
    }
  }

  /**
   * Stop the meter
   */
  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger.info("Usage meter stopped");
  }

  /**
   * Record usage (buffered)
   */
  record(options: {
    customerId: string;
    featureKey: string;
    subscriptionItemId: string;
    quantity: number;
    timestamp?: Date;
    action?: "increment" | "set";
    idempotencyKey?: string;
  }): void {
    // Build record with only defined optional properties
    const usageRecord: UsageRecord = {
      subscriptionItemId: options.subscriptionItemId,
      quantity: options.quantity,
      action: options.action ?? "increment",
    };

    if (options.timestamp !== undefined) {
      usageRecord.timestamp = options.timestamp;
    }
    if (options.idempotencyKey !== undefined) {
      usageRecord.idempotencyKey = options.idempotencyKey;
    }

    const record: BufferedRecord = {
      record: usageRecord,
      customerId: options.customerId,
      featureKey: options.featureKey,
      addedAt: new Date(),
      attempts: 0,
    };

    this.buffer.push(record);

    this.logger.debug("Usage recorded", {
      customerId: options.customerId,
      featureKey: options.featureKey,
      quantity: options.quantity,
      bufferSize: this.buffer.length,
    });

    // Check buffer size warning
    if (this.buffer.length > this.maxBufferSize * 0.8) {
      this.config.onBufferWarning?.(this.buffer.length, this.maxBufferSize);
    }

    // Force sync if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      this.logger.warn("Buffer full, forcing sync", { size: this.buffer.length });
      this.flush().catch((err) => {
        this.logger.error("Forced sync failed", { error: err.message });
      });
      return;
    }

    // Check threshold strategy
    if (this.strategy.type === "threshold") {
      this.checkThreshold();
    }
  }

  /**
   * Check threshold and trigger sync if needed
   */
  private checkThreshold(): void {
    if (this.strategy.type !== "threshold") return;
    if (this.isSyncing) return;

    const { maxRecords, maxAgeMs } = this.strategy;

    // Check record count
    if (this.buffer.length >= maxRecords) {
      this.logger.debug("Threshold reached (count)", { count: this.buffer.length });
      this.flush().catch((err) => {
        this.logger.error("Threshold sync failed", { error: err.message });
      });
      return;
    }

    // Check age of oldest record
    const oldestRecord = this.buffer[0];
    if (oldestRecord) {
      const age = Date.now() - oldestRecord.addedAt.getTime();
      if (age >= maxAgeMs) {
        this.logger.debug("Threshold reached (age)", { ageMs: age });
        this.flush().catch((err) => {
          this.logger.error("Threshold sync failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }
  }

  /**
   * Flush buffer to provider
   */
  async flush(): Promise<number> {
    if (this.isSyncing) {
      this.logger.debug("Sync already in progress, skipping");
      return 0;
    }

    if (this.buffer.length === 0) {
      return 0;
    }

    this.isSyncing = true;

    try {
      // Take current buffer and clear it
      const toSync = [...this.buffer];
      this.buffer = [];

      this.logger.info("Syncing usage to provider", {
        count: toSync.length,
        provider: this.providerType,
      });

      // Aggregate by subscription item ID
      const aggregated = this.aggregateRecords(toSync);

      // Sync to provider
      const failed: BufferedRecord[] = [];

      for (const [subscriptionItemId, records] of aggregated) {
        try {
          const totalQuantity = records.reduce((sum, r) => sum + r.record.quantity, 0);

          // Build sync record with only defined optional properties
          const syncRecord: UsageRecord = {
            subscriptionItemId,
            quantity: totalQuantity,
            action: "increment",
          };

          // Use first record's timestamp for the batch if available
          const firstTimestamp = records[0]?.record.timestamp;
          if (firstTimestamp !== undefined) {
            syncRecord.timestamp = firstTimestamp;
          }

          await this.syncWithRetry(syncRecord);

          this.logger.debug("Usage synced", {
            subscriptionItemId,
            quantity: totalQuantity,
            recordCount: records.length,
          });
        } catch (error) {
          this.logger.error("Failed to sync usage", {
            subscriptionItemId,
            error: error instanceof Error ? error.message : String(error),
          });

          // Mark records as failed and add back to buffer if retries left
          for (const record of records) {
            record.attempts++;
            if (record.attempts < this.maxRetries) {
              failed.push(record);
            } else {
              this.logger.error("Record exceeded max retries, dropping", {
                customerId: record.customerId,
                featureKey: record.featureKey,
                attempts: record.attempts,
              });
            }
          }
        }
      }

      // Add failed records back to buffer
      if (failed.length > 0) {
        this.buffer.unshift(...failed);
        this.config.onSyncError?.(new Error("Some records failed to sync"), failed);
      }

      const syncedCount = toSync.length - failed.length;

      if (syncedCount > 0) {
        this.config.onSyncSuccess?.(syncedCount);
      }

      return syncedCount;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Aggregate records by subscription item ID
   */
  private aggregateRecords(records: BufferedRecord[]): Map<string, BufferedRecord[]> {
    const map = new Map<string, BufferedRecord[]>();

    for (const record of records) {
      const key = record.record.subscriptionItemId;
      const existing = map.get(key) ?? [];
      existing.push(record);
      map.set(key, existing);
    }

    return map;
  }

  /**
   * Sync single record with retry
   */
  private async syncWithRetry(record: UsageRecord): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        await this.reporter.reportUsage(record);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn("Sync attempt failed, retrying", {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: lastError.message,
        });

        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelayMs * (attempt + 1)); // Exponential backoff
        }
      }
    }

    throw lastError ?? new Error("Sync failed after retries");
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get buffer size
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Get sync status
   */
  get syncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Get running status
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get buffer contents (for debugging)
   */
  getBuffer(): ReadonlyArray<BufferedRecord> {
    return this.buffer;
  }
}

/**
 * Create usage meter
 */
export function createUsageMeter(config: UsageMeterConfig): UsageMeter {
  return new UsageMeter(config);
}

// ============================================================================
// Subscription Item Resolver
// ============================================================================

/**
 * Subscription item mapping
 * Maps (customerId, featureKey) to subscriptionItemId
 */
export interface SubscriptionItemMapping {
  customerId: string;
  featureKey: string;
  subscriptionId: string;
  subscriptionItemId: string;
  priceId: string;
  createdAt: Date;
}

/**
 * Subscription item resolver configuration
 */
export interface SubscriptionItemResolverConfig {
  /** Reporter to fetch subscription items */
  reporter: UsageReporter;

  /** Cache TTL in ms (default: 1 hour) */
  cacheTtlMs?: number;

  /** Logger */
  logger?: BillingLogger;
}

/**
 * Subscription Item Resolver
 *
 * Resolves and caches subscription item IDs.
 * Stripe requires subscription_item_id for metered billing,
 * this resolver handles the lookup and caching.
 */
export class SubscriptionItemResolver {
  private readonly reporter: UsageReporter;
  private readonly cacheTtlMs: number;
  private readonly logger: BillingLogger;
  private cache = new Map<string, { itemId: string; expiresAt: Date }>();

  constructor(config: SubscriptionItemResolverConfig) {
    this.reporter = config.reporter;
    this.cacheTtlMs = config.cacheTtlMs ?? 60 * 60 * 1000; // 1 hour default
    this.logger = config.logger ?? nullLogger;
  }

  /**
   * Get subscription item ID
   */
  async resolve(subscriptionId: string, priceId: string): Promise<string | null> {
    const cacheKey = `${subscriptionId}:${priceId}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached.itemId;
    }

    // Fetch from provider
    if (!this.reporter.getSubscriptionItemId) {
      this.logger.warn("Reporter does not support getSubscriptionItemId");
      return null;
    }

    const itemId = await this.reporter.getSubscriptionItemId(subscriptionId, priceId);

    if (itemId) {
      // Cache the result
      this.cache.set(cacheKey, {
        itemId,
        expiresAt: new Date(Date.now() + this.cacheTtlMs),
      });
    }

    return itemId;
  }

  /**
   * Set cache entry manually (useful when creating subscriptions)
   */
  setCache(subscriptionId: string, priceId: string, itemId: string): void {
    const cacheKey = `${subscriptionId}:${priceId}`;
    this.cache.set(cacheKey, {
      itemId,
      expiresAt: new Date(Date.now() + this.cacheTtlMs),
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  get cacheSize(): number {
    return this.cache.size;
  }
}

/**
 * Create subscription item resolver
 */
export function createSubscriptionItemResolver(
  config: SubscriptionItemResolverConfig
): SubscriptionItemResolver {
  return new SubscriptionItemResolver(config);
}
