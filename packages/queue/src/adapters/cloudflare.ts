/**
 * @parsrun/queue - Cloudflare Queues Adapter
 * Adapter for Cloudflare Workers Queues
 */

import type {
  BatchSendResult,
  CloudflareMessage,
  CloudflareMessageBatch,
  CloudflareQueue,
  CloudflareQueueConfig,
  QueueAdapter,
  QueueMessage,
  SendMessageOptions,
} from "../types.js";
import { QueueError, QueueErrorCodes } from "../types.js";

/**
 * Cloudflare Queue Adapter
 * Uses Cloudflare Workers Queues for serverless message processing
 *
 * Cloudflare Queues uses a push-based model where messages are delivered
 * to queue consumers via Workers.
 *
 * @example
 * ```typescript
 * // In your Worker
 * export default {
 *   async fetch(request, env) {
 *     const queue = new CloudflareQueueAdapter({
 *       queue: env.MY_QUEUE,
 *     });
 *
 *     await queue.send({ userId: '123', action: 'welcome-email' });
 *     return new Response('Queued');
 *   },
 *
 *   async queue(batch, env) {
 *     // Process messages delivered by Cloudflare
 *     const processor = new CloudflareQueueProcessor();
 *     await processor.processBatch(batch, async (msg) => {
 *       console.log('Processing:', msg.body);
 *     });
 *   }
 * }
 * ```
 */
export class CloudflareQueueAdapter<T = unknown> implements QueueAdapter<T> {
  readonly type = "cloudflare" as const;
  readonly name = "cloudflare-queue";

  private queue: CloudflareQueue<T>;

  constructor(config: CloudflareQueueConfig) {
    this.queue = config.queue as CloudflareQueue<T>;
  }

  async send(body: T, options?: SendMessageOptions): Promise<string> {
    try {
      await this.queue.send(body, {
        delaySeconds: options?.delaySeconds,
      });

      // Cloudflare Queues don't return message IDs on send
      // Generate a client-side ID for tracking
      return `cf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    } catch (err) {
      throw new QueueError(
        `Cloudflare Queue send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        QueueErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  async sendBatch(
    messages: Array<{ body: T; options?: SendMessageOptions }>
  ): Promise<BatchSendResult> {
    try {
      const batchMessages = messages.map((m) => ({
        body: m.body,
        delaySeconds: m.options?.delaySeconds,
      }));

      await this.queue.sendBatch(batchMessages);

      // Generate client-side IDs
      const messageIds = messages.map(
        () => `cf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      );

      return {
        total: messages.length,
        successful: messages.length,
        failed: 0,
        messageIds,
        errors: [],
      };
    } catch (err) {
      throw new QueueError(
        `Cloudflare Queue batch send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        QueueErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  // Cloudflare Queues are push-based, so receive is not applicable
  // Messages are delivered to queue handlers via Workers
}

/**
 * Cloudflare Queue Processor
 * Helper for processing queue batches in Workers queue handlers
 *
 * @example
 * ```typescript
 * export default {
 *   async queue(batch, env) {
 *     const processor = new CloudflareQueueProcessor<MyMessageType>();
 *     await processor.processBatch(batch, async (msg) => {
 *       // Process each message
 *       await handleMessage(msg.body);
 *     });
 *   }
 * }
 * ```
 */
export class CloudflareQueueProcessor<T = unknown> {
  /**
   * Process a batch of messages from Cloudflare Queues
   */
  async processBatch(
    batch: CloudflareMessageBatch<T>,
    handler: (message: QueueMessage<T>) => void | Promise<void>,
    options?: {
      /** Whether to ack all messages at once (default: false - ack individually) */
      ackAll?: boolean;
      /** Whether to retry all on any failure (default: false) */
      retryAllOnFailure?: boolean;
    }
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (const msg of batch.messages) {
      try {
        const queueMessage: QueueMessage<T> = {
          id: msg.id,
          body: msg.body,
          timestamp: msg.timestamp,
          attempts: msg.attempts,
        };

        await handler(queueMessage);

        if (!options?.ackAll) {
          msg.ack();
        }
        processed++;
      } catch (err) {
        failed++;

        if (options?.retryAllOnFailure) {
          batch.retryAll();
          return { processed, failed: batch.messages.length };
        }

        // Retry individual message
        msg.retry();
      }
    }

    if (options?.ackAll && failed === 0) {
      batch.ackAll();
    }

    return { processed, failed };
  }

  /**
   * Convert a Cloudflare message to QueueMessage format
   */
  toQueueMessage(msg: CloudflareMessage<T>): QueueMessage<T> {
    return {
      id: msg.id,
      body: msg.body,
      timestamp: msg.timestamp,
      attempts: msg.attempts,
    };
  }
}

/**
 * Create a Cloudflare Queue adapter
 */
export function createCloudflareQueueAdapter<T = unknown>(
  config: CloudflareQueueConfig
): CloudflareQueueAdapter<T> {
  return new CloudflareQueueAdapter<T>(config);
}

/**
 * Create a Cloudflare Queue processor
 */
export function createCloudflareQueueProcessor<T = unknown>(): CloudflareQueueProcessor<T> {
  return new CloudflareQueueProcessor<T>();
}
