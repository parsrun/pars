/**
 * OTP Authentication Provider
 * Email and SMS one-time password authentication
 */

import type { KVStorage } from '../../storage/types.js';
import type { OtpConfig } from '../../config.js';
import type {
  AuthProvider,
  AuthInput,
  AuthResult,
  VerifyInput,
  VerifyResult,
  ProviderInfo,
} from '../base.js';
import { OTPManager, type OTPConfig as OTPManagerConfig } from './otp-manager.js';

// Re-export OTP manager
export { OTPManager, createOTPManager, type OTPConfig } from './otp-manager.js';

/**
 * OTP request input
 */
export interface RequestOTPInput {
  /** Email or phone number */
  identifier: string;
  /** OTP type */
  type: 'email' | 'sms';
  /** Tenant ID (for multi-tenant) */
  tenantId?: string;
}

/**
 * OTP request result
 */
export interface RequestOTPResult {
  success: boolean;
  expiresAt?: Date;
  error?: string;
  remainingRequests?: number;
}

/**
 * OTP Provider
 */
export class OTPProvider implements AuthProvider {
  readonly name = 'otp';
  readonly type = 'otp' as const;

  private otpManager: OTPManager;
  private config: OtpConfig;
  private emailSend?: (to: string, code: string) => Promise<void>;
  private smsSend?: (to: string, code: string) => Promise<void>;
  private _enabled: boolean;

  constructor(
    storage: KVStorage,
    config: OtpConfig
  ) {
    this.config = config;
    this._enabled = config.enabled !== false;

    // Create OTP manager with email config (primary)
    const otpManagerConfig: OTPManagerConfig = {
      length: config.email?.length ?? config.sms?.length ?? 6,
      expiresIn: config.email?.expiresIn ?? config.sms?.expiresIn ?? 600,
      maxAttempts: config.email?.maxAttempts ?? config.sms?.maxAttempts ?? 3,
      rateLimit: config.email?.rateLimit ?? config.sms?.rateLimit ?? 5,
      rateLimitWindow: config.email?.rateLimitWindow ?? config.sms?.rateLimitWindow ?? 900,
    };

    this.otpManager = new OTPManager(storage, otpManagerConfig);
    this.emailSend = config.email?.send;
    this.smsSend = config.sms?.send;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Request OTP (send to email or SMS)
   */
  async requestOTP(input: RequestOTPInput): Promise<RequestOTPResult> {
    const { identifier, type, tenantId } = input;

    // Check if type is enabled
    if (type === 'email' && this.config.email?.enabled === false) {
      return {
        success: false,
        error: 'Email OTP is not enabled',
      };
    }

    if (type === 'sms' && this.config.sms?.enabled !== true) {
      return {
        success: false,
        error: 'SMS OTP is not enabled',
      };
    }

    // Get send function
    const sendFn = type === 'email' ? this.emailSend : this.smsSend;
    if (!sendFn) {
      return {
        success: false,
        error: `${type === 'email' ? 'Email' : 'SMS'} send function not configured`,
      };
    }

    // Store OTP
    const result = await this.otpManager.store(identifier, type, { tenantId });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        remainingRequests: result.remainingRequests,
      };
    }

    // Send OTP
    try {
      await sendFn(identifier, result.code!);
    } catch (error) {
      // Delete OTP if send fails
      await this.otpManager.delete(identifier, type);
      return {
        success: false,
        error: `Failed to send ${type === 'email' ? 'email' : 'SMS'}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }

    return {
      success: true,
      expiresAt: result.expiresAt,
      remainingRequests: result.remainingRequests,
    };
  }

  /**
   * Verify OTP (implements AuthProvider.verify)
   */
  async verify(input: VerifyInput): Promise<VerifyResult> {
    const { identifier, type, code } = input;

    const result = await this.otpManager.verify(
      identifier,
      type as 'email' | 'sms',
      code
    );

    return {
      success: result.success,
      attemptsLeft: result.attemptsLeft,
      error: result.success ? undefined : result.message,
    };
  }

  /**
   * Authenticate with OTP (implements AuthProvider.authenticate)
   * This verifies OTP but doesn't create session - that's done by auth engine
   */
  async authenticate(input: AuthInput): Promise<AuthResult> {
    const { identifier, credential, data } = input;

    if (!identifier || !credential) {
      return {
        success: false,
        error: 'Identifier and OTP code are required',
        errorCode: 'INVALID_INPUT',
      };
    }

    const type = (data?.['type'] as 'email' | 'sms') ?? 'email';

    const verifyResult = await this.otpManager.verify(identifier, type, credential);

    if (!verifyResult.success) {
      return {
        success: false,
        error: verifyResult.message,
        errorCode: 'INVALID_OTP',
      };
    }

    // Return success - auth engine will handle user lookup/creation and session
    return {
      success: true,
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
      displayName: 'One-Time Password',
    };
  }

  /**
   * Check if valid OTP exists
   */
  async hasValidOTP(identifier: string, type: 'email' | 'sms'): Promise<boolean> {
    return this.otpManager.hasValidOTP(identifier, type);
  }

  /**
   * Get OTP info (for debugging)
   */
  async getOTPInfo(identifier: string, type: 'email' | 'sms') {
    return this.otpManager.getInfo(identifier, type);
  }

  /**
   * Get rate limit info
   */
  async getRateLimitInfo(identifier: string, type: 'email' | 'sms') {
    return this.otpManager.getRateLimitInfo(identifier, type);
  }
}

/**
 * Create OTP provider
 */
export function createOTPProvider(
  storage: KVStorage,
  config: OtpConfig
): OTPProvider {
  return new OTPProvider(storage, config);
}
