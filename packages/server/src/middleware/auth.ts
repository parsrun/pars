/**
 * @parsrun/server - Auth Middleware
 * JWT authentication middleware
 */

import type { HonoContext, HonoNext, ContextUser } from "../context.js";
import { UnauthorizedError } from "./error-handler.js";

/**
 * JWT payload structure
 */
export interface JwtPayload {
  sub: string; // User ID
  email?: string;
  tenantId?: string;
  role?: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
  jti?: string;
}

/**
 * JWT verification function type
 */
export type JwtVerifier = (token: string) => Promise<JwtPayload | null>;

/**
 * Auth middleware options
 */
export interface AuthMiddlewareOptions {
  /** JWT verification function */
  verify: JwtVerifier;
  /** Header name for token (default: Authorization) */
  header?: string;
  /** Token prefix (default: Bearer) */
  prefix?: string;
  /** Cookie name for token (alternative to header) */
  cookie?: string;
  /** Skip auth for certain requests */
  skip?: (c: HonoContext) => boolean;
  /** Custom error message */
  message?: string;
}

/**
 * Extract token from request
 */
function extractToken(
  c: HonoContext,
  header: string,
  prefix: string,
  cookie?: string
): string | null {
  // Try header first
  const authHeader = c.req.header(header);
  if (authHeader) {
    if (prefix && authHeader.startsWith(`${prefix} `)) {
      return authHeader.slice(prefix.length + 1);
    }
    return authHeader;
  }

  // Try cookie
  if (cookie) {
    const cookieHeader = c.req.header("cookie");
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").map((c) => c.trim());
      for (const c of cookies) {
        const [key, ...valueParts] = c.split("=");
        if (key === cookie) {
          return valueParts.join("=");
        }
      }
    }
  }

  return null;
}

/**
 * Auth middleware - requires valid JWT
 *
 * @example
 * ```typescript
 * import { verifyJwt } from '@parsrun/auth';
 *
 * const authMiddleware = auth({
 *   verify: (token) => verifyJwt(token, secret),
 *   cookie: 'auth_token',
 * });
 *
 * app.use('/api/*', authMiddleware);
 *
 * // Access user in handlers
 * app.get('/api/me', (c) => {
 *   const user = c.get('user');
 *   return c.json({ user });
 * });
 * ```
 */
export function auth(options: AuthMiddlewareOptions) {
  const {
    verify,
    header = "authorization",
    prefix = "Bearer",
    cookie,
    skip,
    message = "Authentication required",
  } = options;

  return async (c: HonoContext, next: HonoNext) => {
    // Skip if configured
    if (skip?.(c)) {
      return next();
    }

    // Extract token
    const token = extractToken(c, header, prefix, cookie);

    if (!token) {
      throw new UnauthorizedError(message);
    }

    // Verify token
    const payload = await verify(token);

    if (!payload) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    // Set user in context
    const user: ContextUser = {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: payload.role,
      permissions: payload.permissions ?? [],
    };

    c.set("user", user);

    await next();
  };
}

/**
 * Optional auth middleware - sets user if token present, but doesn't require it
 *
 * @example
 * ```typescript
 * app.use('/api/public/*', optionalAuth({
 *   verify: (token) => verifyJwt(token, secret),
 * }));
 *
 * // User may or may not be present
 * app.get('/api/public/items', (c) => {
 *   const user = c.get('user'); // may be undefined
 *   // Return different data based on auth status
 * });
 * ```
 */
export function optionalAuth(options: Omit<AuthMiddlewareOptions, "message">) {
  const { verify, header = "authorization", prefix = "Bearer", cookie, skip } = options;

  return async (c: HonoContext, next: HonoNext) => {
    // Skip if configured
    if (skip?.(c)) {
      return next();
    }

    // Extract token
    const token = extractToken(c, header, prefix, cookie);

    if (token) {
      try {
        const payload = await verify(token);

        if (payload) {
          // Set user in context
          const user: ContextUser = {
            id: payload.sub,
            email: payload.email,
            tenantId: payload.tenantId,
            role: payload.role,
            permissions: payload.permissions ?? [],
          };

          c.set("user", user);
        }
      } catch {
        // Ignore verification errors for optional auth
      }
    }

    await next();
  };
}

/**
 * Create auth middleware from verifier function
 *
 * @example
 * ```typescript
 * const { auth, optionalAuth } = createAuthMiddleware({
 *   verify: async (token) => {
 *     return verifyJwt(token, process.env.JWT_SECRET);
 *   },
 *   cookie: 'session',
 * });
 *
 * app.use('/api/*', auth);
 * app.use('/public/*', optionalAuth);
 * ```
 */
export function createAuthMiddleware(
  baseOptions: Omit<AuthMiddlewareOptions, "skip" | "message">
) {
  return {
    auth: (options?: Partial<AuthMiddlewareOptions>) =>
      auth({ ...baseOptions, ...options }),
    optionalAuth: (options?: Partial<Omit<AuthMiddlewareOptions, "message">>) =>
      optionalAuth({ ...baseOptions, ...options }),
  };
}
