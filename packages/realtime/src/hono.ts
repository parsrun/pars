/**
 * @parsrun/realtime - Hono Integration
 * Middleware and routes for Hono framework
 */

import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { SSEAdapter } from "./adapters/sse.js";
import type {
  RealtimeAdapter,
  SSEAdapterOptions,
} from "./types.js";
import { createMessage } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Hono realtime context variables
 */
export interface RealtimeVariables {
  realtime: {
    adapter: RealtimeAdapter;
    sessionId: string;
    userId: string | undefined;
  };
}

/**
 * SSE route options
 */
export interface SSERouteOptions {
  /** Get session ID from context (default: query param or random) */
  getSessionId?: (c: Context) => string;
  /** Get user ID from context (default: from auth) */
  getUserId?: (c: Context) => string | undefined;
  /** Channels the user can subscribe to */
  getChannels?: (c: Context) => string[];
  /** Called when connection opens */
  onConnect?: (c: Context, sessionId: string) => void | Promise<void>;
  /** Called when connection closes */
  onDisconnect?: (c: Context, sessionId: string) => void | Promise<void>;
}

/**
 * Durable Objects route options
 */
export interface DORouteOptions {
  /** Durable Object namespace binding name */
  namespaceBinding: string;
  /** Channel prefix */
  channelPrefix?: string;
  /** Authorize connection */
  authorize?: (c: Context, channel: string) => boolean | Promise<boolean>;
}

// ============================================================================
// SSE Middleware and Routes
// ============================================================================

/**
 * Create SSE realtime middleware
 * Adds SSE adapter to context
 */
export function sseMiddleware(
  options?: SSEAdapterOptions
): MiddlewareHandler<{ Variables: RealtimeVariables }> {
  const adapter = new SSEAdapter(options);

  return async (c, next) => {
    const sessionId = c.req.query("sessionId") || crypto.randomUUID();
    // Get userId from context if set by auth middleware (type-safe access)
    const vars = c.var as Record<string, unknown>;
    const userId = typeof vars["userId"] === "string" ? vars["userId"] : undefined;

    c.set("realtime", {
      adapter,
      sessionId,
      userId,
    });

    await next();
  };
}

/**
 * Create SSE subscription endpoint
 * Client connects to this endpoint to receive events
 */
export function createSSEHandler(
  adapter: SSEAdapter,
  options: SSERouteOptions = {}
): (c: Context) => Response | Promise<Response> {
  return async (c: Context) => {
    const sessionId = options.getSessionId?.(c) ||
      c.req.query("sessionId") ||
      crypto.randomUUID();

    const vars = c.var as Record<string, unknown>;
    const userId = options.getUserId?.(c) ||
      (typeof vars["userId"] === "string" ? vars["userId"] : undefined);

    const channels = options.getChannels?.(c) ||
      c.req.query("channels")?.split(",") ||
      [];

    // Create SSE connection
    const { response } = adapter.createConnection(sessionId, userId);

    // Subscribe to requested channels
    for (const channel of channels) {
      await adapter.subscribe(channel, sessionId, () => {
        // Handler is called but SSE sends via connection.writer
      });
    }

    // Call onConnect callback
    if (options.onConnect) {
      await options.onConnect(c, sessionId);
    }

    // Handle connection close
    c.req.raw.signal.addEventListener("abort", async () => {
      await adapter.closeConnection(sessionId);
      if (options.onDisconnect) {
        await options.onDisconnect(c, sessionId);
      }
    });

    return response;
  };
}

/**
 * Create complete SSE routes for Hono
 */
export function createSSERoutes(
  adapter: SSEAdapter,
  options: SSERouteOptions = {}
): Hono {
  const app = new Hono();

  // SSE subscription endpoint
  app.get("/subscribe", createSSEHandler(adapter, options));

  // Subscribe to additional channel
  app.post("/subscribe/:channel", async (c) => {
    const channel = c.req.param("channel");
    const sessionId = c.req.query("sessionId");

    if (!sessionId) {
      return c.json({ error: "sessionId required" }, 400);
    }

    const connection = adapter.getConnection(sessionId);
    if (!connection) {
      return c.json({ error: "Connection not found" }, 404);
    }

    await adapter.subscribe(channel, sessionId, () => {});

    return c.json({ success: true, channel });
  });

  // Unsubscribe from channel
  app.post("/unsubscribe/:channel", async (c) => {
    const channel = c.req.param("channel");
    const sessionId = c.req.query("sessionId");

    if (!sessionId) {
      return c.json({ error: "sessionId required" }, 400);
    }

    await adapter.unsubscribe(channel, sessionId);

    return c.json({ success: true, channel });
  });

  // Broadcast to channel
  app.post("/broadcast/:channel", async (c) => {
    const channel = c.req.param("channel");
    const body = await c.req.json<{ event: string; data: unknown }>();

    const message = createMessage({
      event: body.event,
      channel,
      data: body.data,
    });

    await adapter.publish(channel, message);

    return c.json({ success: true });
  });

  // Get channel presence
  app.get("/presence/:channel", async (c) => {
    const channel = c.req.param("channel");
    const presence = await adapter.getPresence(channel);
    return c.json(presence);
  });

  // Set presence
  app.post("/presence/:channel", async (c) => {
    const channel = c.req.param("channel");
    const sessionId = c.req.query("sessionId");
    const userId = c.req.query("userId") || sessionId;
    const data = await c.req.json();

    if (!sessionId) {
      return c.json({ error: "sessionId required" }, 400);
    }

    await adapter.setPresence(channel, sessionId, userId!, data);

    return c.json({ success: true });
  });

  // Remove presence
  app.delete("/presence/:channel", async (c) => {
    const channel = c.req.param("channel");
    const sessionId = c.req.query("sessionId");

    if (!sessionId) {
      return c.json({ error: "sessionId required" }, 400);
    }

    await adapter.removePresence(channel, sessionId);

    return c.json({ success: true });
  });

  // Get stats
  app.get("/stats", (c) => {
    return c.json(adapter.getStats());
  });

  return app;
}

// ============================================================================
// Durable Objects Routes
// ============================================================================

/**
 * Create Durable Objects realtime routes for Hono
 * Proxies requests to the appropriate Durable Object
 */
export function createDORoutes(options: DORouteOptions): Hono {
  const app = new Hono();
  const prefix = options.channelPrefix ?? "channel:";

  // WebSocket upgrade handler
  app.get("/ws/:channel", async (c) => {
    const channel = c.req.param("channel");

    // Authorization check
    if (options.authorize) {
      const authorized = await options.authorize(c, channel);
      if (!authorized) {
        return c.json({ error: "Unauthorized" }, 403);
      }
    }

    // Get Durable Object namespace from env
    const env = c.env as Record<string, unknown>;
    const namespace = env[options.namespaceBinding] as DurableObjectNamespace;

    if (!namespace) {
      return c.json(
        { error: `Namespace ${options.namespaceBinding} not found` },
        500
      );
    }

    // Get Durable Object stub
    const id = namespace.idFromName(`${prefix}${channel}`);
    const stub = namespace.get(id);

    // Forward the request to the Durable Object
    const url = new URL(c.req.url);
    url.pathname = `/ws/${channel}`;

    return stub.fetch(new Request(url.toString(), c.req.raw));
  });

  // Broadcast to channel
  app.post("/broadcast/:channel", async (c) => {
    const channel = c.req.param("channel");

    const env = c.env as Record<string, unknown>;
    const namespace = env[options.namespaceBinding] as DurableObjectNamespace;

    if (!namespace) {
      return c.json(
        { error: `Namespace ${options.namespaceBinding} not found` },
        500
      );
    }

    const id = namespace.idFromName(`${prefix}${channel}`);
    const stub = namespace.get(id);

    const body = await c.req.json();

    const response = await stub.fetch(
      new Request("https://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  });

  // Get channel presence
  app.get("/presence/:channel", async (c) => {
    const channel = c.req.param("channel");

    const env = c.env as Record<string, unknown>;
    const namespace = env[options.namespaceBinding] as DurableObjectNamespace;

    if (!namespace) {
      return c.json(
        { error: `Namespace ${options.namespaceBinding} not found` },
        500
      );
    }

    const id = namespace.idFromName(`${prefix}${channel}`);
    const stub = namespace.get(id);

    const response = await stub.fetch(new Request("https://do/presence"));

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  });

  // Get channel info
  app.get("/info/:channel", async (c) => {
    const channel = c.req.param("channel");

    const env = c.env as Record<string, unknown>;
    const namespace = env[options.namespaceBinding] as DurableObjectNamespace;

    if (!namespace) {
      return c.json(
        { error: `Namespace ${options.namespaceBinding} not found` },
        500
      );
    }

    const id = namespace.idFromName(`${prefix}${channel}`);
    const stub = namespace.get(id);

    const response = await stub.fetch(new Request("https://do/info"));

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  });

  return app;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Broadcast helper for use in route handlers
 */
export async function broadcast(
  adapter: RealtimeAdapter,
  channel: string,
  event: string,
  data: unknown
): Promise<void> {
  const message = createMessage({ event, channel, data });
  await adapter.publish(channel, message);
}

/**
 * Send to user helper
 */
export async function sendToUser(
  adapter: RealtimeAdapter,
  channel: string,
  userId: string,
  event: string,
  data: unknown
): Promise<void> {
  const presence = await adapter.getPresence(channel);
  const userSessions = presence.filter((p) => p.userId === userId);

  const message = createMessage({ event, channel, data });

  for (const session of userSessions) {
    await adapter.sendToSession(session.sessionId, message);
  }
}
