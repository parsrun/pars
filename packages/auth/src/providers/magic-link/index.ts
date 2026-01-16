/**
 * Magic Link Provider
 * Passwordless email authentication via secure links
 */

import type { KVStorage } from '../../storage/types.js';
import type { AuthProvider, AuthInput, AuthResult, ProviderInfo } from '../base.js';
import { generateRandomHex, sha256Hex } from '../../utils/crypto.js';

/**
 * Magic Link configuration
 */
export interface MagicLinkConfig {
  /** Base URL for magic links (e.g., https://app.example.com) */
  baseUrl: string;
  /** Path for callback (default: /auth/magic-link/callback) */
  callbackPath?: string;
  /** Token expiration in seconds (default: 900 = 15 minutes) */
  expiresIn?: number;
  /** Token length in bytes (default: 32) */
  tokenLength?: number;
  /** Email sender function */
  send: (email: string, url: string, expiresIn: number) => Promise<void>;
}

/**
 * Magic link token record
 */
interface MagicLinkToken {
  email: string;
  tokenHash: string;
  tenantId?: string;
  redirectUrl?: string;
  expiresAt: string;
  usedAt?: string;
}

/**
 * Send magic link result
 */
export interface SendMagicLinkResult {
  success: boolean;
  expiresAt?: Date;
  error?: string;
}

/**
 * Verify magic link result
 */
export interface VerifyMagicLinkResult {
  success: boolean;
  email?: string;
  tenantId?: string;
  redirectUrl?: string;
  error?: string;
}

/**
 * Magic Link Provider
 */
export class MagicLinkProvider implements AuthProvider {
  readonly name = 'magic-link';
  readonly type = 'magic-link' as const;

  private storage: KVStorage;
  private config: Required<Omit<MagicLinkConfig, 'send'>> & { send: MagicLinkConfig['send'] };
  private _enabled: boolean;

  constructor(storage: KVStorage, config: MagicLinkConfig) {
    this.storage = storage;
    this.config = {
      callbackPath: '/auth/magic-link/callback',
      expiresIn: 900, // 15 minutes
      tokenLength: 32,
      ...config,
    };
    this._enabled = true;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Send magic link to email
   */
  async sendMagicLink(
    email: string,
    options?: { tenantId?: string; redirectUrl?: string }
  ): Promise<SendMagicLinkResult> {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Generate token
    const token = await generateRandomHex(this.config.tokenLength);
    const tokenHash = await sha256Hex(token);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + this.config.expiresIn * 1000);

    // Clean up old tokens for this email
    await this.storage.delete(`magic:email:${normalizedEmail}`);

    // Store token
    const tokenData: MagicLinkToken = {
      email: normalizedEmail,
      tokenHash,
      tenantId: options?.tenantId,
      redirectUrl: options?.redirectUrl,
      expiresAt: expiresAt.toISOString(),
    };

    await this.storage.set(
      `magic:token:${tokenHash}`,
      tokenData,
      this.config.expiresIn
    );

    // Also store by email for cleanup
    await this.storage.set(
      `magic:email:${normalizedEmail}`,
      tokenHash,
      this.config.expiresIn
    );

    // Build magic link URL
    const params = new URLSearchParams({ token });
    if (options?.redirectUrl) {
      params.set('redirect', options.redirectUrl);
    }
    const magicLink = `${this.config.baseUrl}${this.config.callbackPath}?${params}`;

    // Send email
    try {
      await this.config.send(normalizedEmail, magicLink, this.config.expiresIn);
      return { success: true, expiresAt };
    } catch (error) {
      // Clean up on send failure
      await this.storage.delete(`magic:token:${tokenHash}`);
      await this.storage.delete(`magic:email:${normalizedEmail}`);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Verify magic link token
   */
  async verifyMagicLink(token: string): Promise<VerifyMagicLinkResult> {
    const tokenHash = await sha256Hex(token);

    // Find token
    const tokenData = await this.storage.get<MagicLinkToken>(`magic:token:${tokenHash}`);

    if (!tokenData) {
      return { success: false, error: 'Invalid or expired magic link' };
    }

    if (tokenData.usedAt) {
      return { success: false, error: 'Magic link already used' };
    }

    if (new Date(tokenData.expiresAt) < new Date()) {
      await this.storage.delete(`magic:token:${tokenHash}`);
      return { success: false, error: 'Magic link expired' };
    }

    // Mark as used
    tokenData.usedAt = new Date().toISOString();
    await this.storage.set(`magic:token:${tokenHash}`, tokenData, 60); // Keep for 1 minute for audit

    // Clean up email lookup
    await this.storage.delete(`magic:email:${tokenData.email}`);

    return {
      success: true,
      email: tokenData.email,
      tenantId: tokenData.tenantId,
      redirectUrl: tokenData.redirectUrl,
    };
  }

  /**
   * Authenticate with magic link token (implements AuthProvider)
   */
  async authenticate(input: AuthInput): Promise<AuthResult> {
    const { credential } = input;

    if (!credential) {
      return {
        success: false,
        error: 'Token is required',
        errorCode: 'INVALID_INPUT',
      };
    }

    const result = await this.verifyMagicLink(credential);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorCode: 'INVALID_TOKEN',
      };
    }

    return {
      success: true,
      // Auth engine will handle user lookup/creation based on email
    };
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      displayName: 'Magic Link',
    };
  }

  /**
   * Request magic link (for use in auth routes)
   */
  async requestMagicLink(
    email: string,
    options?: { tenantId?: string; redirectUrl?: string }
  ): Promise<SendMagicLinkResult> {
    return this.sendMagicLink(email, options);
  }
}

/**
 * Create Magic Link provider
 */
export function createMagicLinkProvider(
  storage: KVStorage,
  config: MagicLinkConfig
): MagicLinkProvider {
  return new MagicLinkProvider(storage, config);
}
