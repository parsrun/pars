/**
 * @parsrun/server - Rate Limit Middleware
 * Request throttling with multiple storage backends
 */

import type { HonoContext, HonoNext } from "../context.js";
import { RateLimitError } from "./error-handler.js";

/**
 * Rate limit storage interface
 */
export interface RateLimitStorage {
  /** Get current count for key */
  get(key: string): Promise<number>;
  /** Increment count and set expiry */
  increment(key: string, windowMs: number): Promise<number>;
  /** Reset count for key */
  reset(key: string): Promise<void>;
}

/**
 * In-memory rate limit storage
 * For single-instance deployments or development
 */
export class MemoryRateLimitStorage implements RateLimitStorage {
  private store = new Map<string, { count: number; expires: number }>();

  async get(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || entry.expires < Date.now()) {
      return 0;
    }
    return entry.count;
  }

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.expires < now) {
      // Start new window
      this.store.set(key, { count: 1, expires: now + windowMs });
      return 1;
    }

    // Increment existing
    entry.count++;
    return entry.count;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Clean up expired entries */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expires < now) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Rate limit options
 */
export interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs?: number;
  /** Maximum requests per window */
  max?: number;
  /** Generate key from request (default: IP address) */
  keyGenerator?: (c: HonoContext) => string;
  /** Skip rate limiting for certain requests */
  skip?: (c: HonoContext) => boolean;
  /** Custom storage backend */
  storage?: RateLimitStorage;
  /** Error message */
  message?: string;
  /** Include rate limit headers */
  headers?: boolean;
  /** Handler when limit is exceeded */
  onLimitReached?: (c: HonoContext, key: string) => void;
}

// Global default storage
let defaultStorage: RateLimitStorage | null = null;

/**
 * Get or create default memory storage
 */
function getDefaultStorage(): RateLimitStorage {
  if (!defaultStorage) {
    defaultStorage = new MemoryRateLimitStorage();
  }
  return defaultStorage;
}

/**
 * Rate limit middleware
 *
 * @example
 * ```typescript
 * // Basic usage - 100 requests per minute
 * app.use('/api/*', rateLimit({
 *   windowMs: 60 * 1000,
 *   max: 100,
 * }));
 *
 * // Per-user rate limiting
 * app.use('/api/*', rateLimit({
 *   keyGenerator: (c) => c.get('user')?.id ?? getIP(c),
 *   max: 1000,
 * }));
 *
 * // Strict limit for auth endpoints
 * app.use('/api/auth/*', rateLimit({
 *   windowMs: 15 * 60 * 1000, // 15 minutes
 *   max: 5,
 *   message: 'Too many login attempts',
 * }));
 * ```
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100,
    keyGenerator = defaultKeyGenerator,
    skip,
    storage = getDefaultStorage(),
    message = "Too many requests, please try again later",
    headers = true,
    onLimitReached,
  } = options;

  return async (c: HonoContext, next: HonoNext) => {
    // Skip if configured
    if (skip?.(c)) {
      return next();
    }

    const key = `ratelimit:${keyGenerator(c)}`;
    const current = await storage.increment(key, windowMs);

    // Set rate limit headers
    if (headers) {
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", String(Math.max(0, max - current)));
      c.header("X-RateLimit-Reset", String(Math.ceil((Date.now() + windowMs) / 1000)));
    }

    // Check if limit exceeded
    if (current > max) {
      if (onLimitReached) {
        onLimitReached(c, key);
      }

      const retryAfter = Math.ceil(windowMs / 1000);
      c.header("Retry-After", String(retryAfter));

      throw new RateLimitError(message, retryAfter);
    }

    await next();
  };
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(c: HonoContext): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    c.req.header("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Create rate limiter for specific routes
 *
 * @example
 * ```typescript
 * const apiLimiter = createRateLimiter({
 *   windowMs: 60000,
 *   max: 100,
 * });
 *
 * app.use('/api/*', apiLimiter.middleware);
 *
 * // Reset limit for a user after successful auth
 * await apiLimiter.reset('user:123');
 * ```
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const storage = options.storage ?? getDefaultStorage();

  return {
    middleware: rateLimit({ ...options, storage }),
    storage,
    reset: (key: string) => storage.reset(`ratelimit:${key}`),
    get: (key: string) => storage.get(`ratelimit:${key}`),
  };
}
