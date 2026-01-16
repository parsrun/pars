/**
 * @parsrun/queue - Memory Adapter
 * In-memory queue adapter for development and testing
 */

import type {
  BatchSendResult,
  ConsumerOptions,
  MemoryQueueConfig,
  MessageHandler,
  QueueAdapter,
  QueueMessage,
  QueueStats,
  SendMessageOptions,
} from "../types.js";
import { QueueError, QueueErrorCodes } from "../types.js";

interface InternalMessage<T> {
  id: string;
  body: T;
  timestamp: Date;
  attempts: number;
  visibleAt: number;
  deduplicationId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Memory Queue Adapter
 * Uses in-memory storage for development and testing
 *
 * @example
 * ```typescript
 * const queue = new MemoryQueueAdapter<{ userId: string }>({
 *   name: 'user-events',
 * });
 *
 * await queue.send({ userId: '123' });
 *
 * // Pull-based processing
 * const messages = await queue.receive(10);
 * for (const msg of messages) {
 *   console.log(msg.body);
 *   await queue.ack(msg.id);
 * }
 *
 * // Or push-based processing
 * await queue.consume(async (msg) => {
 *   console.log(msg.body);
 * });
 * ```
 */
export class MemoryQueueAdapter<T = unknown> implements QueueAdapter<T> {
  readonly type = "memory" as const;
  readonly name: string;

  private messages: InternalMessage<T>[] = [];
  private inFlight = new Map<string, InternalMessage<T>>();
  private processedIds = new Set<string>();
  private maxSize: number;
  private visibilityTimeout: number;
  private messageCounter = 0;
  private isConsuming = false;
  private consumeInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MemoryQueueConfig) {
    this.name = config.name;
    this.maxSize = config.maxSize ?? Infinity;
    this.visibilityTimeout = config.visibilityTimeout ?? 30;
  }

  private generateId(): string {
    this.messageCounter++;
    return `msg-${Date.now()}-${this.messageCounter}`;
  }

  async send(body: T, options?: SendMessageOptions): Promise<string> {
    // Check max size
    if (this.messages.length >= this.maxSize) {
      throw new QueueError(
        `Queue ${this.name} is full`,
        QueueErrorCodes.QUEUE_FULL
      );
    }

    // Check deduplication
    if (options?.deduplicationId && this.processedIds.has(options.deduplicationId)) {
      // Return existing message ID for deduplicated messages
      return `dedup-${options.deduplicationId}`;
    }

    const id = this.generateId();
    const now = Date.now();
    const visibleAt = options?.delaySeconds
      ? now + options.delaySeconds * 1000
      : now;

    const message: InternalMessage<T> = {
      id,
      body,
      timestamp: new Date(),
      attempts: 0,
      visibleAt,
      deduplicationId: options?.deduplicationId,
      metadata: options?.metadata,
    };

    // Insert based on priority (higher priority = earlier in queue)
    if (options?.priority !== undefined && options.priority > 0) {
      // Find position for priority message
      const insertIndex = this.messages.findIndex(
        (m) => (m.metadata?.["priority"] as number | undefined) ?? 0 < (options.priority ?? 0)
      );
      if (insertIndex === -1) {
        this.messages.push(message);
      } else {
        this.messages.splice(insertIndex, 0, message);
      }
    } else {
      this.messages.push(message);
    }

    if (options?.deduplicationId) {
      this.processedIds.add(options.deduplicationId);
    }

    return id;
  }

  async sendBatch(
    messages: Array<{ body: T; options?: SendMessageOptions }>
  ): Promise<BatchSendResult> {
    const messageIds: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;

      try {
        const id = await this.send(msg.body, msg.options);
        messageIds.push(id);
        successful++;
      } catch (err) {
        failed++;
        errors.push({
          index: i,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return {
      total: messages.length,
      successful,
      failed,
      messageIds,
      errors,
    };
  }

  async receive(
    maxMessages = 10,
    visibilityTimeoutOverride?: number
  ): Promise<QueueMessage<T>[]> {
    const now = Date.now();
    const timeout = (visibilityTimeoutOverride ?? this.visibilityTimeout) * 1000;
    const result: QueueMessage<T>[] = [];

    // Find visible messages
    const visibleMessages: InternalMessage<T>[] = [];
    const remainingMessages: InternalMessage<T>[] = [];

    for (const msg of this.messages) {
      if (msg.visibleAt <= now && visibleMessages.length < maxMessages) {
        visibleMessages.push(msg);
      } else {
        remainingMessages.push(msg);
      }
    }

    this.messages = remainingMessages;

    // Move to in-flight and increment attempts
    for (const msg of visibleMessages) {
      msg.attempts++;
      msg.visibleAt = now + timeout;
      this.inFlight.set(msg.id, msg);

      result.push({
        id: msg.id,
        body: msg.body,
        timestamp: msg.timestamp,
        attempts: msg.attempts,
        metadata: msg.metadata,
      });
    }

    return result;
  }

  async ack(messageId: string): Promise<void> {
    const message = this.inFlight.get(messageId);
    if (!message) {
      throw new QueueError(
        `Message ${messageId} not found in flight`,
        QueueErrorCodes.MESSAGE_NOT_FOUND
      );
    }

    this.inFlight.delete(messageId);
  }

  async ackBatch(messageIds: string[]): Promise<void> {
    for (const id of messageIds) {
      this.inFlight.delete(id);
    }
  }

  async nack(messageId: string, delaySeconds?: number): Promise<void> {
    const message = this.inFlight.get(messageId);
    if (!message) {
      throw new QueueError(
        `Message ${messageId} not found in flight`,
        QueueErrorCodes.MESSAGE_NOT_FOUND
      );
    }

    this.inFlight.delete(messageId);

    // Return to queue with optional delay
    const now = Date.now();
    message.visibleAt = delaySeconds ? now + delaySeconds * 1000 : now;
    this.messages.push(message);
  }

  async consume(
    handler: MessageHandler<T>,
    options?: ConsumerOptions
  ): Promise<void> {
    if (this.isConsuming) {
      return;
    }

    this.isConsuming = true;
    const batchSize = options?.batchSize ?? 10;
    const pollingInterval = options?.pollingInterval ?? 1000;
    const visibilityTimeout = options?.visibilityTimeout ?? this.visibilityTimeout;
    const maxRetries = options?.maxRetries ?? 3;
    const concurrency = options?.concurrency ?? 1;

    const processMessages = async (): Promise<void> => {
      if (!this.isConsuming) return;

      const messages = await this.receive(batchSize, visibilityTimeout);

      // Process in batches based on concurrency
      for (let i = 0; i < messages.length; i += concurrency) {
        const batch = messages.slice(i, i + concurrency);
        await Promise.all(
          batch.map(async (msg) => {
            try {
              await handler(msg);
              await this.ack(msg.id);
            } catch (err) {
              // Check retry limit
              if (msg.attempts >= maxRetries) {
                // Dead letter - just remove from queue
                await this.ack(msg.id);
                console.error(
                  `[Queue ${this.name}] Message ${msg.id} exceeded max retries, dropped`
                );
              } else {
                // Return to queue for retry
                await this.nack(msg.id, 5); // 5 second retry delay
              }
            }
          })
        );
      }
    };

    // Start polling
    this.consumeInterval = setInterval(processMessages, pollingInterval);

    // Process immediately
    await processMessages();
  }

  async stopConsuming(): Promise<void> {
    this.isConsuming = false;
    if (this.consumeInterval) {
      clearInterval(this.consumeInterval);
      this.consumeInterval = null;
    }
  }

  async getStats(): Promise<QueueStats> {
    // Return visibility timeout expired in-flight messages
    const now = Date.now();
    for (const [id, msg] of this.inFlight) {
      if (msg.visibleAt <= now) {
        this.inFlight.delete(id);
        this.messages.push(msg);
      }
    }

    return {
      messageCount: this.messages.length,
      inFlightCount: this.inFlight.size,
    };
  }

  async purge(): Promise<void> {
    this.messages = [];
    this.inFlight.clear();
  }

  async close(): Promise<void> {
    await this.stopConsuming();
    await this.purge();
    this.processedIds.clear();
  }
}

/**
 * Create a memory queue adapter
 */
export function createMemoryQueueAdapter<T = unknown>(
  config: MemoryQueueConfig
): MemoryQueueAdapter<T> {
  return new MemoryQueueAdapter<T>(config);
}
