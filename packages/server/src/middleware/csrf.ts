/**
 * @parsrun/server - CSRF Middleware
 * Cross-Site Request Forgery protection
 */

import type { HonoContext, HonoNext } from "../context.js";
import { ForbiddenError } from "./error-handler.js";

/**
 * CSRF options
 */
export interface CsrfOptions {
  /** Cookie name for CSRF token */
  cookieName?: string;
  /** Header name for CSRF token */
  headerName?: string;
  /** Methods that require CSRF validation */
  methods?: string[];
  /** Paths to exclude from CSRF protection */
  excludePaths?: string[];
  /** Skip CSRF for certain requests */
  skip?: (c: HonoContext) => boolean;
  /** Token generator */
  generateToken?: () => string;
  /** Cookie options */
  cookie?: {
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "strict" | "lax" | "none";
    path?: string;
    maxAge?: number;
  };
}

/**
 * Generate random token
 */
function generateRandomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get cookie value
 */
function getCookie(c: HonoContext, name: string): string | undefined {
  const cookieHeader = c.req.header("cookie");
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split("=");
    if (key === name) {
      return valueParts.join("=");
    }
  }
  return undefined;
}

/**
 * CSRF protection middleware
 *
 * @example
 * ```typescript
 * app.use('*', csrf({
 *   cookieName: '_csrf',
 *   headerName: 'X-CSRF-Token',
 *   methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
 *   cookie: {
 *     secure: true,
 *     sameSite: 'strict',
 *   },
 * }));
 *
 * // Get token in handler
 * app.get('/csrf-token', (c) => {
 *   return c.json({ token: c.get('csrfToken') });
 * });
 * ```
 */
export function csrf(options: CsrfOptions = {}) {
  const {
    cookieName = "_csrf",
    headerName = "x-csrf-token",
    methods = ["POST", "PUT", "PATCH", "DELETE"],
    excludePaths = [],
    skip,
    generateToken = generateRandomToken,
    cookie = {},
  } = options;

  const cookieOptions = {
    secure: cookie.secure ?? true,
    httpOnly: cookie.httpOnly ?? true,
    sameSite: cookie.sameSite ?? ("lax" as const),
    path: cookie.path ?? "/",
    maxAge: cookie.maxAge ?? 86400, // 24 hours
  };

  return async (c: HonoContext, next: HonoNext) => {
    // Skip if configured
    if (skip?.(c)) {
      return next();
    }

    // Skip excluded paths
    const path = c.req.path;
    if (excludePaths.some((p) => path.startsWith(p))) {
      return next();
    }

    // Get or create token
    let token = getCookie(c, cookieName);

    if (!token) {
      // Generate new token
      token = generateToken();

      // Set cookie
      const cookieValue = [
        `${cookieName}=${token}`,
        `Path=${cookieOptions.path}`,
        `Max-Age=${cookieOptions.maxAge}`,
        cookieOptions.sameSite && `SameSite=${cookieOptions.sameSite}`,
        cookieOptions.secure && "Secure",
        cookieOptions.httpOnly && "HttpOnly",
      ]
        .filter(Boolean)
        .join("; ");

      c.header("Set-Cookie", cookieValue);
    }

    // Store token in context for handlers
    (c as HonoContext & { csrfToken: string }).set("csrfToken" as never, token as never);

    // Validate token for protected methods
    if (methods.includes(c.req.method)) {
      const headerToken = c.req.header(headerName);
      const bodyToken = await getBodyToken(c);

      const providedToken = headerToken ?? bodyToken;

      if (!providedToken || providedToken !== token) {
        throw new ForbiddenError("Invalid CSRF token");
      }
    }

    await next();
  };
}

/**
 * Try to get CSRF token from request body
 */
async function getBodyToken(c: HonoContext): Promise<string | undefined> {
  try {
    const contentType = c.req.header("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await c.req.json()) as Record<string, unknown>;
      return (body["_csrf"] ?? body["csrfToken"] ?? body["csrf_token"]) as string | undefined;
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await c.req.parseBody();
      return body["_csrf"] as string | undefined;
    }
  } catch {
    // Ignore parsing errors
  }
  return undefined;
}

/**
 * Double Submit Cookie pattern
 * Generates a token and validates it matches between cookie and header
 */
export function doubleSubmitCookie(options: CsrfOptions = {}) {
  return csrf({
    ...options,
    cookie: {
      ...options.cookie,
      httpOnly: false, // Allow JS to read the cookie
    },
  });
}
