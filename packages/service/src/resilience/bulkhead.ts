/**
 * @parsrun/service - Bulkhead
 * Limits concurrent requests to prevent resource exhaustion
 */

import { BulkheadRejectedError } from "../rpc/errors.js";

// ============================================================================
// BULKHEAD
// ============================================================================

export interface BulkheadOptions {
  /** Maximum concurrent requests */
  maxConcurrent: number;
  /** Maximum queue size (0 = no queue) */
  maxQueue: number;
  /** Optional callback when request is rejected */
  onRejected?: () => void;
}

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Bulkhead implementation
 *
 * Limits the number of concurrent requests to protect resources.
 * Excess requests can be queued up to maxQueue limit.
 */
export class Bulkhead {
  private _concurrent = 0;
  private readonly queue: QueuedRequest<unknown>[] = [];
  private readonly options: BulkheadOptions;

  constructor(options: BulkheadOptions) {
    this.options = options;
  }

  /**
   * Get current concurrent count
   */
  get concurrent(): number {
    return this._concurrent;
  }

  /**
   * Get current queue size
   */
  get queued(): number {
    return this.queue.length;
  }

  /**
   * Check if bulkhead is full
   */
  get isFull(): boolean {
    return (
      this._concurrent >= this.options.maxConcurrent &&
      this.queue.length >= this.options.maxQueue
    );
  }

  /**
   * Execute a function with bulkhead protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this._concurrent < this.options.maxConcurrent) {
      return this.doExecute(fn);
    }

    // Check if we can queue
    if (this.queue.length < this.options.maxQueue) {
      return this.enqueue(fn);
    }

    // Reject
    this.options.onRejected?.();
    throw new BulkheadRejectedError("service");
  }

  /**
   * Execute immediately
   */
  private async doExecute<T>(fn: () => Promise<T>): Promise<T> {
    this._concurrent++;
    try {
      return await fn();
    } finally {
      this._concurrent--;
      this.processQueue();
    }
  }

  /**
   * Add to queue
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    if (this.queue.length === 0) return;
    if (this._concurrent >= this.options.maxConcurrent) return;

    const queued = this.queue.shift();
    if (!queued) return;

    this.doExecute(queued.fn)
      .then(queued.resolve)
      .catch(queued.reject);
  }

  /**
   * Get bulkhead statistics
   */
  getStats(): {
    concurrent: number;
    queued: number;
    maxConcurrent: number;
    maxQueue: number;
  } {
    return {
      concurrent: this._concurrent,
      queued: this.queue.length,
      maxConcurrent: this.options.maxConcurrent,
      maxQueue: this.options.maxQueue,
    };
  }

  /**
   * Clear the queue (reject all pending)
   */
  clearQueue(): void {
    const error = new BulkheadRejectedError("service");
    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      queued?.reject(error);
    }
  }
}
