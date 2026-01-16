/**
 * @parsrun/server - CORS Middleware
 * Cross-Origin Resource Sharing configuration
 */

import type { HonoContext, HonoNext, CorsConfig } from "../context.js";

/**
 * Default CORS configuration
 */
const defaultCorsConfig: CorsConfig = {
  origin: "*",
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-CSRF-Token"],
  exposedHeaders: ["X-Request-ID", "X-Total-Count"],
  maxAge: 86400, // 24 hours
};

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string, config: CorsConfig): boolean {
  if (config.origin === "*") return true;

  if (typeof config.origin === "string") {
    return origin === config.origin;
  }

  if (Array.isArray(config.origin)) {
    return config.origin.includes(origin);
  }

  if (typeof config.origin === "function") {
    return config.origin(origin);
  }

  return false;
}

/**
 * CORS middleware
 *
 * @example
 * ```typescript
 * app.use('*', cors({
 *   origin: ['https://example.com', 'https://app.example.com'],
 *   credentials: true,
 * }));
 * ```
 */
export function cors(config?: Partial<CorsConfig>): (c: HonoContext, next: HonoNext) => Promise<Response | void> {
  const corsConfig = { ...defaultCorsConfig, ...config };

  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const origin = c.req.header("origin") ?? "";

    // Handle preflight requests
    if (c.req.method === "OPTIONS") {
      const response = new Response(null, { status: 204 });

      if (isOriginAllowed(origin, corsConfig)) {
        response.headers.set("Access-Control-Allow-Origin", origin || "*");
      }

      if (corsConfig.credentials) {
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }

      if (corsConfig.methods) {
        response.headers.set(
          "Access-Control-Allow-Methods",
          corsConfig.methods.join(", ")
        );
      }

      if (corsConfig.allowedHeaders) {
        response.headers.set(
          "Access-Control-Allow-Headers",
          corsConfig.allowedHeaders.join(", ")
        );
      }

      if (corsConfig.maxAge) {
        response.headers.set("Access-Control-Max-Age", String(corsConfig.maxAge));
      }

      return response;
    }

    // Handle actual requests
    await next();

    // Add CORS headers to response
    if (isOriginAllowed(origin, corsConfig)) {
      c.header("Access-Control-Allow-Origin", origin || "*");
    }

    if (corsConfig.credentials) {
      c.header("Access-Control-Allow-Credentials", "true");
    }

    if (corsConfig.exposedHeaders) {
      c.header("Access-Control-Expose-Headers", corsConfig.exposedHeaders.join(", "));
    }
  };
}
