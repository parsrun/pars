/**
 * CSRF Protection
 * Double-Submit Cookie Pattern with KVStorage support
 */

import type { KVStorage } from '../storage/types.js';
import { StorageKeys } from '../storage/index.js';
import {
  generateRandomBase64Url,
  sha256Hex,
  timingSafeEqual,
} from '../utils/crypto.js';

/**
 * CSRF configuration
 */
export interface CsrfConfig {
  /** Token expiry in seconds (default: 3600 = 1 hour) */
  expiresIn?: number;
  /** Header name for CSRF token (default: 'x-csrf-token') */
  headerName?: string;
  /** Cookie name for CSRF token (default: 'csrf') */
  cookieName?: string;
  /** Token byte length (default: 32) */
  tokenLength?: number;
}

/**
 * CSRF token pair
 */
export interface CsrfTokenPair {
  /** Plain token (for client) */
  token: string;
  /** Hashed token (for server storage/cookie) */
  hash: string;
}

/**
 * CSRF Manager
 */
export class CsrfManager {
  private storage: KVStorage;
  private config: Required<CsrfConfig>;

  constructor(storage: KVStorage, config?: CsrfConfig) {
    this.storage = storage;
    this.config = {
      expiresIn: config?.expiresIn ?? 3600,
      headerName: config?.headerName ?? 'x-csrf-token',
      cookieName: config?.cookieName ?? 'csrf',
      tokenLength: config?.tokenLength ?? 32,
    };
  }

  /**
   * Generate a cryptographically secure CSRF token
   */
  generateToken(): string {
    return generateRandomBase64Url(this.config.tokenLength);
  }

  /**
   * Hash a CSRF token for storage
   */
  async hashToken(token: string): Promise<string> {
    return sha256Hex(token);
  }

  /**
   * Generate token pair for double-submit pattern
   */
  async generateTokenPair(): Promise<CsrfTokenPair> {
    const token = this.generateToken();
    const hash = await this.hashToken(token);
    return { token, hash };
  }

  /**
   * Store CSRF token for a session
   */
  async storeToken(sessionId: string, token: string): Promise<void> {
    const hash = await this.hashToken(token);
    const key = StorageKeys.csrf(sessionId);
    await this.storage.set(key, { hash, createdAt: new Date().toISOString() }, this.config.expiresIn);
  }

  /**
   * Verify CSRF token against stored hash
   */
  async verifyToken(token: string, hash: string): Promise<boolean> {
    const computedHash = await this.hashToken(token);
    return timingSafeEqual(computedHash, hash);
  }

  /**
   * Verify CSRF token for a session
   */
  async verifyTokenForSession(sessionId: string, token: string): Promise<boolean> {
    const key = StorageKeys.csrf(sessionId);
    const stored = await this.storage.get<{ hash: string }>(key);

    if (!stored) {
      return false;
    }

    return this.verifyToken(token, stored.hash);
  }

  /**
   * Validate double-submit cookie pattern
   * Compares CSRF token from header/body against cookie value
   */
  validateDoubleSubmit(headerToken: string, cookieToken: string): boolean {
    if (!headerToken || !cookieToken) return false;
    return timingSafeEqual(headerToken, cookieToken);
  }

  /**
   * Extract CSRF token from request headers or body
   */
  extractTokenFromRequest(
    headers: Record<string, string | undefined>,
    body?: Record<string, unknown>
  ): string | null {
    // Check header first (case-insensitive)
    const headerName = this.config.headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === headerName && value) {
        return value;
      }
    }

    // Check request body
    if (body && typeof body['csrfToken'] === 'string') {
      return body['csrfToken'];
    }
    if (body && typeof body['_csrf'] === 'string') {
      return body['_csrf'];
    }

    return null;
  }

  /**
   * Delete CSRF token for a session
   */
  async deleteToken(sessionId: string): Promise<void> {
    const key = StorageKeys.csrf(sessionId);
    await this.storage.delete(key);
  }

  /**
   * Refresh CSRF token for a session
   */
  async refreshToken(sessionId: string): Promise<CsrfTokenPair> {
    const pair = await this.generateTokenPair();
    await this.storeToken(sessionId, pair.token);
    return pair;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<CsrfConfig> {
    return { ...this.config };
  }
}

/**
 * Create CSRF manager
 */
export function createCsrfManager(
  storage: KVStorage,
  config?: CsrfConfig
): CsrfManager {
  return new CsrfManager(storage, config);
}

/**
 * Static CSRF utilities (for stateless double-submit pattern)
 */
export const CsrfUtils = {
  /**
   * Generate a CSRF token
   */
  generateToken(length = 32): string {
    return generateRandomBase64Url(length);
  },

  /**
   * Hash a token
   */
  hashToken(token: string): Promise<string> {
    return sha256Hex(token);
  },

  /**
   * Generate token pair
   */
  async generateTokenPair(length = 32): Promise<CsrfTokenPair> {
    const token = generateRandomBase64Url(length);
    const hash = await sha256Hex(token);
    return { token, hash };
  },

  /**
   * Verify token against hash
   */
  async verifyToken(token: string, hash: string): Promise<boolean> {
    const computedHash = await sha256Hex(token);
    return timingSafeEqual(computedHash, hash);
  },

  /**
   * Validate double-submit pattern
   */
  validateDoubleSubmit(headerToken: string, cookieToken: string): boolean {
    if (!headerToken || !cookieToken) return false;
    return timingSafeEqual(headerToken, cookieToken);
  },
};
