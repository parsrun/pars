/**
 * Rate Limiting
 * Uses KVStorage interface for multi-runtime support
 */

import type { KVStorage } from '../storage/types.js';
import { StorageKeys } from '../storage/index.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Time window in seconds */
  windowSeconds: number;
  /** Max requests per window */
  maxRequests: number;
  /** Key prefix for rate limit entries */
  keyPrefix?: string;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** When the window resets */
  resetAt: Date;
  /** Milliseconds until retry is allowed (if not allowed) */
  retryAfterMs?: number;
}

/**
 * Rate limit record stored in KV
 */
interface RateLimitRecord {
  count: number;
  windowStart: string;
}

/**
 * Rate Limiter using KVStorage
 */
export class RateLimiter {
  private storage: KVStorage;
  private config: Required<RateLimitConfig>;

  constructor(storage: KVStorage, config: RateLimitConfig) {
    this.storage = storage;
    this.config = {
      keyPrefix: '',
      ...config,
    };
  }

  /**
   * Get storage key for rate limit entry
   */
  private getKey(identifier: string): string {
    return StorageKeys.rateLimit(`${this.config.keyPrefix}${identifier}`);
  }

  /**
   * Check and consume rate limit
   */
  async check(identifier: string): Promise<RateLimitResult> {
    const key = this.getKey(identifier);
    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;

    // Get existing record
    const record = await this.storage.get<RateLimitRecord>(key);

    let count: number;
    let windowStart: number;

    if (record) {
      windowStart = new Date(record.windowStart).getTime();
      const windowEnd = windowStart + windowMs;

      if (now > windowEnd) {
        // Window expired, start new one
        count = 1;
        windowStart = now;
      } else {
        // Increment within window
        count = record.count + 1;
      }
    } else {
      // No record, start new window
      count = 1;
      windowStart = now;
    }

    const resetAt = new Date(windowStart + windowMs);
    const remaining = Math.max(0, this.config.maxRequests - count);
    const allowed = count <= this.config.maxRequests;

    // Update storage
    const ttl = Math.ceil((resetAt.getTime() - now) / 1000);
    if (ttl > 0) {
      await this.storage.set<RateLimitRecord>(
        key,
        {
          count,
          windowStart: new Date(windowStart).toISOString(),
        },
        ttl
      );
    }

    return {
      allowed,
      remaining,
      resetAt,
      retryAfterMs: allowed ? undefined : resetAt.getTime() - now,
    };
  }

  /**
   * Get current rate limit status without consuming
   */
  async status(identifier: string): Promise<RateLimitResult | null> {
    const key = this.getKey(identifier);
    const record = await this.storage.get<RateLimitRecord>(key);

    if (!record) {
      return null;
    }

    const now = Date.now();
    const windowMs = this.config.windowSeconds * 1000;
    const windowStart = new Date(record.windowStart).getTime();
    const windowEnd = windowStart + windowMs;

    if (now > windowEnd) {
      return null; // Window expired
    }

    const remaining = Math.max(0, this.config.maxRequests - record.count);
    const allowed = record.count < this.config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt: new Date(windowEnd),
      retryAfterMs: allowed ? undefined : windowEnd - now,
    };
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = this.getKey(identifier);
    await this.storage.delete(key);
  }

  /**
   * Check rate limit without consuming (peek)
   */
  async peek(identifier: string): Promise<RateLimitResult> {
    const status = await this.status(identifier);
    if (!status) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: new Date(Date.now() + this.config.windowSeconds * 1000),
      };
    }
    return status;
  }
}

/**
 * Create a rate limiter
 */
export function createRateLimiter(
  storage: KVStorage,
  config: RateLimitConfig
): RateLimiter {
  return new RateLimiter(storage, config);
}

/**
 * Common rate limit configurations
 */
export const RateLimitPresets = {
  /** Login attempts: 5 per 15 minutes */
  login: {
    windowSeconds: 15 * 60,
    maxRequests: 5,
    keyPrefix: 'login:',
  },

  /** OTP requests: 5 per 15 minutes */
  otp: {
    windowSeconds: 15 * 60,
    maxRequests: 5,
    keyPrefix: 'otp:',
  },

  /** Magic link requests: 3 per 10 minutes */
  magicLink: {
    windowSeconds: 10 * 60,
    maxRequests: 3,
    keyPrefix: 'magic:',
  },

  /** Password reset: 3 per hour */
  passwordReset: {
    windowSeconds: 60 * 60,
    maxRequests: 3,
    keyPrefix: 'pwreset:',
  },

  /** API general: 100 per minute */
  api: {
    windowSeconds: 60,
    maxRequests: 100,
    keyPrefix: 'api:',
  },

  /** Registration: 5 per hour per IP */
  registration: {
    windowSeconds: 60 * 60,
    maxRequests: 5,
    keyPrefix: 'register:',
  },

  /** 2FA attempts: 5 per 5 minutes */
  twoFactor: {
    windowSeconds: 5 * 60,
    maxRequests: 5,
    keyPrefix: '2fa:',
  },
} as const;
