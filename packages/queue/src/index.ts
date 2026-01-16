/**
 * @parsrun/queue
 * Edge-compatible message queues for Pars
 *
 * Supports multiple adapters:
 * - Memory (development)
 * - Cloudflare Queues (Workers)
 * - Upstash QStash (Edge/Serverless)
 *
 * @example
 * ```typescript
 * import { createQueueService, createMemoryQueueAdapter } from '@parsrun/queue';
 *
 * const queue = createQueueService({
 *   adapter: createMemoryQueueAdapter({ name: 'tasks' }),
 * });
 *
 * await queue.send({ userId: '123', action: 'send-email' });
 * ```
 */

// Re-export types
export * from "./types.js";

// Re-export adapters
export {
  MemoryQueueAdapter,
  createMemoryQueueAdapter,
} from "./adapters/memory.js";

export {
  CloudflareQueueAdapter,
  CloudflareQueueProcessor,
  createCloudflareQueueAdapter,
  createCloudflareQueueProcessor,
} from "./adapters/cloudflare.js";

export {
  QStashAdapter,
  QStashReceiver,
  createQStashAdapter,
  createQStashReceiver,
} from "./adapters/qstash.js";

import type {
  BatchSendResult,
  ConsumerOptions,
  MessageHandler,
  QueueAdapter,
  QueueMessage,
  QueueServiceConfig,
  QueueStats,
  SendMessageOptions,
} from "./types.js";

/**
 * Queue Service
 * High-level queue service with adapter abstraction
 */
export class QueueService<T = unknown> {
  private adapter: QueueAdapter<T>;
  private debug: boolean;

  constructor(config: QueueServiceConfig<T>) {
    this.adapter = config.adapter;
    this.debug = config.debug ?? false;
  }

  /**
   * Get adapter type
   */
  get adapterType(): string {
    return this.adapter.type;
  }

  /**
   * Get queue name
   */
  get name(): string {
    return this.adapter.name;
  }

  /**
   * Send a message to the queue
   */
  async send(body: T, options?: SendMessageOptions): Promise<string> {
    if (this.debug) {
      console.log(`[Queue ${this.name}] Sending message:`, body);
    }

    const messageId = await this.adapter.send(body, options);

    if (this.debug) {
      console.log(`[Queue ${this.name}] Message sent: ${messageId}`);
    }

    return messageId;
  }

  /**
   * Send multiple messages at once
   */
  async sendBatch(
    messages: Array<{ body: T; options?: SendMessageOptions }>
  ): Promise<BatchSendResult> {
    if (this.debug) {
      console.log(`[Queue ${this.name}] Sending batch of ${messages.length} messages`);
    }

    if (this.adapter.sendBatch) {
      return this.adapter.sendBatch(messages);
    }

    // Fallback to sequential sends
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

  /**
   * Receive messages from the queue (pull-based)
   */
  async receive(
    maxMessages?: number,
    visibilityTimeout?: number
  ): Promise<QueueMessage<T>[]> {
    if (!this.adapter.receive) {
      throw new Error(`${this.adapter.type} adapter does not support receive()`);
    }

    return this.adapter.receive(maxMessages, visibilityTimeout);
  }

  /**
   * Acknowledge message processing (mark as complete)
   */
  async ack(messageId: string): Promise<void> {
    if (!this.adapter.ack) {
      throw new Error(`${this.adapter.type} adapter does not support ack()`);
    }

    await this.adapter.ack(messageId);
  }

  /**
   * Acknowledge multiple messages
   */
  async ackBatch(messageIds: string[]): Promise<void> {
    if (this.adapter.ackBatch) {
      await this.adapter.ackBatch(messageIds);
      return;
    }

    if (this.adapter.ack) {
      await Promise.all(messageIds.map((id) => this.adapter.ack!(id)));
      return;
    }

    throw new Error(`${this.adapter.type} adapter does not support ack()`);
  }

  /**
   * Return message to queue (negative acknowledgement)
   */
  async nack(messageId: string, delaySeconds?: number): Promise<void> {
    if (!this.adapter.nack) {
      throw new Error(`${this.adapter.type} adapter does not support nack()`);
    }

    await this.adapter.nack(messageId, delaySeconds);
  }

  /**
   * Start consuming messages (push-based)
   */
  async consume(
    handler: MessageHandler<T>,
    options?: ConsumerOptions
  ): Promise<void> {
    if (!this.adapter.consume) {
      throw new Error(`${this.adapter.type} adapter does not support consume()`);
    }

    if (this.debug) {
      console.log(`[Queue ${this.name}] Starting consumer`);
    }

    await this.adapter.consume(handler, options);
  }

  /**
   * Stop consuming messages
   */
  async stopConsuming(): Promise<void> {
    if (this.adapter.stopConsuming) {
      await this.adapter.stopConsuming();
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    if (this.adapter.getStats) {
      return this.adapter.getStats();
    }

    return { messageCount: -1 };
  }

  /**
   * Purge all messages from queue
   */
  async purge(): Promise<void> {
    if (this.adapter.purge) {
      await this.adapter.purge();
    }
  }

  /**
   * Close/cleanup queue resources
   */
  async close(): Promise<void> {
    if (this.adapter.close) {
      await this.adapter.close();
    }
  }
}

/**
 * Create a queue service
 *
 * @example
 * ```typescript
 * // With Memory (development)
 * const queue = createQueueService({
 *   adapter: createMemoryQueueAdapter({ name: 'tasks' }),
 * });
 *
 * // With Cloudflare Queues (Workers)
 * const queue = createQueueService({
 *   adapter: createCloudflareQueueAdapter({ queue: env.MY_QUEUE }),
 * });
 *
 * // With QStash (Edge)
 * const queue = createQueueService({
 *   adapter: createQStashAdapter({
 *     token: process.env.QSTASH_TOKEN,
 *     destinationUrl: 'https://myapp.com/api/queue',
 *   }),
 * });
 * ```
 */
export function createQueueService<T = unknown>(
  config: QueueServiceConfig<T>
): QueueService<T> {
  return new QueueService<T>(config);
}

// Default export
export default {
  QueueService,
  createQueueService,
};
