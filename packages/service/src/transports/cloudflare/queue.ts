/**
 * @parsrun/service - Cloudflare Queue Transport
 * Event transport using Cloudflare Queues
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type {
  ParsEvent,
  EventTransport,
  EventHandler,
  EventHandlerOptions,
  Unsubscribe,
  CompactEvent,
} from "../../types.js";
import { toCompactEvent, fromCompactEvent } from "../../events/format.js";
import { EventHandlerRegistry } from "../../events/handler.js";

// ============================================================================
// CLOUDFLARE QUEUE TYPES
// ============================================================================

/**
 * Cloudflare Queue interface
 */
export interface CloudflareQueue {
  send(message: unknown, options?: { contentType?: string }): Promise<void>;
  sendBatch(
    messages: Array<{ body: unknown; contentType?: string }>
  ): Promise<void>;
}

/**
 * Queue message from Cloudflare
 */
export interface QueueMessage<T = unknown> {
  id: string;
  timestamp: Date;
  body: T;
  ack(): void;
  retry(): void;
}

/**
 * Queue batch from Cloudflare
 */
export interface QueueBatch<T = unknown> {
  queue: string;
  messages: QueueMessage<T>[];
  ackAll(): void;
  retryAll(): void;
}

// ============================================================================
// CLOUDFLARE QUEUE TRANSPORT
// ============================================================================

export interface CloudflareQueueTransportOptions {
  /** Cloudflare Queue binding */
  queue: CloudflareQueue;
  /** Queue name (for logging) */
  queueName?: string;
  /** Use compact event format */
  compact?: boolean;
  /** Logger */
  logger?: Logger;
  /** Batch size for sending */
  batchSize?: number;
  /** Flush interval in ms */
  flushInterval?: number;
}

/**
 * Event transport using Cloudflare Queues
 *
 * Events are sent to a Cloudflare Queue for async processing.
 * Handlers are registered to process events from the queue.
 */
export class CloudflareQueueTransport implements EventTransport {
  readonly name = "cloudflare-queue";
  private readonly queue: CloudflareQueue;
  private readonly queueName: string;
  private readonly compact: boolean;
  private readonly logger: Logger;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly registry: EventHandlerRegistry;
  private readonly buffer: ParsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: CloudflareQueueTransportOptions) {
    this.queue = options.queue;
    this.queueName = options.queueName ?? "events";
    this.compact = options.compact ?? true;
    this.logger = options.logger ?? createLogger({ name: `queue:${this.queueName}` });
    this.batchSize = options.batchSize ?? 100;
    this.flushInterval = options.flushInterval ?? 1000;
    this.registry = new EventHandlerRegistry({ logger: this.logger });

    // Start flush timer
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
  }

  /**
   * Emit an event to the queue
   */
  async emit<T>(event: ParsEvent<T>): Promise<void> {
    this.buffer.push(event);

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Subscribe to events (for local handler registration)
   */
  subscribe(
    eventType: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): Unsubscribe {
    return this.registry.register(eventType, handler, options);
  }

  /**
   * Flush buffered events to the queue
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0, this.batchSize);

    try {
      if (events.length === 1) {
        // Single event
        const body = this.compact
          ? toCompactEvent(events[0]!)
          : events[0];
        await this.queue.send(body);
      } else {
        // Batch send
        const messages = events.map((event) => ({
          body: this.compact ? toCompactEvent(event) : event,
        }));
        await this.queue.sendBatch(messages);
      }

      this.logger.debug(`Sent ${events.length} events to queue`, {
        queue: this.queueName,
      });
    } catch (error) {
      // Put events back in buffer for retry
      this.buffer.unshift(...events);
      this.logger.error("Failed to send events to queue", error as Error);
      throw error;
    }
  }

  /**
   * Handle a queue message (called by queue consumer)
   */
  async handleMessage<T>(message: QueueMessage<T>): Promise<void> {
    try {
      const event = this.parseEvent(message.body);
      await this.registry.handle(event);
      message.ack();
    } catch (error) {
      this.logger.error("Failed to handle queue message", error as Error, {
        messageId: message.id,
      });
      message.retry();
    }
  }

  /**
   * Handle a batch of queue messages
   */
  async handleBatch<T>(batch: QueueBatch<T>): Promise<void> {
    const results = await Promise.allSettled(
      batch.messages.map((msg) => this.handleMessage(msg))
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      this.logger.warn(`${failures.length}/${batch.messages.length} messages failed`);
    }
  }

  /**
   * Parse event from message body
   */
  private parseEvent(body: unknown): ParsEvent {
    if (this.compact && isCompactEvent(body)) {
      return fromCompactEvent(body as CompactEvent);
    }
    return body as ParsEvent;
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    this.registry.clear();
  }
}

/**
 * Create a Cloudflare Queue transport
 */
export function createCloudflareQueueTransport(
  options: CloudflareQueueTransportOptions
): CloudflareQueueTransport {
  return new CloudflareQueueTransport(options);
}

// ============================================================================
// QUEUE CONSUMER
// ============================================================================

/**
 * Create a queue consumer handler
 *
 * @example
 * ```typescript
 * // In your worker
 * const consumer = createQueueConsumer(registry);
 *
 * export default {
 *   queue: consumer,
 * };
 * ```
 */
export function createQueueConsumer(
  registry: EventHandlerRegistry,
  options?: {
    compact?: boolean;
    logger?: Logger;
  }
): (batch: QueueBatch) => Promise<void> {
  const compact = options?.compact ?? true;
  const logger = options?.logger ?? createLogger({ name: "queue-consumer" });

  return async (batch: QueueBatch): Promise<void> => {
    logger.info(`Processing batch of ${batch.messages.length} messages`, {
      queue: batch.queue,
    });

    for (const message of batch.messages) {
      try {
        let event: ParsEvent;

        if (compact && isCompactEvent(message.body)) {
          event = fromCompactEvent(message.body as CompactEvent);
        } else {
          event = message.body as ParsEvent;
        }

        await registry.handle(event);
        message.ack();
      } catch (error) {
        logger.error("Failed to process message", error as Error, {
          messageId: message.id,
        });
        message.retry();
      }
    }
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function isCompactEvent(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  return (
    typeof obj["e"] === "string" &&
    typeof obj["s"] === "string" &&
    typeof obj["i"] === "string" &&
    typeof obj["t"] === "number"
  );
}
