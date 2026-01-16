/**
 * @parsrun/realtime - Durable Objects Adapter
 * Cloudflare Durable Objects adapter for WebSocket-based realtime
 */

import type {
  DOWebSocketSession,
  DurableObjectsAdapterOptions,
  MessageHandler,
  PresenceUser,
  RealtimeAdapter,
  RealtimeMessage,
} from "../types.js";
import { createMessage } from "../types.js";

// ============================================================================
// Durable Object Class (Export for wrangler.toml binding)
// ============================================================================

/**
 * RealtimeChannel Durable Object
 * Manages a single realtime channel with WebSocket connections
 *
 * Usage in wrangler.toml:
 * ```toml
 * [durable_objects]
 * bindings = [{ name = "REALTIME_CHANNELS", class_name = "RealtimeChannelDO" }]
 *
 * [[migrations]]
 * tag = "v1"
 * new_classes = ["RealtimeChannelDO"]
 * ```
 */
export class RealtimeChannelDO implements DurableObject {
  private sessions: Map<string, DOWebSocketSession> = new Map();
  private presence: Map<string, PresenceUser> = new Map();
  private channelName: string = "";
  private state: DurableObjectState;

  constructor(
    state: DurableObjectState,
    _env: unknown
  ) {
    this.state = state;
    // Restore hibernated WebSocket sessions
    this.state.getWebSockets().forEach((ws) => {
      const meta = ws.deserializeAttachment() as {
        sessionId: string;
        userId?: string;
      } | null;
      if (meta) {
        this.sessions.set(meta.sessionId, {
          sessionId: meta.sessionId,
          userId: meta.userId,
          webSocket: ws,
          state: "open",
          createdAt: Date.now(),
        });
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Extract channel name from path
    const pathParts = url.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart) {
      this.channelName = lastPart;
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // REST API endpoints
    switch (url.pathname.split("/").pop()) {
      case "broadcast":
        return this.handleBroadcast(request);
      case "presence":
        return this.handleGetPresence();
      case "info":
        return this.handleGetInfo();
      case "send":
        return this.handleSendToUser(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  // ============================================================================
  // WebSocket Handling
  // ============================================================================

  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();
    const userId = url.searchParams.get("userId") || undefined;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Store session metadata for hibernation
    server.serializeAttachment({ sessionId, userId });

    this.state.acceptWebSocket(server);

    const session: DOWebSocketSession = {
      sessionId,
      userId,
      webSocket: server,
      state: "open",
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);

    // Send connection confirmation
    server.send(
      JSON.stringify(
        createMessage({
          event: "connection:open",
          channel: this.channelName,
          data: { sessionId, userId },
        })
      )
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    const session = this.getSessionByWebSocket(ws);
    if (!session) return;

    try {
      const data =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);

      const parsed = JSON.parse(data) as RealtimeMessage;
      await this.handleMessage(session, parsed);
    } catch {
      // Invalid message format, ignore
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const session = this.getSessionByWebSocket(ws);
    if (!session) return;

    // Remove presence
    this.presence.delete(session.sessionId);
    await this.broadcastPresenceUpdate();

    // Remove session
    this.sessions.delete(session.sessionId);

    // Broadcast leave event
    await this.broadcastToAll({
      event: "connection:close",
      channel: this.channelName,
      data: {
        sessionId: session.sessionId,
        userId: session.userId,
        code,
        reason,
      },
    });
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    const session = this.getSessionByWebSocket(ws);
    if (session) {
      session.state = "closed";
      this.sessions.delete(session.sessionId);
      this.presence.delete(session.sessionId);
    }
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private async handleMessage(
    session: DOWebSocketSession,
    message: RealtimeMessage
  ): Promise<void> {
    switch (message.event) {
      case "ping":
        session.webSocket.send(
          JSON.stringify(
            createMessage({
              event: "pong",
              channel: this.channelName,
              data: { timestamp: Date.now() },
            })
          )
        );
        break;

      case "presence:join":
        await this.handlePresenceJoin(session, message.data);
        break;

      case "presence:update":
        await this.handlePresenceUpdate(session, message.data);
        break;

      case "presence:leave":
        await this.handlePresenceLeave(session);
        break;

      case "broadcast":
        // Broadcast to all except sender
        await this.broadcastToAll(
          {
            event: message.event,
            channel: this.channelName,
            data: message.data,
            senderId: session.sessionId,
          },
          session.sessionId
        );
        break;

      default:
        // Forward custom events
        await this.broadcastToAll(
          {
            event: message.event,
            channel: this.channelName,
            data: message.data,
            senderId: session.sessionId,
          },
          session.sessionId
        );
    }
  }

  // ============================================================================
  // Presence Handling
  // ============================================================================

  private async handlePresenceJoin(
    session: DOWebSocketSession,
    data: unknown
  ): Promise<void> {
    const now = Date.now();
    const user: PresenceUser = {
      userId: session.userId || session.sessionId,
      sessionId: session.sessionId,
      data,
      joinedAt: now,
      lastSeenAt: now,
    };

    this.presence.set(session.sessionId, user);
    session.presence = data;

    await this.broadcastPresenceUpdate();
  }

  private async handlePresenceUpdate(
    session: DOWebSocketSession,
    data: unknown
  ): Promise<void> {
    const existing = this.presence.get(session.sessionId);
    if (existing) {
      existing.data = data;
      existing.lastSeenAt = Date.now();
      session.presence = data;
      await this.broadcastPresenceUpdate();
    }
  }

  private async handlePresenceLeave(session: DOWebSocketSession): Promise<void> {
    this.presence.delete(session.sessionId);
    session.presence = undefined;
    await this.broadcastPresenceUpdate();
  }

  private async broadcastPresenceUpdate(): Promise<void> {
    const presenceList = Array.from(this.presence.values());

    await this.broadcastToAll({
      event: "presence:sync",
      channel: this.channelName,
      data: presenceList,
    });
  }

  // ============================================================================
  // REST API Handlers
  // ============================================================================

  private async handleBroadcast(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as { event: string; data: unknown };

      await this.broadcastToAll({
        event: body.event,
        channel: this.channelName,
        data: body.data,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: String(err) }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private handleGetPresence(): Response {
    const presenceList = Array.from(this.presence.values());
    return new Response(JSON.stringify(presenceList), {
      headers: { "Content-Type": "application/json" },
    });
  }

  private handleGetInfo(): Response {
    return new Response(
      JSON.stringify({
        channel: this.channelName,
        connections: this.sessions.size,
        presence: this.presence.size,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  private async handleSendToUser(request: Request): Promise<Response> {
    try {
      const body = (await request.json()) as {
        userId: string;
        event: string;
        data: unknown;
      };

      let sent = false;
      for (const session of this.sessions.values()) {
        if (session.userId === body.userId && session.state === "open") {
          session.webSocket.send(
            JSON.stringify(
              createMessage({
                event: body.event,
                channel: this.channelName,
                data: body.data,
              })
            )
          );
          sent = true;
        }
      }

      return new Response(JSON.stringify({ success: true, sent }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ success: false, error: String(err) }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getSessionByWebSocket(ws: WebSocket): DOWebSocketSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.webSocket === ws) {
        return session;
      }
    }
    return undefined;
  }

  private async broadcastToAll(
    messageData: {
      event: string;
      channel: string;
      data: unknown;
      senderId?: string;
    },
    excludeSessionId?: string
  ): Promise<void> {
    const message = createMessage(messageData);
    const payload = JSON.stringify(message);

    for (const session of this.sessions.values()) {
      if (session.sessionId === excludeSessionId) continue;
      if (session.state !== "open") continue;

      try {
        session.webSocket.send(payload);
      } catch {
        // Connection might be closed
        session.state = "closed";
      }
    }
  }
}

// ============================================================================
// Durable Objects Adapter (Client-side)
// ============================================================================

/**
 * Durable Objects Adapter
 * Uses RealtimeChannelDO for channel management
 */
export class DurableObjectsAdapter implements RealtimeAdapter {
  readonly type = "durable-objects" as const;

  private namespace: DurableObjectNamespace;
  private channelPrefix: string;
  private localHandlers: Map<string, Map<string, MessageHandler>> = new Map();

  constructor(options: DurableObjectsAdapterOptions) {
    this.namespace = options.namespace;
    this.channelPrefix = options.channelPrefix ?? "channel:";
  }

  /**
   * Get Durable Object stub for a channel
   */
  getChannelStub(channel: string): DurableObjectStub {
    const id = this.namespace.idFromName(`${this.channelPrefix}${channel}`);
    return this.namespace.get(id);
  }

  /**
   * Get WebSocket URL for a channel
   */
  getWebSocketUrl(
    channel: string,
    sessionId: string,
    userId?: string,
    baseUrl?: string
  ): string {
    const base = baseUrl || "wss://your-worker.your-subdomain.workers.dev";
    const params = new URLSearchParams({ sessionId });
    if (userId) params.set("userId", userId);
    return `${base}/realtime/${channel}?${params}`;
  }

  // ============================================================================
  // RealtimeAdapter Implementation
  // ============================================================================

  async subscribe(
    channel: string,
    sessionId: string,
    handler: MessageHandler
  ): Promise<void> {
    // Store handler locally for callback
    if (!this.localHandlers.has(channel)) {
      this.localHandlers.set(channel, new Map());
    }
    this.localHandlers.get(channel)!.set(sessionId, handler);

    // Note: Actual WebSocket subscription happens via WebSocket connection
    // This is used for server-side handler registration
  }

  async unsubscribe(channel: string, sessionId: string): Promise<void> {
    const handlers = this.localHandlers.get(channel);
    if (handlers) {
      handlers.delete(sessionId);
      if (handlers.size === 0) {
        this.localHandlers.delete(channel);
      }
    }
  }

  async publish<T = unknown>(
    channel: string,
    message: RealtimeMessage<T>
  ): Promise<void> {
    const stub = this.getChannelStub(channel);

    await stub.fetch(new Request("https://do/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: message.event,
        data: message.data,
      }),
    }));

    // Call local handlers
    const handlers = this.localHandlers.get(channel);
    if (handlers) {
      for (const handler of handlers.values()) {
        try {
          await handler(message);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }

  async sendToSession<T = unknown>(
    _sessionId: string,
    _message: RealtimeMessage<T>
  ): Promise<boolean> {
    // For DO adapter, we send via the REST API to a specific user
    // This requires knowing which channel the session is in
    // For simplicity, we broadcast with target metadata
    return false;
  }

  async getSubscribers(channel: string): Promise<string[]> {
    const handlers = this.localHandlers.get(channel);
    return handlers ? Array.from(handlers.keys()) : [];
  }

  async setPresence<T = unknown>(
    _channel: string,
    _sessionId: string,
    _userId: string,
    _data: T
  ): Promise<void> {
    // Presence is managed via WebSocket messages in DO
    // This is a no-op for the adapter
  }

  async removePresence(_channel: string, _sessionId: string): Promise<void> {
    // Presence is managed via WebSocket messages in DO
  }

  async getPresence<T = unknown>(channel: string): Promise<PresenceUser<T>[]> {
    const stub = this.getChannelStub(channel);
    const response = await stub.fetch(new Request("https://do/presence"));
    return response.json();
  }

  async close(): Promise<void> {
    this.localHandlers.clear();
  }

  /**
   * Get channel info from Durable Object
   */
  async getChannelInfo(
    channel: string
  ): Promise<{ connections: number; presence: number }> {
    const stub = this.getChannelStub(channel);
    const response = await stub.fetch(new Request("https://do/info"));
    return response.json();
  }

  /**
   * Send message to specific user in a channel
   */
  async sendToUser<T = unknown>(
    channel: string,
    userId: string,
    event: string,
    data: T
  ): Promise<boolean> {
    const stub = this.getChannelStub(channel);

    const response = await stub.fetch(
      new Request("https://do/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, event, data }),
      })
    );

    const result = (await response.json()) as { sent: boolean };
    return result.sent;
  }
}

/**
 * Create Durable Objects adapter
 */
export function createDurableObjectsAdapter(
  options: DurableObjectsAdapterOptions
): DurableObjectsAdapter {
  return new DurableObjectsAdapter(options);
}
