/**
 * @module
 * Edge-compatible realtime for Pars.
 *
 * Supports multiple adapters:
 * - SSE (Server-Sent Events) - Works on all runtimes
 * - Durable Objects - Cloudflare Workers with WebSocket
 *
 * @example SSE Usage
 * ```typescript
 * import { createSSEAdapter, createSSERoutes } from '@parsrun/realtime';
 * import { Hono } from 'hono';
 *
 * const app = new Hono();
 * const sse = createSSEAdapter({ pingInterval: 30000 });
 *
 * // Mount realtime routes
 * app.route('/realtime', createSSERoutes(sse));
 *
 * // Broadcast from anywhere
 * await sse.publish('orders', createMessage({
 *   event: 'order:created',
 *   channel: 'orders',
 *   data: { orderId: '123' }
 * }));
 * ```
 *
 * @example Durable Objects Usage
 * ```typescript
 * import { RealtimeChannelDO, createDORoutes } from '@parsrun/realtime';
 * import { Hono } from 'hono';
 *
 * const app = new Hono();
 *
 * // Mount DO routes
 * app.route('/realtime', createDORoutes({
 *   namespaceBinding: 'REALTIME_CHANNELS'
 * }));
 *
 * // Export DO class for wrangler
 * export { RealtimeChannelDO };
 * ```
 *
 * @example Client-side SSE
 * ```typescript
 * const eventSource = new EventSource('/realtime/subscribe?channels=orders');
 *
 * eventSource.addEventListener('order:created', (e) => {
 *   const data = JSON.parse(e.data);
 *   console.log('New order:', data);
 * });
 * ```
 *
 * @example Client-side WebSocket (DO)
 * ```typescript
 * const ws = new WebSocket('wss://api.example.com/realtime/ws/orders');
 *
 * ws.onmessage = (e) => {
 *   const message = JSON.parse(e.data);
 *   console.log('Received:', message);
 * };
 *
 * // Join presence
 * ws.send(JSON.stringify({
 *   event: 'presence:join',
 *   data: { name: 'John', status: 'online' }
 * }));
 * ```
 */

// Re-export types
export * from "./types.js";

// Re-export adapters
export {
  SSEAdapter,
  createSSEAdapter,
} from "./adapters/sse.js";

export {
  DurableObjectsAdapter,
  RealtimeChannelDO,
  createDurableObjectsAdapter,
} from "./adapters/durable-objects.js";

// Import for default export
import { createSSEAdapter } from "./adapters/sse.js";
import { createDurableObjectsAdapter } from "./adapters/durable-objects.js";

// Re-export Hono integration
export {
  sseMiddleware,
  createSSEHandler,
  createSSERoutes,
  createDORoutes,
  broadcast,
  sendToUser,
  type RealtimeVariables,
  type SSERouteOptions,
  type DORouteOptions,
} from "./hono.js";

// Re-export core
export { ChannelImpl, createChannel } from "./core/channel.js";

// ============================================================================
// Factory Functions
// ============================================================================

import type { RealtimeAdapter, RealtimeConfig } from "./types.js";
import { SSEAdapter } from "./adapters/sse.js";
import { DurableObjectsAdapter } from "./adapters/durable-objects.js";

/**
 * Create a realtime adapter based on config
 */
export function createRealtimeAdapter(config: RealtimeConfig): RealtimeAdapter {
  switch (config.adapter) {
    case "sse":
      return new SSEAdapter(config.sse);

    case "durable-objects":
      if (!config.durableObjects) {
        throw new Error("durableObjects config required for durable-objects adapter");
      }
      return new DurableObjectsAdapter(config.durableObjects);

    case "memory":
      // Memory adapter uses SSE without ping
      return new SSEAdapter({ pingInterval: 0 });

    default:
      throw new Error(`Unknown adapter type: ${config.adapter}`);
  }
}

// Default export
export default {
  createRealtimeAdapter,
  createSSEAdapter,
  createDurableObjectsAdapter,
};
