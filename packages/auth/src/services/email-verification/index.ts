/**
 * Email Verification Service
 * Handles email verification tokens and status
 */

import type { KVStorage } from '../../storage/types.js';
import { generateRandomHex, sha256Hex } from '../../utils/crypto.js';

/**
 * Email verification configuration
 */
export interface EmailVerificationConfig {
  /** Base URL for verification links */
  baseUrl: string;
  /** Verification callback path (default: /auth/verify-email) */
  callbackPath?: string;
  /** Token expiration in seconds (default: 86400 = 24 hours) */
  expiresIn?: number;
  /** Token length in bytes (default: 32) */
  tokenLength?: number;
}

/**
 * Verification token record
 */
interface VerificationToken {
  email: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdBy?: string;
}

/**
 * Request verification result
 */
export interface RequestVerificationResult {
  success: boolean;
  token?: string;
  verificationUrl?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * Verify email result
 */
export interface VerifyEmailResult {
  success: boolean;
  email?: string;
  error?: string;
}

/**
 * Verification status
 */
export interface VerificationStatus {
  email: string;
  verified: boolean;
  pendingVerification: boolean;
  expiresAt?: Date;
}

/**
 * Email Verification Service
 */
export class EmailVerificationService {
  private storage: KVStorage;
  private config: Required<EmailVerificationConfig>;

  constructor(storage: KVStorage, config: EmailVerificationConfig) {
    this.storage = storage;
    this.config = {
      callbackPath: '/auth/verify-email',
      expiresIn: 86400, // 24 hours
      tokenLength: 32,
      ...config,
    };
  }

  /**
   * Create verification token for an email
   */
  async createVerificationToken(
    email: string,
    options?: { createdBy?: string }
  ): Promise<RequestVerificationResult> {
    const normalizedEmail = email.toLowerCase().trim();

    // Generate secure token
    const token = await generateRandomHex(this.config.tokenLength);
    const tokenHash = await sha256Hex(token);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + this.config.expiresIn * 1000);

    // Clean up old tokens for this email
    await this.deleteTokensByEmail(normalizedEmail);

    // Store token
    const tokenData: VerificationToken = {
      email: normalizedEmail,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      createdBy: options?.createdBy,
    };

    await this.storage.set(`email-verify:hash:${tokenHash}`, tokenData, this.config.expiresIn);
    await this.storage.set(`email-verify:email:${normalizedEmail}`, tokenHash, this.config.expiresIn);

    // Build verification URL
    const params = new URLSearchParams({ token });
    const verificationUrl = `${this.config.baseUrl}${this.config.callbackPath}?${params}`;

    return {
      success: true,
      token,
      verificationUrl,
      expiresAt,
    };
  }

  /**
   * Verify an email token
   */
  async verifyToken(token: string): Promise<VerifyEmailResult> {
    const tokenHash = await sha256Hex(token);

    // Find token
    const tokenData = await this.storage.get<VerificationToken>(`email-verify:hash:${tokenHash}`);

    if (!tokenData) {
      return { success: false, error: 'Invalid or expired verification token' };
    }

    if (tokenData.usedAt) {
      return { success: false, error: 'Verification token already used' };
    }

    if (new Date(tokenData.expiresAt) < new Date()) {
      await this.deleteToken(tokenHash);
      return { success: false, error: 'Verification token expired' };
    }

    // Mark token as used
    tokenData.usedAt = new Date().toISOString();
    await this.storage.set(`email-verify:hash:${tokenHash}`, tokenData, 300); // Keep for 5 min for audit

    // Clean up email lookup
    await this.storage.delete(`email-verify:email:${tokenData.email}`);

    return {
      success: true,
      email: tokenData.email,
    };
  }

  /**
   * Check verification status for an email
   */
  async getStatus(email: string): Promise<VerificationStatus> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check for pending verification
    const tokenHash = await this.storage.get<string>(`email-verify:email:${normalizedEmail}`);

    if (tokenHash) {
      const tokenData = await this.storage.get<VerificationToken>(`email-verify:hash:${tokenHash}`);
      if (tokenData && !tokenData.usedAt) {
        return {
          email: normalizedEmail,
          verified: false,
          pendingVerification: true,
          expiresAt: new Date(tokenData.expiresAt),
        };
      }
    }

    return {
      email: normalizedEmail,
      verified: false,
      pendingVerification: false,
    };
  }

  /**
   * Resend verification email
   * Returns a new token for the same email
   */
  async resendVerification(
    email: string,
    options?: { createdBy?: string }
  ): Promise<RequestVerificationResult> {
    return this.createVerificationToken(email, options);
  }

  /**
   * Cancel pending verification
   */
  async cancelVerification(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    await this.deleteTokensByEmail(normalizedEmail);
  }

  /**
   * Delete token by hash
   */
  private async deleteToken(tokenHash: string): Promise<void> {
    const tokenData = await this.storage.get<VerificationToken>(`email-verify:hash:${tokenHash}`);
    if (tokenData) {
      await this.storage.delete(`email-verify:email:${tokenData.email}`);
    }
    await this.storage.delete(`email-verify:hash:${tokenHash}`);
  }

  /**
   * Delete all tokens for an email
   */
  private async deleteTokensByEmail(email: string): Promise<void> {
    const tokenHash = await this.storage.get<string>(`email-verify:email:${email}`);
    if (tokenHash) {
      await this.storage.delete(`email-verify:hash:${tokenHash}`);
    }
    await this.storage.delete(`email-verify:email:${email}`);
  }
}

/**
 * Create email verification service
 */
export function createEmailVerificationService(
  storage: KVStorage,
  config: EmailVerificationConfig
): EmailVerificationService {
  return new EmailVerificationService(storage, config);
}
