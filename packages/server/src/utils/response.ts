/**
 * @parsrun/server - Response Utilities
 * Helpers for API responses
 */

import type { HonoContext, ApiResponse } from "../context.js";
import { success, error } from "../context.js";

/**
 * Send JSON success response
 *
 * @example
 * ```typescript
 * app.get('/users/:id', async (c) => {
 *   const user = await getUser(c.req.param('id'));
 *   return json(c, user);
 * });
 * ```
 */
export function json<T>(c: HonoContext, data: T, status = 200): Response {
  return c.json(success(data), status as 200);
}

/**
 * Send JSON success response with metadata
 *
 * @example
 * ```typescript
 * app.get('/users', async (c) => {
 *   const { users, total } = await getUsers();
 *   return jsonWithMeta(c, users, { total, page: 1, limit: 20 });
 * });
 * ```
 */
export function jsonWithMeta<T>(
  c: HonoContext,
  data: T,
  meta: ApiResponse["meta"],
  status = 200
): Response {
  return c.json(success(data, meta), status as 200);
}

/**
 * Send JSON error response
 *
 * @example
 * ```typescript
 * app.get('/users/:id', async (c) => {
 *   const user = await getUser(c.req.param('id'));
 *   if (!user) {
 *     return jsonError(c, 'USER_NOT_FOUND', 'User not found', 404);
 *   }
 *   return json(c, user);
 * });
 * ```
 */
export function jsonError(
  c: HonoContext,
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>
): Response {
  return c.json(error(code, message, details), status as 400);
}

/**
 * Send created response (201)
 */
export function created<T>(c: HonoContext, data: T, location?: string): Response {
  if (location) {
    c.header("Location", location);
  }
  return c.json(success(data), 201);
}

/**
 * Send no content response (204)
 */
export function noContent(_c: HonoContext): Response {
  return new Response(null, { status: 204 });
}

/**
 * Send accepted response (202) - for async operations
 */
export function accepted<T>(c: HonoContext, data?: T): Response {
  if (data) {
    return c.json(success(data), 202);
  }
  return new Response(null, { status: 202 });
}

/**
 * Redirect response
 */
export function redirect(c: HonoContext, url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
  return c.redirect(url, status);
}

/**
 * Stream response helper
 *
 * @example
 * ```typescript
 * app.get('/stream', (c) => {
 *   return stream(c, async (write) => {
 *     for (let i = 0; i < 10; i++) {
 *       await write(`data: ${i}\n\n`);
 *       await new Promise(r => setTimeout(r, 1000));
 *     }
 *   });
 * });
 * ```
 */
export function stream(
  _c: HonoContext,
  callback: (write: (chunk: string) => Promise<void>) => Promise<void>,
  options: {
    contentType?: string;
    headers?: Record<string, string>;
  } = {}
): Response {
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      const write = async (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      try {
        await callback(write);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": options.contentType ?? "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...options.headers,
    },
  });
}

/**
 * Server-Sent Events helper
 *
 * @example
 * ```typescript
 * app.get('/events', (c) => {
 *   return sse(c, async (send) => {
 *     for await (const event of eventStream) {
 *       await send({ event: 'update', data: event });
 *     }
 *   });
 * });
 * ```
 */
export function sse(
  c: HonoContext,
  callback: (
    send: (event: { event?: string; data: unknown; id?: string; retry?: number }) => Promise<void>
  ) => Promise<void>
): Response {
  return stream(c, async (write) => {
    const send = async (event: { event?: string; data: unknown; id?: string; retry?: number }) => {
      let message = "";

      if (event.id) {
        message += `id: ${event.id}\n`;
      }

      if (event.event) {
        message += `event: ${event.event}\n`;
      }

      if (event.retry) {
        message += `retry: ${event.retry}\n`;
      }

      const data = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
      message += `data: ${data}\n\n`;

      await write(message);
    };

    await callback(send);
  });
}

/**
 * File download response
 */
export function download(
  c: HonoContext,
  data: Uint8Array | ArrayBuffer | string,
  filename: string,
  contentType = "application/octet-stream"
): Response {
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("Content-Type", contentType);

  if (typeof data === "string") {
    return c.body(data);
  }

  return new Response(data, {
    headers: c.res.headers,
  });
}
