/**
 * Session Blocklist
 * Uses KVStorage interface for multi-runtime support
 * Supports token/session revocation for logout
 */

import type { KVStorage } from '../storage/types.js';
import { StorageKeys } from '../storage/index.js';

/**
 * Blocklist configuration
 */
export interface BlocklistConfig {
  /** Key prefix for blocked sessions */
  prefix?: string;
  /** Default TTL in seconds (should match max token lifetime) */
  defaultTTL?: number;
}

/**
 * Blocklist entry
 */
interface BlocklistEntry {
  /** Session or token ID */
  id: string;
  /** When the entry expires */
  expiresAt: string;
  /** Why was it blocked */
  reason?: string;
  /** When it was blocked */
  blockedAt: string;
  /** User ID (for audit) */
  userId?: string;
}

/**
 * Session Blocklist
 * Manages blocked/revoked sessions and tokens
 */
export class SessionBlocklist {
  private storage: KVStorage;

  constructor(storage: KVStorage, _config?: BlocklistConfig) {
    this.storage = storage;
    // Config is reserved for future use (custom prefix, TTL settings)
  }

  /**
   * Get storage key for blocklist entry
   */
  private getKey(sessionId: string): string {
    return StorageKeys.blocklist(sessionId);
  }

  /**
   * Block a session (revoke it)
   */
  async blockSession(
    sessionId: string,
    expiresAt: Date,
    options?: { reason?: string; userId?: string }
  ): Promise<void> {
    const ttlMs = expiresAt.getTime() - Date.now();
    if (ttlMs <= 0) return; // Already expired, no need to block

    const ttlSeconds = Math.ceil(ttlMs / 1000);
    const key = this.getKey(sessionId);

    const entry: BlocklistEntry = {
      id: sessionId,
      expiresAt: expiresAt.toISOString(),
      reason: options?.reason,
      blockedAt: new Date().toISOString(),
      userId: options?.userId,
    };

    await this.storage.set(key, entry, ttlSeconds);
  }

  /**
   * Check if a session is blocked
   */
  async isBlocked(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId);
    const entry = await this.storage.get<BlocklistEntry>(key);

    if (!entry) return false;

    // Double-check expiration (storage should handle this, but be safe)
    if (new Date(entry.expiresAt) < new Date()) {
      await this.storage.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get blocklist entry details
   */
  async getEntry(sessionId: string): Promise<BlocklistEntry | null> {
    const key = this.getKey(sessionId);
    return this.storage.get<BlocklistEntry>(key);
  }

  /**
   * Unblock a session (if needed)
   */
  async unblockSession(sessionId: string): Promise<void> {
    const key = this.getKey(sessionId);
    await this.storage.delete(key);
  }

  /**
   * Block multiple sessions (logout all devices)
   */
  async blockMultipleSessions(
    sessions: Array<{
      id: string;
      expiresAt: Date;
      reason?: string;
      userId?: string;
    }>
  ): Promise<void> {
    await Promise.all(
      sessions.map((s) =>
        this.blockSession(s.id, s.expiresAt, {
          reason: s.reason,
          userId: s.userId,
        })
      )
    );
  }

  /**
   * Block all sessions for a user
   * Requires session IDs to be provided (from session store)
   */
  async blockAllUserSessions(
    userId: string,
    sessionIds: string[],
    tokenExpiresAt: Date,
    reason = 'User logout all'
  ): Promise<void> {
    await this.blockMultipleSessions(
      sessionIds.map((id) => ({
        id,
        expiresAt: tokenExpiresAt,
        reason,
        userId,
      }))
    );
  }
}

/**
 * Token Blocklist
 * For revoking individual tokens (separate from sessions)
 */
export class TokenBlocklist {
  private storage: KVStorage;

  constructor(storage: KVStorage) {
    this.storage = storage;
  }

  /**
   * Get storage key for token blocklist entry
   */
  private getKey(tokenHash: string): string {
    return `blocklist:token:${tokenHash}`;
  }

  /**
   * Hash a token for storage (don't store raw tokens)
   */
  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Block a token
   */
  async blockToken(token: string, expiresAt: Date, reason?: string): Promise<void> {
    const ttlMs = expiresAt.getTime() - Date.now();
    if (ttlMs <= 0) return;

    const ttlSeconds = Math.ceil(ttlMs / 1000);
    const hash = await this.hashToken(token);
    const key = this.getKey(hash);

    await this.storage.set(
      key,
      {
        hash,
        expiresAt: expiresAt.toISOString(),
        reason,
        blockedAt: new Date().toISOString(),
      },
      ttlSeconds
    );
  }

  /**
   * Check if a token is blocked
   */
  async isBlocked(token: string): Promise<boolean> {
    const hash = await this.hashToken(token);
    const key = this.getKey(hash);
    return this.storage.has(key);
  }

  /**
   * Unblock a token
   */
  async unblockToken(token: string): Promise<void> {
    const hash = await this.hashToken(token);
    const key = this.getKey(hash);
    await this.storage.delete(key);
  }
}

/**
 * Create session blocklist
 */
export function createSessionBlocklist(
  storage: KVStorage,
  config?: BlocklistConfig
): SessionBlocklist {
  return new SessionBlocklist(storage, config);
}

/**
 * Create token blocklist
 */
export function createTokenBlocklist(storage: KVStorage): TokenBlocklist {
  return new TokenBlocklist(storage);
}
