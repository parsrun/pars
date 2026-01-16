/**
 * @parsrun/service - Dead Letter Queue
 * Storage for failed events
 */

import type { Logger } from "@parsrun/core";
import { createLogger, generateId } from "@parsrun/core";
import type { ParsEvent } from "../types.js";

// ============================================================================
// DEAD LETTER QUEUE
// ============================================================================

export interface DeadLetterEntry {
  /** Unique ID */
  id: string;
  /** Original event */
  event: ParsEvent;
  /** Error message */
  error: string;
  /** Handler pattern that failed */
  pattern: string;
  /** Number of attempts made */
  attempts: number;
  /** Timestamp when added */
  addedAt: Date;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface DeadLetterQueueOptions {
  /** Maximum entries to keep */
  maxSize?: number;
  /** Retention period in ms */
  retentionMs?: number;
  /** Callback when entry is added */
  onAdd?: (entry: DeadLetterEntry) => void;
  /** Callback when threshold is reached */
  onThreshold?: (count: number) => void;
  /** Alert threshold */
  alertThreshold?: number;
  /** Logger */
  logger?: Logger;
}

export interface AddEntryOptions {
  /** Original event */
  event: ParsEvent;
  /** Error message */
  error: string;
  /** Handler pattern */
  pattern: string;
  /** Number of attempts */
  attempts: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Resolved DLQ options
 */
interface ResolvedDlqOptions {
  maxSize: number;
  retentionMs: number;
  alertThreshold: number;
  onAdd?: (entry: DeadLetterEntry) => void;
  onThreshold?: (count: number) => void;
  logger?: Logger;
}

/**
 * In-memory Dead Letter Queue
 */
export class DeadLetterQueue {
  private readonly entries: Map<string, DeadLetterEntry> = new Map();
  private readonly resolvedOptions: ResolvedDlqOptions;
  private readonly logger: Logger;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DeadLetterQueueOptions = {}) {
    this.resolvedOptions = {
      maxSize: options.maxSize ?? 1000,
      retentionMs: options.retentionMs ?? 30 * 24 * 60 * 60 * 1000, // 30 days
      alertThreshold: options.alertThreshold ?? 10,
    };

    if (options.onAdd) this.resolvedOptions.onAdd = options.onAdd;
    if (options.onThreshold) this.resolvedOptions.onThreshold = options.onThreshold;
    if (options.logger) this.resolvedOptions.logger = options.logger;

    this.logger = options.logger ?? createLogger({ name: "dlq" });

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Add an entry to the DLQ
   */
  async add(options: AddEntryOptions): Promise<string> {
    const entry: DeadLetterEntry = {
      id: generateId(),
      event: options.event,
      error: options.error,
      pattern: options.pattern,
      attempts: options.attempts,
      addedAt: new Date(),
    };

    if (options.metadata) {
      entry.metadata = options.metadata;
    }

    // Check max size
    if (this.entries.size >= this.resolvedOptions.maxSize) {
      // Remove oldest entry
      const oldest = this.getOldest();
      if (oldest) {
        this.entries.delete(oldest.id);
        this.logger.debug(`DLQ: Removed oldest entry to make room`, {
          removedId: oldest.id,
        });
      }
    }

    this.entries.set(entry.id, entry);

    this.logger.warn(`DLQ: Entry added`, {
      id: entry.id,
      eventId: entry.event.id,
      eventType: entry.event.type,
      error: entry.error,
    });

    // Callbacks
    this.resolvedOptions.onAdd?.(entry);

    // Check threshold
    if (this.entries.size >= this.resolvedOptions.alertThreshold) {
      this.resolvedOptions.onThreshold?.(this.entries.size);
    }

    return entry.id;
  }

  /**
   * Get an entry by ID
   */
  get(id: string): DeadLetterEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all entries
   */
  getAll(): DeadLetterEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get entries by event type
   */
  getByEventType(eventType: string): DeadLetterEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.event.type === eventType
    );
  }

  /**
   * Get entries by pattern
   */
  getByPattern(pattern: string): DeadLetterEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.pattern === pattern
    );
  }

  /**
   * Remove an entry
   */
  remove(id: string): boolean {
    const deleted = this.entries.delete(id);
    if (deleted) {
      this.logger.debug(`DLQ: Entry removed`, { id });
    }
    return deleted;
  }

  /**
   * Retry an entry (remove from DLQ and return event)
   */
  retry(id: string): ParsEvent | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;

    this.entries.delete(id);
    this.logger.info(`DLQ: Entry removed for retry`, {
      id,
      eventId: entry.event.id,
    });

    return entry.event;
  }

  /**
   * Get count
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries.clear();
    this.logger.info(`DLQ: Cleared all entries`);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [id, entry] of this.entries) {
      const age = now - entry.addedAt.getTime();
      if (age > this.resolvedOptions.retentionMs) {
        this.entries.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug(`DLQ: Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Get oldest entry
   */
  private getOldest(): DeadLetterEntry | undefined {
    let oldest: DeadLetterEntry | undefined;

    for (const entry of this.entries.values()) {
      if (!oldest || entry.addedAt < oldest.addedAt) {
        oldest = entry;
      }
    }

    return oldest;
  }

  /**
   * Stop cleanup timer
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Export entries for persistence
   */
  export(): DeadLetterEntry[] {
    return Array.from(this.entries.values()).map((e) => ({
      ...e,
      addedAt: e.addedAt,
    }));
  }

  /**
   * Import entries from persistence
   */
  import(entries: DeadLetterEntry[]): void {
    for (const entry of entries) {
      this.entries.set(entry.id, {
        ...entry,
        addedAt: new Date(entry.addedAt),
      });
    }
    this.logger.info(`DLQ: Imported ${entries.length} entries`);
  }
}

/**
 * Create a dead letter queue
 */
export function createDeadLetterQueue(
  options?: DeadLetterQueueOptions
): DeadLetterQueue {
  return new DeadLetterQueue(options);
}
