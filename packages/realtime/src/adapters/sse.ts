/**
 * @parsrun/realtime - SSE Adapter
 * Server-Sent Events adapter for all runtimes
 */

import type {
  MessageHandler,
  PresenceUser,
  RealtimeAdapter,
  RealtimeMessage,
  SSEAdapterOptions,
  SSEConnection,
} from "../types.js";
import { formatSSEEvent, RealtimeError, RealtimeErrorCodes } from "../types.js";

/**
 * Resolved SSE adapter options (all required)
 */
interface ResolvedSSEOptions {
  pingInterval: number;
  connectionTimeout: number;
  maxConnectionsPerChannel: number;
  retryDelay: number;
}

/**
 * Default SSE adapter options
 */
const DEFAULT_OPTIONS: ResolvedSSEOptions = {
  pingInterval: 30000,
  connectionTimeout: 0,
  maxConnectionsPerChannel: 1000,
  retryDelay: 3000,
};

/**
 * SSE Adapter
 * Works on all runtimes (Node, Deno, Bun, Cloudflare Workers)
 */
export class SSEAdapter implements RealtimeAdapter {
  readonly type = "sse" as const;

  private options: ResolvedSSEOptions;
  private connections: Map<string, SSEConnection> = new Map();
  private channelSubscribers: Map<string, Map<string, MessageHandler>> = new Map();
  private presence: Map<string, Map<string, PresenceUser>> = new Map();
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(options: SSEAdapterOptions = {}) {
    this.options = {
      pingInterval: options.pingInterval ?? DEFAULT_OPTIONS.pingInterval,
      connectionTimeout: options.connectionTimeout ?? DEFAULT_OPTIONS.connectionTimeout,
      maxConnectionsPerChannel: options.maxConnectionsPerChannel ?? DEFAULT_OPTIONS.maxConnectionsPerChannel,
      retryDelay: options.retryDelay ?? DEFAULT_OPTIONS.retryDelay,
    };

    // Start ping interval
    if (this.options.pingInterval > 0) {
      this.startPingInterval();
    }
  }

  /**
   * Create SSE response for a new connection
   */
  createConnection(
    sessionId: string,
    userId?: string
  ): { response: Response; connection: SSEConnection } {
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    const connection: SSEConnection = {
      sessionId,
      userId,
      channels: new Set(),
      writer,
      state: "open",
      createdAt: Date.now(),
      lastPingAt: Date.now(),
    };

    this.connections.set(sessionId, connection);

    // Send initial retry directive
    const encoder = new TextEncoder();
    writer.write(encoder.encode(`retry:${this.options.retryDelay}\n\n`));

    const response = new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });

    return { response, connection };
  }

  /**
   * Close a connection
   */
  async closeConnection(sessionId: string): Promise<void> {
    const connection = this.connections.get(sessionId);
    if (!connection) return;

    connection.state = "closed";

    // Remove from all channels
    for (const channel of connection.channels) {
      await this.unsubscribe(channel, sessionId);
      await this.removePresence(channel, sessionId);
    }

    // Close writer
    try {
      await connection.writer.close();
    } catch {
      // Ignore close errors
    }

    this.connections.delete(sessionId);
  }

  /**
   * Get a connection by session ID
   */
  getConnection(sessionId: string): SSEConnection | undefined {
    return this.connections.get(sessionId);
  }

  /**
   * Get all active connections
   */
  getConnections(): Map<string, SSEConnection> {
    return this.connections;
  }

  // ============================================================================
  // RealtimeAdapter Implementation
  // ============================================================================

  async subscribe(
    channel: string,
    sessionId: string,
    handler: MessageHandler
  ): Promise<void> {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      throw new RealtimeError(
        "Connection not found",
        RealtimeErrorCodes.CONNECTION_FAILED
      );
    }

    // Check max connections per channel
    const subscribers = this.channelSubscribers.get(channel);
    if (
      subscribers &&
      subscribers.size >= this.options.maxConnectionsPerChannel
    ) {
      throw new RealtimeError(
        "Channel subscriber limit reached",
        RealtimeErrorCodes.RATE_LIMITED
      );
    }

    // Add to channel subscribers
    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Map());
    }
    this.channelSubscribers.get(channel)!.set(sessionId, handler);

    // Track channel on connection
    connection.channels.add(channel);

    // Send subscription confirmation
    await this.sendToConnection(connection, {
      id: crypto.randomUUID(),
      event: "channel:subscribe",
      channel,
      data: { channel },
      timestamp: Date.now(),
    });
  }

  async unsubscribe(channel: string, sessionId: string): Promise<void> {
    const subscribers = this.channelSubscribers.get(channel);
    if (subscribers) {
      subscribers.delete(sessionId);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }

    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.channels.delete(channel);
    }
  }

  async publish<T = unknown>(
    channel: string,
    message: RealtimeMessage<T>
  ): Promise<void> {
    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers) return;

    const promises: Promise<void>[] = [];

    for (const [sessionId, handler] of subscribers) {
      const connection = this.connections.get(sessionId);
      if (connection && connection.state === "open") {
        // Send via SSE
        promises.push(this.sendToConnection(connection, message));

        // Call handler
        try {
          const result = handler(message);
          if (result instanceof Promise) {
            promises.push(result.then(() => {}));
          }
        } catch {
          // Ignore handler errors
        }
      }
    }

    await Promise.allSettled(promises);
  }

  async sendToSession<T = unknown>(
    sessionId: string,
    message: RealtimeMessage<T>
  ): Promise<boolean> {
    const connection = this.connections.get(sessionId);
    if (!connection || connection.state !== "open") {
      return false;
    }

    try {
      await this.sendToConnection(connection, message);
      return true;
    } catch {
      return false;
    }
  }

  async getSubscribers(channel: string): Promise<string[]> {
    const subscribers = this.channelSubscribers.get(channel);
    return subscribers ? Array.from(subscribers.keys()) : [];
  }

  async setPresence<T = unknown>(
    channel: string,
    sessionId: string,
    userId: string,
    data: T
  ): Promise<void> {
    if (!this.presence.has(channel)) {
      this.presence.set(channel, new Map());
    }

    const now = Date.now();
    const existing = this.presence.get(channel)!.get(sessionId);

    const user: PresenceUser<T> = {
      userId,
      sessionId,
      data,
      joinedAt: existing?.joinedAt ?? now,
      lastSeenAt: now,
    };

    this.presence.get(channel)!.set(sessionId, user as PresenceUser);

    // Broadcast presence update
    const eventType = existing ? "presence:update" : "presence:join";
    await this.publish(channel, {
      id: crypto.randomUUID(),
      event: eventType,
      channel,
      data: {
        type: existing ? "update" : "join",
        user,
        presence: await this.getPresence(channel),
      },
      timestamp: now,
    });
  }

  async removePresence(channel: string, sessionId: string): Promise<void> {
    const channelPresence = this.presence.get(channel);
    if (!channelPresence) return;

    const user = channelPresence.get(sessionId);
    if (!user) return;

    channelPresence.delete(sessionId);
    if (channelPresence.size === 0) {
      this.presence.delete(channel);
    }

    // Broadcast presence leave
    await this.publish(channel, {
      id: crypto.randomUUID(),
      event: "presence:leave",
      channel,
      data: {
        type: "leave",
        user,
        presence: await this.getPresence(channel),
      },
      timestamp: Date.now(),
    });
  }

  async getPresence<T = unknown>(channel: string): Promise<PresenceUser<T>[]> {
    const channelPresence = this.presence.get(channel);
    if (!channelPresence) return [];
    return Array.from(channelPresence.values()) as PresenceUser<T>[];
  }

  async close(): Promise<void> {
    // Stop ping interval
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }

    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map((sessionId) =>
      this.closeConnection(sessionId)
    );
    await Promise.allSettled(closePromises);

    // Clear all data
    this.connections.clear();
    this.channelSubscribers.clear();
    this.presence.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async sendToConnection<T = unknown>(
    connection: SSEConnection,
    message: RealtimeMessage<T>
  ): Promise<void> {
    if (connection.state !== "open") return;

    const encoder = new TextEncoder();
    const sseEvent = formatSSEEvent(message as RealtimeMessage);

    try {
      await connection.writer.write(encoder.encode(sseEvent));
    } catch (err) {
      // Connection likely closed
      connection.state = "closed";
      await this.closeConnection(connection.sessionId);
    }
  }

  private startPingInterval(): void {
    this.pingIntervalId = setInterval(() => {
      this.sendPingToAll();
    }, this.options.pingInterval);
  }

  private async sendPingToAll(): Promise<void> {
    const now = Date.now();
    const encoder = new TextEncoder();
    const pingEvent = `event:ping\ndata:${now}\n\n`;

    for (const [sessionId, connection] of this.connections) {
      if (connection.state !== "open") continue;

      // Check connection timeout
      if (
        this.options.connectionTimeout > 0 &&
        now - connection.lastPingAt > this.options.connectionTimeout
      ) {
        await this.closeConnection(sessionId);
        continue;
      }

      try {
        await connection.writer.write(encoder.encode(pingEvent));
        connection.lastPingAt = now;
      } catch {
        // Connection likely closed
        await this.closeConnection(sessionId);
      }
    }
  }

  /**
   * Update last ping time (call when receiving client ping)
   */
  updateLastPing(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.lastPingAt = Date.now();
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalConnections: number;
    totalChannels: number;
    connectionsByChannel: Record<string, number>;
  } {
    const connectionsByChannel: Record<string, number> = {};

    for (const [channel, subscribers] of this.channelSubscribers) {
      connectionsByChannel[channel] = subscribers.size;
    }

    return {
      totalConnections: this.connections.size,
      totalChannels: this.channelSubscribers.size,
      connectionsByChannel,
    };
  }
}

/**
 * Create SSE adapter
 */
export function createSSEAdapter(options?: SSEAdapterOptions): SSEAdapter {
  return new SSEAdapter(options);
}
