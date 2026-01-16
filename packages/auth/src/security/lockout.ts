/**
 * Account Lockout
 * Prevents brute force attacks by locking accounts after failed attempts
 */

import type { KVStorage } from '../storage/types.js';

/**
 * Lockout configuration
 */
export interface LockoutConfig {
  /** Maximum failed attempts before lockout */
  maxAttempts: number;
  /** Lockout duration in seconds */
  lockoutDuration: number;
  /** Time window for counting attempts in seconds */
  attemptWindow: number;
  /** Key prefix for lockout entries */
  keyPrefix?: string;
}

/**
 * Lockout status
 */
export interface LockoutStatus {
  /** Whether the account is locked */
  locked: boolean;
  /** Number of failed attempts */
  attempts: number;
  /** Remaining attempts before lockout */
  remainingAttempts: number;
  /** When the lockout expires (if locked) */
  unlocksAt?: Date;
  /** Seconds until unlock (if locked) */
  unlocksInSeconds?: number;
}

/**
 * Lockout record stored in KV
 */
interface LockoutRecord {
  attempts: number;
  firstAttemptAt: string;
  lockedUntil?: string;
}

/**
 * Account Lockout Manager
 */
export class LockoutManager {
  private storage: KVStorage;
  private config: Required<LockoutConfig>;

  constructor(storage: KVStorage, config: LockoutConfig) {
    this.storage = storage;
    this.config = {
      keyPrefix: 'lockout:',
      ...config,
    };
  }

  /**
   * Get storage key for lockout entry
   */
  private getKey(identifier: string): string {
    return `${this.config.keyPrefix}${identifier}`;
  }

  /**
   * Record a failed attempt
   */
  async recordFailedAttempt(identifier: string): Promise<LockoutStatus> {
    const key = this.getKey(identifier);
    const now = Date.now();
    const record = await this.storage.get<LockoutRecord>(key);

    let attempts: number;
    let firstAttemptAt: number;
    let lockedUntil: number | undefined;

    if (record) {
      // Check if currently locked
      if (record.lockedUntil) {
        const lockedUntilTime = new Date(record.lockedUntil).getTime();
        if (now < lockedUntilTime) {
          // Still locked
          return {
            locked: true,
            attempts: record.attempts,
            remainingAttempts: 0,
            unlocksAt: new Date(lockedUntilTime),
            unlocksInSeconds: Math.ceil((lockedUntilTime - now) / 1000),
          };
        }
        // Lock expired, reset
        attempts = 1;
        firstAttemptAt = now;
        lockedUntil = undefined;
      } else {
        // Check if attempt window expired
        firstAttemptAt = new Date(record.firstAttemptAt).getTime();
        const windowEnd = firstAttemptAt + this.config.attemptWindow * 1000;

        if (now > windowEnd) {
          // Window expired, reset
          attempts = 1;
          firstAttemptAt = now;
        } else {
          // Increment attempts
          attempts = record.attempts + 1;
        }
      }
    } else {
      // First attempt
      attempts = 1;
      firstAttemptAt = now;
    }

    // Check if should lock
    if (attempts >= this.config.maxAttempts) {
      lockedUntil = now + this.config.lockoutDuration * 1000;
    }

    // Calculate TTL - whichever is longer: window or lockout
    const windowEnd = firstAttemptAt + this.config.attemptWindow * 1000;
    const ttlEnd = lockedUntil ?? windowEnd;
    const ttl = Math.ceil((ttlEnd - now) / 1000);

    // Store record
    if (ttl > 0) {
      await this.storage.set<LockoutRecord>(
        key,
        {
          attempts,
          firstAttemptAt: new Date(firstAttemptAt).toISOString(),
          lockedUntil: lockedUntil ? new Date(lockedUntil).toISOString() : undefined,
        },
        ttl
      );
    }

    const remainingAttempts = Math.max(0, this.config.maxAttempts - attempts);

    if (lockedUntil) {
      return {
        locked: true,
        attempts,
        remainingAttempts: 0,
        unlocksAt: new Date(lockedUntil),
        unlocksInSeconds: Math.ceil((lockedUntil - now) / 1000),
      };
    }

    return {
      locked: false,
      attempts,
      remainingAttempts,
    };
  }

  /**
   * Record a successful attempt (clear lockout state)
   */
  async recordSuccessfulAttempt(identifier: string): Promise<void> {
    const key = this.getKey(identifier);
    await this.storage.delete(key);
  }

  /**
   * Get current lockout status
   */
  async getStatus(identifier: string): Promise<LockoutStatus> {
    const key = this.getKey(identifier);
    const record = await this.storage.get<LockoutRecord>(key);
    const now = Date.now();

    if (!record) {
      return {
        locked: false,
        attempts: 0,
        remainingAttempts: this.config.maxAttempts,
      };
    }

    // Check if locked
    if (record.lockedUntil) {
      const lockedUntilTime = new Date(record.lockedUntil).getTime();
      if (now < lockedUntilTime) {
        return {
          locked: true,
          attempts: record.attempts,
          remainingAttempts: 0,
          unlocksAt: new Date(lockedUntilTime),
          unlocksInSeconds: Math.ceil((lockedUntilTime - now) / 1000),
        };
      }
      // Lock expired
      return {
        locked: false,
        attempts: 0,
        remainingAttempts: this.config.maxAttempts,
      };
    }

    // Check if window expired
    const firstAttemptAt = new Date(record.firstAttemptAt).getTime();
    const windowEnd = firstAttemptAt + this.config.attemptWindow * 1000;

    if (now > windowEnd) {
      return {
        locked: false,
        attempts: 0,
        remainingAttempts: this.config.maxAttempts,
      };
    }

    return {
      locked: false,
      attempts: record.attempts,
      remainingAttempts: Math.max(0, this.config.maxAttempts - record.attempts),
    };
  }

  /**
   * Check if account is locked
   */
  async isLocked(identifier: string): Promise<boolean> {
    const status = await this.getStatus(identifier);
    return status.locked;
  }

  /**
   * Manually lock an account
   */
  async lock(identifier: string, durationSeconds?: number): Promise<void> {
    const key = this.getKey(identifier);
    const duration = durationSeconds ?? this.config.lockoutDuration;
    const lockedUntil = new Date(Date.now() + duration * 1000);

    await this.storage.set<LockoutRecord>(
      key,
      {
        attempts: this.config.maxAttempts,
        firstAttemptAt: new Date().toISOString(),
        lockedUntil: lockedUntil.toISOString(),
      },
      duration
    );
  }

  /**
   * Manually unlock an account
   */
  async unlock(identifier: string): Promise<void> {
    const key = this.getKey(identifier);
    await this.storage.delete(key);
  }
}

/**
 * Create lockout manager
 */
export function createLockoutManager(
  storage: KVStorage,
  config: LockoutConfig
): LockoutManager {
  return new LockoutManager(storage, config);
}

/**
 * Default lockout configuration
 */
export const DefaultLockoutConfig: LockoutConfig = {
  maxAttempts: 5,
  lockoutDuration: 15 * 60, // 15 minutes
  attemptWindow: 15 * 60, // 15 minutes
  keyPrefix: 'lockout:',
};
