/**
 * @parsrun/queue - Type Definitions
 * Queue types and interfaces
 */

// Re-export types from @parsrun/types for convenience
export {
  type,
  jobStatus,
  job,
  jobOptions,
  addJobRequest,
  jobProgressUpdate,
  queueStats as parsQueueStats,
  queueListOptions,
  redisQueueConfig,
  workerOptions,
  queueConfig,
  type JobStatus,
  type Job,
  type JobOptions,
  type AddJobRequest,
  type JobProgressUpdate,
  type QueueStats as ParsQueueStats,
  type QueueListOptions,
  type RedisQueueConfig,
  type WorkerOptions,
  type QueueConfig,
} from "@parsrun/types";

/**
 * Queue adapter type
 */
export type QueueAdapterType = "memory" | "cloudflare" | "qstash";

/**
 * Message payload
 */
export interface QueueMessage<T = unknown> {
  /** Unique message ID */
  id: string;
  /** Message payload */
  body: T;
  /** Message timestamp */
  timestamp: Date;
  /** Number of delivery attempts */
  attempts: number;
  /** Optional delay before processing (seconds) */
  delaySeconds?: number | undefined;
  /** Optional deduplication ID */
  deduplicationId?: string | undefined;
  /** Custom metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Send message options
 */
export interface SendMessageOptions {
  /** Delay before message is available (seconds) */
  delaySeconds?: number | undefined;
  /** Deduplication ID (prevents duplicate processing) */
  deduplicationId?: string | undefined;
  /** Custom metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Priority (higher = more important) */
  priority?: number | undefined;
}

/**
 * Batch send result
 */
export interface BatchSendResult {
  /** Total messages sent */
  total: number;
  /** Successfully sent */
  successful: number;
  /** Failed to send */
  failed: number;
  /** Individual message IDs */
  messageIds: string[];
  /** Failed messages with errors */
  errors: Array<{ index: number; error: string }>;
}

/**
 * Message handler function
 */
export type MessageHandler<T = unknown> = (
  message: QueueMessage<T>
) => void | Promise<void>;

/**
 * Consumer options
 */
export interface ConsumerOptions {
  /** Maximum messages to process per batch */
  batchSize?: number | undefined;
  /** Visibility timeout (seconds) - how long a message is hidden while processing */
  visibilityTimeout?: number | undefined;
  /** Polling interval (ms) for pull-based queues */
  pollingInterval?: number | undefined;
  /** Maximum retries before dead-letter */
  maxRetries?: number | undefined;
  /** Concurrency - how many messages to process in parallel */
  concurrency?: number | undefined;
}

/**
 * Queue adapter interface
 */
export interface QueueAdapter<T = unknown> {
  /** Adapter type */
  readonly type: QueueAdapterType;

  /** Queue name */
  readonly name: string;

  /**
   * Send a message to the queue
   */
  send(body: T, options?: SendMessageOptions): Promise<string>;

  /**
   * Send multiple messages at once
   */
  sendBatch?(messages: Array<{ body: T; options?: SendMessageOptions }>): Promise<BatchSendResult>;

  /**
   * Receive messages from the queue (pull-based)
   * Used for manual message processing
   */
  receive?(maxMessages?: number, visibilityTimeout?: number): Promise<QueueMessage<T>[]>;

  /**
   * Acknowledge message processing (mark as complete)
   */
  ack?(messageId: string): Promise<void>;

  /**
   * Acknowledge multiple messages
   */
  ackBatch?(messageIds: string[]): Promise<void>;

  /**
   * Return message to queue (negative acknowledgement)
   * Optionally with delay
   */
  nack?(messageId: string, delaySeconds?: number): Promise<void>;

  /**
   * Start consuming messages (push-based)
   * For adapters that support push-based processing
   */
  consume?(handler: MessageHandler<T>, options?: ConsumerOptions): Promise<void>;

  /**
   * Stop consuming messages
   */
  stopConsuming?(): Promise<void>;

  /**
   * Get queue statistics
   */
  getStats?(): Promise<QueueStats>;

  /**
   * Purge all messages from queue
   */
  purge?(): Promise<void>;

  /**
   * Close/cleanup adapter resources
   */
  close?(): Promise<void>;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Approximate number of messages in queue */
  messageCount: number;
  /** Messages currently being processed */
  inFlightCount?: number | undefined;
  /** Messages in dead-letter queue */
  deadLetterCount?: number | undefined;
}

/**
 * Queue service configuration
 */
export interface QueueServiceConfig<T = unknown> {
  /** Queue adapter to use */
  adapter: QueueAdapter<T>;
  /** Enable debug logging */
  debug?: boolean | undefined;
}

/**
 * Memory queue configuration
 */
export interface MemoryQueueConfig {
  /** Queue name */
  name: string;
  /** Maximum queue size (default: unlimited) */
  maxSize?: number | undefined;
  /** Default visibility timeout (seconds) */
  visibilityTimeout?: number | undefined;
}

/**
 * Cloudflare Queue configuration
 */
export interface CloudflareQueueConfig {
  /** Queue binding from environment */
  queue: CloudflareQueue;
}

/**
 * Cloudflare Queue interface (from Workers runtime)
 */
export interface CloudflareQueue<T = unknown> {
  send(message: T, options?: { delaySeconds?: number | undefined; contentType?: string | undefined }): Promise<void>;
  sendBatch(messages: Array<{ body: T; delaySeconds?: number | undefined; contentType?: string | undefined }>): Promise<void>;
}

/**
 * Cloudflare Queue batch
 */
export interface CloudflareMessageBatch<T = unknown> {
  readonly queue: string;
  readonly messages: Array<CloudflareMessage<T>>;
  ackAll(): void;
  retryAll(): void;
}

/**
 * Cloudflare Queue message
 */
export interface CloudflareMessage<T = unknown> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(): void;
}

/**
 * QStash configuration
 */
export interface QStashConfig {
  /** QStash token */
  token: string;
  /** Destination URL for message delivery */
  destinationUrl: string;
  /** Current request URL (for signature verification) */
  currentSigningKey?: string | undefined;
  /** Next signing key (for signature verification) */
  nextSigningKey?: string | undefined;
}

/**
 * Queue error
 */
export class QueueError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "QueueError";
  }
}

/**
 * Common queue error codes
 */
export const QueueErrorCodes = {
  SEND_FAILED: "SEND_FAILED",
  RECEIVE_FAILED: "RECEIVE_FAILED",
  ACK_FAILED: "ACK_FAILED",
  INVALID_CONFIG: "INVALID_CONFIG",
  QUEUE_FULL: "QUEUE_FULL",
  MESSAGE_NOT_FOUND: "MESSAGE_NOT_FOUND",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
} as const;
