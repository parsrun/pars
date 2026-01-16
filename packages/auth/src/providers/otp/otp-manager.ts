/**
 * OTP Manager
 * Handles OTP generation, storage, and verification
 * Uses KVStorage interface for multi-runtime support
 */

import type { KVStorage } from '../../storage/types.js';
import { StorageKeys } from '../../storage/index.js';

/**
 * OTP configuration
 */
export interface OTPConfig {
  /** OTP code length (default: 6) */
  length?: number;
  /** OTP expiry in seconds (default: 600 = 10 minutes) */
  expiresIn?: number;
  /** Maximum verification attempts (default: 3) */
  maxAttempts?: number;
  /** Rate limit: max requests per window (default: 5) */
  rateLimit?: number;
  /** Rate limit window in seconds (default: 900 = 15 minutes) */
  rateLimitWindow?: number;
}

/**
 * OTP record stored in KV
 */
export interface OTPRecord {
  /** OTP code */
  code: string;
  /** Target identifier (email/phone) */
  identifier: string;
  /** OTP type */
  type: 'email' | 'sms';
  /** Expiry timestamp (ISO string) */
  expiresAt: string;
  /** Failed verification attempts */
  attempts: number;
  /** Maximum allowed attempts */
  maxAttempts: number;
  /** Creation timestamp (ISO string) */
  createdAt: string;
  /** Tenant ID (for multi-tenant) */
  tenantId?: string;
}

/**
 * Rate limit record
 */
interface RateLimitRecord {
  count: number;
  windowStart: string;
}

/**
 * OTP storage result
 */
export interface StoreOTPResult {
  success: boolean;
  code?: string;
  expiresAt?: Date;
  error?: string;
  remainingRequests?: number;
}

/**
 * OTP verification result
 */
export interface VerifyOTPResult {
  success: boolean;
  message: string;
  attemptsLeft?: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitCheck {
  allowed: boolean;
  remainingRequests: number;
  resetAt: Date;
  message?: string;
}

/**
 * Generate cryptographically secure random integer
 */
function secureRandomInt(min: number, max: number): number {
  const range = max - min;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range - 1;

  let randomValue: number;
  const randomBytes = new Uint8Array(bytesNeeded);

  do {
    crypto.getRandomValues(randomBytes);
    randomValue = randomBytes.reduce((acc, byte, i) => acc + byte * 256 ** i, 0);
  } while (randomValue > maxValid);

  return min + (randomValue % range);
}

/**
 * OTP Manager class
 */
export class OTPManager {
  private storage: KVStorage;
  private config: Required<OTPConfig>;

  constructor(storage: KVStorage, config?: OTPConfig) {
    this.storage = storage;
    this.config = {
      length: config?.length ?? 6,
      expiresIn: config?.expiresIn ?? 600,
      maxAttempts: config?.maxAttempts ?? 3,
      rateLimit: config?.rateLimit ?? 5,
      rateLimitWindow: config?.rateLimitWindow ?? 900,
    };
  }

  /**
   * Generate OTP code
   */
  generateCode(length?: number): string {
    const len = length ?? this.config.length;
    const min = Math.pow(10, len - 1);
    const max = Math.pow(10, len) - 1;
    return secureRandomInt(min, max + 1).toString().padStart(len, '0');
  }

  /**
   * Get storage key for OTP
   */
  private getOTPKey(identifier: string, type: 'email' | 'sms'): string {
    const normalizedId = type === 'email' ? identifier.toLowerCase() : identifier;
    return StorageKeys.otp(normalizedId, type);
  }

  /**
   * Get storage key for rate limiting
   */
  private getRateLimitKey(identifier: string, type: 'email' | 'sms'): string {
    const normalizedId = type === 'email' ? identifier.toLowerCase() : identifier;
    return StorageKeys.rateLimit(`otp:${type}:${normalizedId}`);
  }

  /**
   * Check rate limit for OTP requests
   */
  async checkRateLimit(
    identifier: string,
    type: 'email' | 'sms'
  ): Promise<RateLimitCheck> {
    const key = this.getRateLimitKey(identifier, type);
    const record = await this.storage.get<RateLimitRecord>(key);

    const now = Date.now();
    const windowStart = record?.windowStart
      ? new Date(record.windowStart).getTime()
      : now;
    const windowEnd = windowStart + this.config.rateLimitWindow * 1000;

    // Window expired, reset
    if (now > windowEnd) {
      return {
        allowed: true,
        remainingRequests: this.config.rateLimit - 1,
        resetAt: new Date(now + this.config.rateLimitWindow * 1000),
      };
    }

    const currentCount = record?.count ?? 0;

    if (currentCount >= this.config.rateLimit) {
      const resetAt = new Date(windowEnd);
      const minutesLeft = Math.ceil((windowEnd - now) / 60000);
      return {
        allowed: false,
        remainingRequests: 0,
        resetAt,
        message: `Too many OTP requests. Please try again in ${minutesLeft} minutes.`,
      };
    }

    return {
      allowed: true,
      remainingRequests: this.config.rateLimit - currentCount - 1,
      resetAt: new Date(windowEnd),
    };
  }

  /**
   * Increment rate limit counter
   */
  private async incrementRateLimit(
    identifier: string,
    type: 'email' | 'sms'
  ): Promise<void> {
    const key = this.getRateLimitKey(identifier, type);
    const record = await this.storage.get<RateLimitRecord>(key);

    const now = Date.now();
    const windowStart = record?.windowStart
      ? new Date(record.windowStart).getTime()
      : now;
    const windowEnd = windowStart + this.config.rateLimitWindow * 1000;

    // Window expired, start new one
    if (now > windowEnd) {
      await this.storage.set<RateLimitRecord>(
        key,
        { count: 1, windowStart: new Date(now).toISOString() },
        this.config.rateLimitWindow
      );
      return;
    }

    // Increment existing window
    const newCount = (record?.count ?? 0) + 1;
    const ttl = Math.ceil((windowEnd - now) / 1000);

    await this.storage.set<RateLimitRecord>(
      key,
      { count: newCount, windowStart: record?.windowStart ?? new Date(now).toISOString() },
      ttl
    );
  }

  /**
   * Store OTP for verification
   */
  async store(
    identifier: string,
    type: 'email' | 'sms',
    options?: { tenantId?: string; testMode?: boolean }
  ): Promise<StoreOTPResult> {
    // Check rate limit
    const rateLimitCheck = await this.checkRateLimit(identifier, type);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        error: rateLimitCheck.message,
        remainingRequests: 0,
      };
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.config.expiresIn * 1000);

    const otpRecord: OTPRecord = {
      code,
      identifier: type === 'email' ? identifier.toLowerCase() : identifier,
      type,
      expiresAt: expiresAt.toISOString(),
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      createdAt: new Date().toISOString(),
      tenantId: options?.tenantId,
    };

    const key = this.getOTPKey(identifier, type);
    await this.storage.set(key, otpRecord, this.config.expiresIn);

    // Increment rate limit
    await this.incrementRateLimit(identifier, type);

    return {
      success: true,
      code,
      expiresAt,
      remainingRequests: rateLimitCheck.remainingRequests,
    };
  }

  /**
   * Verify OTP code
   */
  async verify(
    identifier: string,
    type: 'email' | 'sms',
    code: string,
    options?: { testUser?: boolean }
  ): Promise<VerifyOTPResult> {
    // Test user bypass
    if (options?.testUser) {
      return {
        success: true,
        message: 'OTP verified successfully (test user).',
      };
    }

    const key = this.getOTPKey(identifier, type);
    const record = await this.storage.get<OTPRecord>(key);

    if (!record) {
      return {
        success: false,
        message: `No OTP found for this ${type}. Please request a new one.`,
      };
    }

    // Check expiry
    if (new Date() > new Date(record.expiresAt)) {
      await this.storage.delete(key);
      return {
        success: false,
        message: 'OTP has expired. Please request a new one.',
      };
    }

    // Check attempts
    if (record.attempts >= record.maxAttempts) {
      await this.storage.delete(key);
      return {
        success: false,
        message: 'Too many failed attempts. Please request a new OTP.',
      };
    }

    // Verify code
    if (record.code !== code) {
      record.attempts++;
      const attemptsLeft = record.maxAttempts - record.attempts;

      if (attemptsLeft <= 0) {
        await this.storage.delete(key);
        return {
          success: false,
          message: 'Invalid OTP. Too many failed attempts.',
        };
      }

      // Update attempts count
      const ttl = Math.ceil(
        (new Date(record.expiresAt).getTime() - Date.now()) / 1000
      );
      if (ttl > 0) {
        await this.storage.set(key, record, ttl);
      }

      return {
        success: false,
        message: 'Invalid OTP code.',
        attemptsLeft,
      };
    }

    // Success - remove OTP
    await this.storage.delete(key);

    return {
      success: true,
      message: 'OTP verified successfully.',
    };
  }

  /**
   * Check if valid OTP exists
   */
  async hasValidOTP(identifier: string, type: 'email' | 'sms'): Promise<boolean> {
    const key = this.getOTPKey(identifier, type);
    const record = await this.storage.get<OTPRecord>(key);

    if (!record) return false;
    if (new Date() > new Date(record.expiresAt)) return false;
    if (record.attempts >= record.maxAttempts) return false;

    return true;
  }

  /**
   * Get OTP info (for debugging)
   */
  async getInfo(
    identifier: string,
    type: 'email' | 'sms'
  ): Promise<{
    exists: boolean;
    expiresAt?: Date;
    attempts?: number;
    attemptsLeft?: number;
  }> {
    const key = this.getOTPKey(identifier, type);
    const record = await this.storage.get<OTPRecord>(key);

    if (!record) {
      return { exists: false };
    }

    return {
      exists: true,
      expiresAt: new Date(record.expiresAt),
      attempts: record.attempts,
      attemptsLeft: record.maxAttempts - record.attempts,
    };
  }

  /**
   * Delete OTP (for testing/cleanup)
   */
  async delete(identifier: string, type: 'email' | 'sms'): Promise<void> {
    const key = this.getOTPKey(identifier, type);
    await this.storage.delete(key);
  }

  /**
   * Get rate limit info
   */
  async getRateLimitInfo(
    identifier: string,
    type: 'email' | 'sms'
  ): Promise<{
    requestsUsed: number;
    remainingRequests: number;
    resetAt: Date;
  }> {
    const key = this.getRateLimitKey(identifier, type);
    const record = await this.storage.get<RateLimitRecord>(key);

    const now = Date.now();
    const windowStart = record?.windowStart
      ? new Date(record.windowStart).getTime()
      : now;
    const windowEnd = windowStart + this.config.rateLimitWindow * 1000;

    const currentCount = record?.count ?? 0;

    return {
      requestsUsed: currentCount,
      remainingRequests: Math.max(0, this.config.rateLimit - currentCount),
      resetAt: new Date(windowEnd),
    };
  }
}

/**
 * Create OTP manager instance
 */
export function createOTPManager(
  storage: KVStorage,
  config?: OTPConfig
): OTPManager {
  return new OTPManager(storage, config);
}
