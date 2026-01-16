/**
 * Base provider types and interfaces
 * All auth providers must implement these interfaces
 */

import type { ParsAuthConfig, AdapterUser, AdapterSession } from '../config.js';

/**
 * Provider types
 */
export type ProviderType =
  | 'otp'           // Email/SMS OTP
  | 'magic-link'    // Email magic links
  | 'oauth'         // OAuth providers (Google, GitHub, etc.)
  | 'totp'          // 2FA TOTP (Google Authenticator)
  | 'webauthn'      // WebAuthn/Passkeys
  | 'password';     // Password (disabled by default)

/**
 * Provider metadata
 */
export interface ProviderInfo {
  /** Provider unique name */
  name: string;
  /** Provider type */
  type: ProviderType;
  /** Whether the provider is enabled */
  enabled: boolean;
  /** Human-readable display name */
  displayName?: string;
  /** Provider icon URL */
  icon?: string;
}

/**
 * Authentication input (varies by provider)
 */
export interface AuthInput {
  /** User identifier (email, phone, username) */
  identifier?: string;
  /** Credential (OTP code, password, OAuth code, etc.) */
  credential?: string;
  /** Tenant ID for multi-tenant apps */
  tenantId?: string;
  /** Provider-specific data */
  data?: Record<string, unknown>;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether authentication was successful */
  success: boolean;
  /** Authenticated user (if successful) */
  user?: AdapterUser;
  /** Session (if created) */
  session?: AdapterSession;
  /** Whether this is a new user */
  isNewUser?: boolean;
  /** Whether 2FA is required */
  requiresTwoFactor?: boolean;
  /** 2FA challenge data */
  twoFactorChallenge?: {
    type: 'totp' | 'webauthn' | 'sms';
    challengeId?: string;
  };
  /** Error message (if failed) */
  error?: string;
  /** Error code (if failed) */
  errorCode?: string;
}

/**
 * Verification input
 */
export interface VerifyInput {
  /** Verification target (email, phone) */
  identifier: string;
  /** Verification type */
  type: 'email' | 'sms';
  /** Verification code or token */
  code: string;
  /** Tenant ID */
  tenantId?: string;
}

/**
 * Verification result
 */
export interface VerifyResult {
  /** Whether verification was successful */
  success: boolean;
  /** Remaining attempts (if failed) */
  attemptsLeft?: number;
  /** Error message */
  error?: string;
}

/**
 * Base auth provider interface
 * All providers must implement this interface
 */
export interface AuthProvider {
  /** Provider unique name (e.g., 'email-otp', 'google', 'password') */
  readonly name: string;

  /** Provider type */
  readonly type: ProviderType;

  /** Whether the provider is currently enabled */
  readonly enabled: boolean;

  /**
   * Initialize the provider with config
   * Called once during auth system setup
   */
  initialize?(config: ParsAuthConfig): Promise<void>;

  /**
   * Authenticate a user
   * This is the main authentication entry point
   */
  authenticate(input: AuthInput): Promise<AuthResult>;

  /**
   * Verify a code/token (optional)
   * Used by OTP, magic link, etc.
   */
  verify?(input: VerifyInput): Promise<VerifyResult>;

  /**
   * Get provider info for display
   */
  getInfo(): ProviderInfo;
}

/**
 * Two-factor auth provider interface
 * Extends base provider for 2FA capabilities
 */
export interface TwoFactorProvider extends AuthProvider {
  /** Provider type is always 'totp' or 'webauthn' for 2FA */
  readonly type: 'totp' | 'webauthn';

  /**
   * Setup 2FA for a user
   * Returns setup data (QR code, backup codes, etc.)
   */
  setup(userId: string): Promise<TwoFactorSetupResult>;

  /**
   * Verify 2FA and complete setup
   */
  verifySetup(userId: string, code: string): Promise<boolean>;

  /**
   * Verify 2FA during login
   */
  verifyLogin(userId: string, code: string): Promise<boolean>;

  /**
   * Disable 2FA for a user
   */
  disable(userId: string): Promise<void>;
}

/**
 * 2FA setup result
 */
export interface TwoFactorSetupResult {
  /** Secret key (for TOTP) */
  secret?: string;
  /** QR code data URL */
  qrCode?: string;
  /** Backup codes */
  backupCodes?: string[];
  /** WebAuthn challenge */
  challenge?: string;
}

/**
 * OAuth provider interface
 * Extends base provider for OAuth flows
 */
export interface OAuthProvider extends AuthProvider {
  /** Provider type is always 'oauth' */
  readonly type: 'oauth';

  /**
   * Get OAuth authorization URL
   */
  getAuthorizationUrl(state: string, codeVerifier?: string): Promise<string>;

  /**
   * Exchange authorization code for tokens
   */
  exchangeCode(
    code: string,
    codeVerifier?: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    idToken?: string;
  }>;

  /**
   * Get user info from OAuth provider
   */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

/**
 * OAuth user info
 */
export interface OAuthUserInfo {
  /** Provider-specific user ID */
  id: string;
  /** User email */
  email?: string;
  /** Whether email is verified */
  emailVerified?: boolean;
  /** User name */
  name?: string;
  /** Avatar URL */
  avatar?: string;
  /** Raw provider data */
  raw?: Record<string, unknown>;
}

/**
 * Abstract base class for providers
 * Provides common functionality
 */
export abstract class BaseProvider implements AuthProvider {
  abstract readonly name: string;
  abstract readonly type: ProviderType;

  protected config?: ParsAuthConfig;
  protected _enabled: boolean = false;

  get enabled(): boolean {
    return this._enabled;
  }

  async initialize(config: ParsAuthConfig): Promise<void> {
    this.config = config;
  }

  abstract authenticate(input: AuthInput): Promise<AuthResult>;

  getInfo(): ProviderInfo {
    return {
      name: this.name,
      type: this.type,
      enabled: this.enabled,
    };
  }
}
