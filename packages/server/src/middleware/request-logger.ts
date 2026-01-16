/**
 * @parsrun/server - Request Logger Middleware
 * HTTP request/response logging
 */

import type { HonoContext, HonoNext } from "../context.js";

/**
 * Request logger options
 */
export interface RequestLoggerOptions {
  /** Skip logging for certain paths */
  skip?: (c: HonoContext) => boolean;
  /** Custom log format */
  format?: "json" | "combined" | "short";
  /** Include request body in logs */
  includeBody?: boolean;
  /** Include response body in logs (be careful with large responses) */
  includeResponseBody?: boolean;
  /** Maximum body length to log */
  maxBodyLength?: number;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Request logger middleware
 *
 * @example
 * ```typescript
 * app.use('*', requestLogger({
 *   skip: (c) => c.req.path === '/health',
 *   format: 'json',
 * }));
 * ```
 */
export function requestLogger(options: RequestLoggerOptions = {}) {
  const {
    skip,
    format = "json",
    includeBody = false,
    maxBodyLength = 1000,
  } = options;

  return async (c: HonoContext, next: HonoNext) => {
    // Skip if configured
    if (skip?.(c)) {
      return next();
    }

    const start = Date.now();
    const logger = c.get("logger");
    const requestId = c.get("requestId");

    // Request info
    const method = c.req.method;
    const path = c.req.path;
    const query = c.req.query();
    const userAgent = c.req.header("user-agent");
    const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";

    // Log request start
    if (format === "json") {
      logger?.debug("Request started", {
        requestId,
        method,
        path,
        query: Object.keys(query).length > 0 ? query : undefined,
        ip,
        userAgent,
      });
    }

    // Get body if needed
    let requestBody: string | undefined;
    if (includeBody && ["POST", "PUT", "PATCH"].includes(method)) {
      try {
        const contentType = c.req.header("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const body = await c.req.text();
          requestBody = body.length > maxBodyLength
            ? body.substring(0, maxBodyLength) + "..."
            : body;
        }
      } catch {
        // Ignore body parsing errors
      }
    }

    // Process request
    await next();

    // Calculate duration
    const duration = Date.now() - start;
    const status = c.res.status;

    // Get response size
    const contentLength = c.res.headers.get("content-length");
    const size = contentLength ? parseInt(contentLength, 10) : 0;

    // Log based on format
    if (format === "json") {
      const logData: Record<string, unknown> = {
        requestId,
        method,
        path,
        status,
        duration: `${duration}ms`,
        size: formatBytes(size),
      };

      if (requestBody) {
        logData["requestBody"] = requestBody;
      }

      // Use appropriate log level
      if (status >= 500) {
        logger?.error("Request completed", logData);
      } else if (status >= 400) {
        logger?.warn("Request completed", logData);
      } else {
        logger?.info("Request completed", logData);
      }
    } else if (format === "combined") {
      // Apache combined log format
      const log = `${ip} - - [${new Date().toISOString()}] "${method} ${path}" ${status} ${size} "-" "${userAgent}" ${duration}ms`;
      console.log(log);
    } else {
      // Short format
      const log = `${method} ${path} ${status} ${duration}ms`;
      console.log(log);
    }
  };
}
