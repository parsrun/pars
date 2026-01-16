/**
 * @parsrun/realtime - Type Definitions
 * Realtime communication types and interfaces
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Realtime adapter type
 */
export type RealtimeAdapterType = "sse" | "durable-objects" | "memory";

/**
 * Realtime message
 */
export interface RealtimeMessage<T = unknown> {
  /** Unique message ID */
  id: string;
  /** Event type/name */
  event: string;
  /** Channel name */
  channel: string;
  /** Message payload */
  data: T;
  /** Sender ID (optional) */
  senderId?: string | undefined;
  /** Timestamp */
  timestamp: number;
  /** Metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Presence user data
 */
export interface PresenceUser<T = unknown> {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Custom presence data */
  data: T;
  /** Join timestamp */
  joinedAt: number;
  /** Last activity timestamp */
  lastSeenAt: number;
}

/**
 * Channel info
 */
export interface ChannelInfo {
  /** Channel name */
  name: string;
  /** Number of subscribers */
  subscriberCount: number;
  /** Presence users */
  presence: PresenceUser[];
  /** Channel metadata */
  metadata?: Record<string, unknown> | undefined;
}

// ============================================================================
// Events
// ============================================================================

/**
 * System event types
 */
export type SystemEventType =
  | "connection:open"
  | "connection:close"
  | "connection:error"
  | "presence:join"
  | "presence:leave"
  | "presence:update"
  | "channel:subscribe"
  | "channel:unsubscribe"
  | "ping"
  | "pong";

/**
 * Message handler function
 */
export type MessageHandler<T = unknown> = (
  message: RealtimeMessage<T>
) => void | Promise<void>;

/**
 * Connection event handler
 */
export type ConnectionHandler = (
  event: ConnectionEvent
) => void | Promise<void>;

/**
 * Connection event
 */
export interface ConnectionEvent {
  type: "open" | "close" | "error";
  sessionId: string;
  userId?: string | undefined;
  error?: Error | undefined;
  timestamp: number;
}

/**
 * Presence event
 */
export interface PresenceEvent<T = unknown> {
  type: "join" | "leave" | "update";
  channel: string;
  user: PresenceUser<T>;
  timestamp: number;
}

// ============================================================================
// Channel Interface
// ============================================================================

/**
 * Channel interface for realtime communication
 */
export interface Channel {
  /** Channel name */
  readonly name: string;

  /**
   * Broadcast message to all subscribers
   */
  broadcast<T = unknown>(event: string, data: T): Promise<void>;

  /**
   * Send message to specific user
   */
  send<T = unknown>(userId: string, event: string, data: T): Promise<void>;

  /**
   * Get current presence users
   */
  getPresence<T = unknown>(): Promise<PresenceUser<T>[]>;

  /**
   * Subscribe to channel messages
   */
  subscribe<T = unknown>(handler: MessageHandler<T>): () => void;

  /**
   * Subscribe to presence events
   */
  onPresence<T = unknown>(
    handler: (event: PresenceEvent<T>) => void
  ): () => void;

  /**
   * Get channel info
   */
  getInfo(): Promise<ChannelInfo>;
}

// ============================================================================
// Realtime Service Interface
// ============================================================================

/**
 * Realtime service interface
 */
export interface RealtimeService {
  /** Adapter type */
  readonly adapterType: RealtimeAdapterType;

  /**
   * Get or create a channel
   */
  channel(name: string): Channel;

  /**
   * Broadcast to a channel
   */
  broadcast<T = unknown>(channel: string, event: string, data: T): Promise<void>;

  /**
   * Get channel info
   */
  getChannelInfo(channel: string): Promise<ChannelInfo | null>;

  /**
   * List active channels
   */
  listChannels(): Promise<string[]>;

  /**
   * Subscribe to connection events
   */
  onConnection(handler: ConnectionHandler): () => void;

  /**
   * Close all connections and cleanup
   */
  close(): Promise<void>;
}

// ============================================================================
// Adapter Interface
// ============================================================================

/**
 * Realtime adapter interface (low-level)
 */
export interface RealtimeAdapter {
  /** Adapter type */
  readonly type: RealtimeAdapterType;

  /**
   * Add a subscriber to channel
   */
  subscribe(
    channel: string,
    sessionId: string,
    handler: MessageHandler
  ): Promise<void>;

  /**
   * Remove a subscriber from channel
   */
  unsubscribe(channel: string, sessionId: string): Promise<void>;

  /**
   * Publish message to channel
   */
  publish<T = unknown>(channel: string, message: RealtimeMessage<T>): Promise<void>;

  /**
   * Send to specific session
   */
  sendToSession<T = unknown>(
    sessionId: string,
    message: RealtimeMessage<T>
  ): Promise<boolean>;

  /**
   * Get subscribers for channel
   */
  getSubscribers(channel: string): Promise<string[]>;

  /**
   * Set presence for user in channel
   */
  setPresence<T = unknown>(
    channel: string,
    sessionId: string,
    userId: string,
    data: T
  ): Promise<void>;

  /**
   * Remove presence
   */
  removePresence(channel: string, sessionId: string): Promise<void>;

  /**
   * Get presence for channel
   */
  getPresence<T = unknown>(channel: string): Promise<PresenceUser<T>[]>;

  /**
   * Cleanup and close adapter
   */
  close(): Promise<void>;
}

// ============================================================================
// SSE Types
// ============================================================================

/**
 * SSE connection
 */
export interface SSEConnection {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string | undefined;
  /** Subscribed channels */
  channels: Set<string>;
  /** Response writer */
  writer: WritableStreamDefaultWriter<Uint8Array>;
  /** Connection state */
  state: "open" | "closed";
  /** Created timestamp */
  createdAt: number;
  /** Last ping timestamp */
  lastPingAt: number;
}

/**
 * SSE adapter options
 */
export interface SSEAdapterOptions {
  /** Ping interval in milliseconds (default: 30000) */
  pingInterval?: number | undefined;
  /** Connection timeout in milliseconds (default: 0 = no timeout) */
  connectionTimeout?: number | undefined;
  /** Max connections per channel (default: 1000) */
  maxConnectionsPerChannel?: number | undefined;
  /** Retry delay for client reconnection (default: 3000) */
  retryDelay?: number | undefined;
}

// ============================================================================
// Durable Objects Types
// ============================================================================

/**
 * Durable Objects adapter options
 */
export interface DurableObjectsAdapterOptions {
  /** Durable Object namespace binding */
  namespace: DurableObjectNamespace;
  /** Channel prefix (default: "channel:") */
  channelPrefix?: string | undefined;
}

/**
 * Durable Object WebSocket session
 */
export interface DOWebSocketSession {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId?: string | undefined;
  /** WebSocket connection */
  webSocket: WebSocket;
  /** Presence data */
  presence?: unknown;
  /** Connection state */
  state: "connecting" | "open" | "closing" | "closed";
  /** Created timestamp */
  createdAt: number;
}

/**
 * Durable Object state stored in storage
 */
export interface DOChannelState {
  /** Channel name */
  name: string;
  /** Channel metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Created timestamp */
  createdAt: number;
}

// ============================================================================
// Config Types
// ============================================================================

/**
 * Realtime config
 */
export interface RealtimeConfig {
  /** Adapter type */
  adapter: RealtimeAdapterType;

  /** SSE adapter options */
  sse?: SSEAdapterOptions | undefined;

  /** Durable Objects adapter options */
  durableObjects?: DurableObjectsAdapterOptions | undefined;

  /** Enable debug logging */
  debug?: boolean | undefined;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Realtime error
 */
export class RealtimeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RealtimeError";
  }
}

/**
 * Common error codes
 */
export const RealtimeErrorCodes = {
  CONNECTION_FAILED: "CONNECTION_FAILED",
  CHANNEL_NOT_FOUND: "CHANNEL_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  MESSAGE_TOO_LARGE: "MESSAGE_TOO_LARGE",
  RATE_LIMITED: "RATE_LIMITED",
  ADAPTER_ERROR: "ADAPTER_ERROR",
  INVALID_MESSAGE: "INVALID_MESSAGE",
} as const;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Create message options
 */
export interface CreateMessageOptions<T = unknown> {
  event: string;
  channel: string;
  data: T;
  senderId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Create a realtime message
 */
export function createMessage<T = unknown>(
  options: CreateMessageOptions<T>
): RealtimeMessage<T> {
  return {
    id: crypto.randomUUID(),
    event: options.event,
    channel: options.channel,
    data: options.data,
    senderId: options.senderId,
    timestamp: Date.now(),
    metadata: options.metadata,
  };
}

/**
 * Parse SSE event string
 */
export function parseSSEEvent(eventString: string): RealtimeMessage | null {
  try {
    const lines = eventString.split("\n");
    let event = "message";
    let data = "";
    let id = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data = line.slice(5).trim();
      } else if (line.startsWith("id:")) {
        id = line.slice(3).trim();
      }
    }

    if (!data) return null;

    const parsed = JSON.parse(data);
    return {
      id: id || parsed.id || crypto.randomUUID(),
      event,
      channel: parsed.channel || "",
      data: parsed.data ?? parsed,
      senderId: parsed.senderId,
      timestamp: parsed.timestamp || Date.now(),
      metadata: parsed.metadata,
    };
  } catch {
    return null;
  }
}

/**
 * Format message as SSE event string
 */
export function formatSSEEvent(message: RealtimeMessage): string {
  const lines: string[] = [];

  lines.push(`id:${message.id}`);
  lines.push(`event:${message.event}`);
  lines.push(`data:${JSON.stringify(message)}`);
  lines.push(""); // Empty line to end event

  return lines.join("\n") + "\n";
}
