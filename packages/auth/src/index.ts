/**
 * @parsrun/auth - Passwordless-First Authentication
 *
 * A provider-based, multi-runtime authentication library.
 *
 * @example
 * ```typescript
 * import { createAuth } from '@parsrun/auth';
 *
 * const auth = createAuth({
 *   secret: process.env.AUTH_SECRET,
 *   adapter: myDatabaseAdapter,
 *   providers: {
 *     otp: {
 *       email: {
 *         send: async (to, code) => {
 *           await sendEmail(to, `Your code is: ${code}`);
 *         },
 *       },
 *     },
 *   },
 * });
 *
 * await auth.initialize();
 *
 * // Request OTP
 * await auth.requestOTP({ identifier: 'user@example.com', type: 'email' });
 *
 * // Sign in with OTP
 * const result = await auth.signIn({
 *   provider: 'otp',
 *   identifier: 'user@example.com',
 *   credential: '123456',
 *   data: { type: 'email' },
 * });
 * ```
 */

import type { ParsAuthConfig } from './config.js';
import { ParsAuthEngine, createAuthEngine } from './core/index.js';

// ============================================
// MAIN EXPORTS
// ============================================

/**
 * Create a Pars Auth instance
 *
 * @param config - Auth configuration
 * @returns ParsAuth instance (must call initialize() before use)
 *
 * @example
 * ```typescript
 * const auth = createAuth({
 *   secret: 'your-secret-key',
 *   adapter: drizzleAdapter(db),
 *   providers: {
 *     otp: {
 *       email: {
 *         send: async (to, code) => sendEmail(to, code),
 *       },
 *     },
 *   },
 * });
 *
 * await auth.initialize();
 * ```
 */
export function createAuth(config: ParsAuthConfig): ParsAuthEngine {
  return createAuthEngine(config);
}

// Re-export the auth engine class
export { ParsAuthEngine } from './core/index.js';

// ============================================
// CONFIG EXPORTS
// ============================================

export {
  type ParsAuthConfig,
  type SessionConfig,
  type JwtConfig,
  type CookieConfig,
  type CsrfConfig,
  type TenantConfig,
  type TenantResolutionStrategy,
  type OtpConfig,
  type MagicLinkConfig,
  type TotpConfig,
  type WebAuthnConfig,
  type PasswordConfig,
  type OAuthProviderConfig,
  type SecurityConfig,
  type AuthCallbacks,
  type AuthAdapter,
  type AdapterUser,
  type AdapterSession,
  type AdapterAuthMethod,
  type AdapterTenant,
  type AdapterMembership,
  type CreateUserInput,
  type CreateSessionInput,
  type CreateAuthMethodInput,
  type CreateMembershipInput,
  defaultConfig,
  mergeConfig,
  validateConfig,
} from './config.js';

// ============================================
// CORE EXPORTS
// ============================================

export {
  type AuthContext,
  type SignInInput,
  type SignInResult,
  type SignUpInput,
  type SignUpResult,
  type VerifyTokenResult,
  type RefreshTokenResult,
  type SessionInfo,
} from './core/index.js';

// ============================================
// MULTI-TENANT EXPORTS
// ============================================

// Tenant Resolution
export {
  TenantResolver,
  MultiStrategyTenantResolver,
  createTenantResolver,
  createMultiStrategyResolver,
  type TenantResolverConfig,
  type TenantResolutionResult,
} from './core/index.js';

// Tenant Management
export {
  TenantManager,
  createTenantManager,
  type CreateTenantInput,
  type UpdateTenantInput,
  type AddMemberInput,
  type UpdateMemberInput,
  type TenantWithMembers,
  type UserTenantMembership,
} from './core/index.js';

// Invitation System
export {
  InvitationService,
  createInvitationService,
  type InvitationConfig,
  type InvitationRecord,
  type SendInvitationInput,
  type SendInvitationResult,
  type AcceptInvitationInput,
  type AcceptInvitationResult,
  type InvitationStatusResult,
} from './core/index.js';

// ============================================
// PROVIDER EXPORTS
// ============================================

export {
  ProviderRegistry,
  type AuthProvider,
  type ProviderType,
  type ProviderInfo,
  type AuthInput,
  type AuthResult,
  type VerifyInput,
  type VerifyResult,
  type OAuthProvider,
  type OAuthUserInfo,
  type TwoFactorProvider,
  type TwoFactorSetupResult,
} from './providers/index.js';

// OTP Provider
export {
  OTPProvider,
  OTPManager,
  createOTPProvider,
  createOTPManager,
  type RequestOTPInput,
  type RequestOTPResult,
  type OTPConfig,
} from './providers/otp/index.js';

// OTP Manager types (from otp-manager)
export type {
  OTPRecord,
  StoreOTPResult,
  VerifyOTPResult,
  RateLimitCheck,
} from './providers/otp/otp-manager.js';

// OAuth Provider
export {
  OAuthManager,
  GoogleProvider,
  GitHubProvider,
  MicrosoftProvider,
  AppleProvider,
  createOAuthManager,
  generatePKCE,
  generateState,
  type OAuthConfig,
  type OAuthFlowResult,
  type OAuthCallbackResult,
  type OAuthUserInfo as OAuthUser,
  type OAuthTokens,
  type OAuthState,
  type OAuthProviderName,
  type GoogleConfig,
  type GitHubConfig,
  type MicrosoftConfig,
  type AppleConfig,
} from './providers/oauth/index.js';

// Magic Link Provider
export {
  MagicLinkProvider,
  createMagicLinkProvider,
  type MagicLinkConfig as MagicLinkProviderConfig,
  type SendMagicLinkResult,
  type VerifyMagicLinkResult,
} from './providers/magic-link/index.js';

// TOTP Provider (2FA)
export {
  TOTPProvider,
  createTOTPProvider,
  type TOTPConfig as TOTPProviderConfig,
  type TOTPSetupData,
  type TOTPVerifyResult,
} from './providers/totp/index.js';

// WebAuthn Provider (Passkeys)
export {
  WebAuthnProvider,
  createWebAuthnProvider,
  type WebAuthnConfig as WebAuthnProviderConfig,
  type RegistrationOptions,
  type AuthenticationOptions,
  type WebAuthnCredential,
  type ClientDataJSON,
  type AuthenticatorData,
} from './providers/webauthn/index.js';

// Password Provider (DISABLED BY DEFAULT)
export {
  PasswordProvider,
  createPasswordProvider,
  type PasswordConfig as PasswordProviderConfig,
  type PasswordValidationResult,
  type PasswordStrength,
} from './providers/password/index.js';

// ============================================
// SESSION EXPORTS
// ============================================

export {
  JwtManager,
  JwtError,
  SessionBlocklist,
  TokenBlocklist,
  createJwtManager,
  createSessionBlocklist,
  createTokenBlocklist,
  extractBearerToken,
  parseDuration,
  type JwtConfig as JwtManagerConfig,
  type JwtPayload,
  type TokenPair,
  type KeyRotationResult,
  type BlocklistConfig,
} from './session/index.js';

// ============================================
// STORAGE EXPORTS
// ============================================

export {
  createStorage,
  createStorageSync,
  MemoryStorage,
  createMemoryStorage,
  StorageKeys,
  type KVStorage,
  type StorageType,
  type StorageConfig,
  type RedisConfig,
  type CloudflareKVConfig,
  type DenoKVConfig,
  type MemoryConfig,
} from './storage/index.js';

// ============================================
// SECURITY EXPORTS
// ============================================

export {
  RateLimiter,
  createRateLimiter,
  RateLimitPresets,
  CsrfManager,
  createCsrfManager,
  CsrfUtils,
  LockoutManager,
  createLockoutManager,
  DefaultLockoutConfig,
  type RateLimitConfig,
  type RateLimitResult,
  type CsrfConfig as CsrfManagerConfig,
  type CsrfTokenPair,
  type LockoutConfig,
  type LockoutStatus,
  // Authorization
  AuthorizationGuard,
  createAuthorizationGuard,
  authorize,
  Permissions,
  Roles,
  type AuthorizationContext,
  type TenantMembershipInfo,
  type AuthorizationResult,
  type AuthorizationRequirements,
  type PermissionPattern,
} from './security/index.js';

// ============================================
// UTILITY EXPORTS
// ============================================

export {
  detectRuntime,
  isNode,
  isDeno,
  isCloudflare,
  isBun,
  isEdge,
  getEnv,
  type Runtime,
} from './utils/runtime.js';

// Crypto utilities
export {
  generateRandomHex,
  generateRandomBase64Url,
  randomInt,
  sha256,
  sha256Hex,
  timingSafeEqual,
  timingSafeEqualBytes,
  base64UrlEncode,
  base64UrlDecode,
  hexToBytes,
  bytesToHex,
} from './utils/crypto.js';

// ============================================
// ADAPTER EXPORTS
// ============================================

export {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  createAuthRoutes,
  createHonoAuth,
  createAuthCookies,
  createLogoutCookies,
  // Authorization middleware helpers
  requireRole,
  requirePermission,
  requireAnyPermission,
  requireTenant,
  requireTenantAccess,
  requireAdmin,
  requireOwnerOrPermission,
  requireAll,
  requireAny,
  type AuthVariables,
  type HonoAdapterConfig,
  type AuthContext as AdapterAuthContext,
  type CookieOptions,
  type AuthResponse,
} from './adapters/index.js';

// Drizzle Adapter
export {
  createDrizzleAdapter,
  type DrizzleAdapterConfig,
  type DrizzleAuthSchema,
  type DrizzleDatabase,
  type DrizzleUser,
  type DrizzleSession,
  type DrizzleAuthMethod,
  type DrizzleTenant,
  type DrizzleTenantMembership,
  type DrizzleRole,
  type DrizzleEmailVerificationToken,
} from './adapters/drizzle/index.js';

// ============================================
// SERVICES EXPORTS
// ============================================

// Email Service
export {
  EmailService,
  createEmailService,
  ResendEmailProvider,
  createResendProvider,
  type EmailProvider,
  type EmailOptions,
  type EmailResult,
  type EmailServiceConfig,
  type OTPEmailOptions,
  type VerificationEmailOptions,
  type WelcomeEmailOptions,
  type MagicLinkEmailOptions,
  type PasswordResetEmailOptions,
  type InvitationEmailOptions,
  type EmailAttachment,
} from './services/email/index.js';

// SMS Service
export {
  SMSService,
  createSMSService,
  NetGSMProvider,
  createNetGSMProvider,
  type SMSProvider,
  type SMSOptions,
  type SMSResult,
  type SMSServiceConfig,
  type OTPSMSOptions,
  type NetGSMConfig,
} from './services/sms/index.js';

// Email Verification Service
export {
  EmailVerificationService,
  createEmailVerificationService,
  type EmailVerificationConfig,
  type RequestVerificationResult,
  type VerifyEmailResult,
  type VerificationStatus,
} from './services/email-verification/index.js';
