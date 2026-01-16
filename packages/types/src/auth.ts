/**
 * @module
 * Authentication and authorization validation schemas.
 * Includes user, session, JWT, RBAC, and OAuth configuration types.
 *
 * @example
 * ```typescript
 * import { user, session, jwtPayload, type User } from '@parsrun/types';
 *
 * // Validate user data
 * const userData = user(input);
 *
 * // Type-safe user object
 * const currentUser: User = { id: '...', status: 'active', ... };
 * ```
 */

import { type } from "arktype";
import { status, sessionStatus, timestamp, uuid } from "./common";

// ============================================================================
// User Schemas
// ============================================================================

/** User entity */
export const user = type({
  id: uuid,
  "displayName?": "string",
  twoFactorEnabled: "boolean",
  "twoFactorSecret?": "string",
  status,
  insertedAt: timestamp,
  updatedAt: timestamp,
  "deletedAt?": timestamp,
});

/** Auth method (email, phone, OAuth providers) */
export const authMethod = type({
  id: uuid,
  userId: uuid,
  provider: "'email' | 'phone' | 'google' | 'github' | 'microsoft' | 'apple'",
  providerId: "string >= 1",
  verified: "boolean",
  "metadata?": "object",
  insertedAt: timestamp,
  updatedAt: timestamp,
  "deletedAt?": timestamp,
});

// ============================================================================
// Session Schemas
// ============================================================================

/** Session entity */
export const session = type({
  id: uuid,
  userId: uuid,
  "authMethodId?": uuid,
  "currentTenantId?": uuid,
  "refreshTokenHash?": "string",
  csrfTokenHash: "string",
  expiresAt: timestamp,
  "refreshExpiresAt?": timestamp,
  "deviceType?": "'mobile' | 'desktop' | 'tablet' | 'api'",
  "deviceName?": "string",
  "userAgent?": "string",
  "ipAddress?": "string",
  "locationData?": "object",
  "deviceFingerprint?": "string",
  status: sessionStatus,
  lastActivityAt: timestamp,
  "revokedAt?": timestamp,
  "revokedReason?":
    "'user_logout' | 'admin_revoke' | 'security_breach' | 'suspicious_activity'",
  insertedAt: timestamp,
  updatedAt: timestamp,
  "deletedAt?": timestamp,
});

// ============================================================================
// Tenant & Membership Schemas
// ============================================================================

/** Tenant membership */
export const tenantMembership = type({
  id: uuid,
  userId: uuid,
  tenantId: uuid,
  roleId: uuid,
  status: "'active' | 'inactive' | 'invited' | 'suspended'",
  permissions: "object",
  accessLevel: "'full' | 'limited' | 'read_only'",
  resourceRestrictions: "object",
  "ipRestrictions?": "object",
  "timeRestrictions?": "object",
  "expiresAt?": timestamp,
  "invitedBy?": uuid,
  "invitedAt?": timestamp,
  "joinedAt?": timestamp,
  "lastLoginAt?": timestamp,
  insertedAt: timestamp,
  updatedAt: timestamp,
  "deletedAt?": timestamp,
});

// ============================================================================
// OTP Schemas
// ============================================================================

/** Request OTP (email/phone) */
export const requestOTPRequest = type({
  "email?": "string.email",
  "phone?": "string >= 10",
  "tenantId?": uuid,
});

/** OTP request response */
export const requestOTPResponse = type({
  success: "boolean",
  message: "string",
  "expiresAt?": timestamp,
  "requiresTenantSelection?": "boolean",
  "isNewUser?": "boolean",
  "defaultTenantId?": uuid,
  "defaultTenantName?": "string",
  "selectedTenantId?": uuid,
  "selectedTenantName?": "string",
  "tenants?": type({
    id: uuid,
    name: "string",
    role: "string",
  }).array(),
});

/** Verify OTP */
export const verifyOTPRequest = type({
  "email?": "string.email",
  "phone?": "string >= 10",
  code: "string >= 6",
  "tenantId?": uuid,
});

/** Resend OTP */
export const resendOTPRequest = type({
  "email?": "string.email",
  "phone?": "string >= 10",
});

// ============================================================================
// Login Response Schemas
// ============================================================================

/** Login response data */
export const loginResponseData = type({
  user,
  session: {
    accessToken: "string",
    expiresAt: timestamp,
    csrfToken: "string",
  },
  "refreshToken?": "string",
  authMethod: {
    id: uuid,
    provider: "'email' | 'phone' | 'google' | 'github' | 'microsoft' | 'apple'",
    providerId: "string >= 1",
    verified: "boolean",
    "metadata?": "object",
  },
  "tenantMemberships?": tenantMembership.array(),
  isNewUser: "boolean",
});

/** Login response */
export const loginResponse = type({
  success: "boolean",
  data: loginResponseData,
  "message?": "string",
});

// ============================================================================
// Current User Schemas
// ============================================================================

/** Current user response data */
export const currentUserResponseData = type({
  user,
  "authMethod?": {
    id: uuid,
    provider: "'email' | 'phone' | 'google' | 'github' | 'microsoft' | 'apple'",
    providerId: "string >= 1",
    verified: "boolean",
    "metadata?": "object",
  },
  tenantMemberships: tenantMembership.array(),
  roles: type({
    id: uuid,
    name: "string",
    "description?": "string",
  }).array(),
  permissions: "string[]",
  currentTenant: uuid,
});

/** Current user response */
export const currentUserResponse = type({
  success: "boolean",
  data: currentUserResponseData,
  "message?": "string",
});

// ============================================================================
// Token Schemas
// ============================================================================

/** Refresh token request */
export const refreshTokenRequest = type({
  refreshToken: "string",
});

/** Token info (for client storage) */
export const tokenInfo = type({
  accessToken: "string",
  "refreshToken?": "string",
  expiresAt: "Date",
  csrfToken: "string",
  "tenantId?": uuid,
});

/** JWT payload */
export const jwtPayload = type({
  sub: uuid,
  tenantId: uuid,
  "sessionId?": uuid,
  "roles?": "string[]",
  "permissions?": "string[]",
  iat: "number",
  exp: "number",
  "aud?": "string",
  "iss?": "string",
});

// ============================================================================
// RBAC Schemas
// ============================================================================

/** Permission entity */
export const permission = type({
  id: uuid,
  name: "string >= 1",
  "description?": "string",
  resource: "string >= 1",
  action: "'create' | 'read' | 'update' | 'delete' | 'list' | 'manage'",
  scope: "'tenant' | 'global' | 'own'",
  isSystem: "boolean",
  insertedAt: timestamp,
  updatedAt: timestamp,
});

/** Role entity */
export const role = type({
  id: uuid,
  tenantId: uuid,
  name: "string >= 1",
  "description?": "string",
  isSystem: "boolean",
  isActive: "boolean",
  "color?": "string",
  insertedAt: timestamp,
  updatedAt: timestamp,
  "deletedAt?": timestamp,
});

/** Permission check request */
export const permissionCheck = type({
  resource: "string >= 1",
  action: "string >= 1",
  "scope?": "'tenant' | 'global' | 'own'",
  "resourceId?": "string",
});

// ============================================================================
// Session Management Schemas
// ============================================================================

/** Logout request */
export const logoutRequest = type({
  "refreshToken?": "string",
  allDevices: "boolean",
});

/** Revoke session request */
export const revokeSessionRequest = type({
  "reason?":
    "'user_logout' | 'admin_revoke' | 'security_breach' | 'suspicious_activity'",
});

/** Revoke all sessions request */
export const revokeAllSessionsRequest = type({
  "reason?":
    "'user_logout' | 'admin_revoke' | 'security_breach' | 'suspicious_activity'",
  "excludeCurrent?": "boolean",
});

/** Revoke all sessions response */
export const revokeAllSessionsResponse = type({
  success: "boolean",
  message: "string",
  revokedCount: "number",
});

// ============================================================================
// Email Verification Schemas
// ============================================================================

/** Send verification email request */
export const sendVerificationEmailRequest = type({
  email: "string.email",
});

/** Verify email request */
export const verifyEmailRequest = type({
  token: "string >= 1",
});

/** Check verification status */
export const checkVerificationStatusRequest = type({
  email: "string.email",
});

/** Check verification status response */
export const checkVerificationStatusResponse = type({
  success: "boolean",
  verified: "boolean",
  message: "string",
  "sentAt?": timestamp,
  "expiresAt?": timestamp,
});

// ============================================================================
// CSRF Schemas
// ============================================================================

/** CSRF token validation */
export const csrfTokenRequest = type({
  csrfToken: "string >= 1",
});

// ============================================================================
// Config Schemas (for @parsrun/auth)
// ============================================================================

/** Session config */
export const sessionConfig = type({
  "accessTokenExpiry?": "number > 0",
  "refreshTokenExpiry?": "number > 0",
  "slidingWindow?": "boolean",
  "maxSessions?": "number > 0",
  "invalidateOnPasswordChange?": "boolean",
});

/** JWT config */
export const jwtConfig = type({
  "algorithm?":
    "'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512'",
  "issuer?": "string",
  "audience?": "string | string[]",
});

/** Cookie config */
export const cookieConfig = type({
  "prefix?": "string",
  "domain?": "string",
  "path?": "string",
  "secure?": "boolean",
  "sameSite?": "'strict' | 'lax' | 'none'",
  "httpOnly?": "boolean",
});

/** CSRF config */
export const csrfConfig = type({
  "enabled?": "boolean",
  "headerName?": "string",
  "cookieName?": "string",
});

/** Rate limit config */
export const rateLimitConfig = type({
  "enabled?": "boolean",
  "loginAttempts?": "number > 0",
  "windowSize?": "number > 0",
});

/** Lockout config */
export const lockoutConfig = type({
  "enabled?": "boolean",
  "maxAttempts?": "number > 0",
  "duration?": "number > 0",
});

/** Security config */
export const securityConfig = type({
  "rateLimit?": rateLimitConfig,
  "lockout?": lockoutConfig,
  "csrf?": csrfConfig,
});

/** Tenant config */
export const tenantConfig = type({
  "enabled?": "boolean",
  "strategy?": "'subdomain' | 'header' | 'path' | 'query' | 'custom'",
  "headerName?": "string",
  "resolver?": "Function",
});

/** OAuth provider config */
export const oauthProviderConfig = type({
  "enabled?": "boolean",
  clientId: "string",
  clientSecret: "string",
  "scopes?": "string[]",
  "callbackUrl?": "string",
});

/** OTP email config */
export const otpEmailConfig = type({
  "enabled?": "boolean",
  "expiresIn?": "number > 0",
  "length?": "number >= 4",
  "maxAttempts?": "number > 0",
  "rateLimit?": "number > 0",
  "rateLimitWindow?": "number > 0",
  send: "Function",
});

/** OTP SMS config */
export const otpSmsConfig = type({
  "enabled?": "boolean",
  "expiresIn?": "number > 0",
  "length?": "number >= 4",
  "maxAttempts?": "number > 0",
  "rateLimit?": "number > 0",
  "rateLimitWindow?": "number > 0",
  send: "Function",
});

/** OTP config */
export const otpConfig = type({
  "enabled?": "boolean",
  "email?": otpEmailConfig,
  "sms?": otpSmsConfig,
});

/** Magic link config */
export const magicLinkConfig = type({
  "enabled?": "boolean",
  "expiresIn?": "number > 0",
  send: "Function",
});

/** TOTP config */
export const totpConfig = type({
  "enabled?": "boolean",
  "issuer?": "string",
  "backupCodesCount?": "number > 0",
});

/** WebAuthn config */
export const webauthnConfig = type({
  "enabled?": "boolean",
  rpName: "string",
  rpId: "string",
  "origins?": "string[]",
});

/** Password config */
export const passwordConfig = type({
  "enabled?": "boolean",
  "minLength?": "number >= 6",
  "requireUppercase?": "boolean",
  "requireLowercase?": "boolean",
  "requireNumbers?": "boolean",
  "requireSymbols?": "boolean",
  "checkCommonPasswords?": "boolean",
});

/** OAuth providers config */
export const oauthProvidersConfig = type({
  "google?": oauthProviderConfig,
  "github?": oauthProviderConfig,
  "microsoft?": oauthProviderConfig,
  "apple?": oauthProviderConfig,
  "custom?": type("Record<string, unknown>"),
});

/** Providers config */
export const providersConfig = type({
  "otp?": otpConfig,
  "magicLink?": magicLinkConfig,
  "oauth?": oauthProvidersConfig,
  "totp?": totpConfig,
  "webauthn?": webauthnConfig,
  "password?": passwordConfig,
});

/** Storage config */
export const storageConfig = type({
  "type?": "'memory' | 'redis' | 'upstash' | 'cloudflare-kv' | 'deno-kv' | 'custom'",
  "redis?": "object",
  "upstash?": "object",
  "cloudflareKv?": "object",
  "denoKv?": "object",
  "custom?": "object",
});

/** Main Pars auth config */
export const parsAuthConfig = type({
  secret: "string >= 32",
  "baseUrl?": "string",
  "storage?": storageConfig,
  "providers?": providersConfig,
  "session?": sessionConfig,
  "jwt?": jwtConfig,
  "cookies?": cookieConfig,
  "security?": securityConfig,
  "tenant?": tenantConfig,
  adapter: "object",
  "callbacks?": "object",
});

// ============================================================================
// Type Exports
// ============================================================================

// Entity types

/**
 * User entity type.
 * Represents a user account with display name, 2FA settings, and status.
 */
export type User = typeof user.infer;

/**
 * Authentication method type.
 * Represents how a user authenticates (email, phone, OAuth providers).
 */
export type AuthMethod = typeof authMethod.infer;

/**
 * Session entity type.
 * Represents an active user session with tokens, device info, and expiry.
 */
export type Session = typeof session.infer;

/**
 * Tenant membership type.
 * Represents a user's membership and role within a specific tenant.
 */
export type TenantMembership = typeof tenantMembership.infer;

// OTP types

/**
 * Request OTP request type.
 * Contains email or phone number for OTP delivery.
 */
export type RequestOTPRequest = typeof requestOTPRequest.infer;

/**
 * Request OTP response type.
 * Contains success status, expiry, and optional tenant selection info.
 */
export type RequestOTPResponse = typeof requestOTPResponse.infer;

/**
 * Verify OTP request type.
 * Contains email/phone, OTP code, and optional tenant ID.
 */
export type VerifyOTPRequest = typeof verifyOTPRequest.infer;

/**
 * Resend OTP request type.
 * Contains email or phone number to resend OTP to.
 */
export type ResendOTPRequest = typeof resendOTPRequest.infer;

// Login types

/**
 * Login response data type.
 * Contains user, session tokens, auth method, and membership info.
 */
export type LoginResponseData = typeof loginResponseData.infer;

/**
 * Login response type.
 * Wrapper containing success status and login response data.
 */
export type LoginResponse = typeof loginResponse.infer;

// Current user types

/**
 * Current user response data type.
 * Contains user details, auth method, memberships, roles, and permissions.
 */
export type CurrentUserResponseData = typeof currentUserResponseData.infer;

/**
 * Current user response type.
 * Wrapper containing success status and current user data.
 */
export type CurrentUserResponse = typeof currentUserResponse.infer;

// Token types

/**
 * Refresh token request type.
 * Contains the refresh token for obtaining new access tokens.
 */
export type RefreshTokenRequest = typeof refreshTokenRequest.infer;

/**
 * Token info type for client storage.
 * Contains access token, optional refresh token, expiry, and CSRF token.
 */
export type TokenInfo = typeof tokenInfo.infer;

/**
 * JWT payload type.
 * Contains subject (user ID), tenant ID, session ID, roles, permissions, and timing claims.
 */
export type JwtPayload = typeof jwtPayload.infer;

// RBAC types

/**
 * Permission entity type.
 * Defines an action that can be performed on a resource within a scope.
 */
export type Permission = typeof permission.infer;

/**
 * Role entity type.
 * Groups permissions together for assignment to users within a tenant.
 */
export type Role = typeof role.infer;

/**
 * Permission check request type.
 * Used to verify if a user has permission for a specific resource/action.
 */
export type PermissionCheck = typeof permissionCheck.infer;

// Session management types

/**
 * Logout request type.
 * Contains refresh token and flag for logging out all devices.
 */
export type LogoutRequest = typeof logoutRequest.infer;

/**
 * Revoke session request type.
 * Contains optional reason for session revocation.
 */
export type RevokeSessionRequest = typeof revokeSessionRequest.infer;

/**
 * Revoke all sessions request type.
 * Contains reason and option to exclude the current session.
 */
export type RevokeAllSessionsRequest = typeof revokeAllSessionsRequest.infer;

/**
 * Revoke all sessions response type.
 * Contains success status, message, and count of revoked sessions.
 */
export type RevokeAllSessionsResponse = typeof revokeAllSessionsResponse.infer;

// Email verification types

/**
 * Send verification email request type.
 * Contains the email address to send verification to.
 */
export type SendVerificationEmailRequest = typeof sendVerificationEmailRequest.infer;

/**
 * Verify email request type.
 * Contains the verification token from the email link.
 */
export type VerifyEmailRequest = typeof verifyEmailRequest.infer;

/**
 * Check verification status request type.
 * Contains email address to check verification status for.
 */
export type CheckVerificationStatusRequest = typeof checkVerificationStatusRequest.infer;

/**
 * Check verification status response type.
 * Contains verification status and optional timing information.
 */
export type CheckVerificationStatusResponse = typeof checkVerificationStatusResponse.infer;

// CSRF types

/**
 * CSRF token request type.
 * Contains the CSRF token for validation.
 */
export type CSRFTokenRequest = typeof csrfTokenRequest.infer;

// Config types

/**
 * Session configuration type.
 * Controls token expiry, sliding window, max sessions, and invalidation rules.
 */
export type SessionConfig = typeof sessionConfig.infer;

/**
 * JWT configuration type.
 * Controls algorithm, issuer, and audience for JWT tokens.
 */
export type JwtConfig = typeof jwtConfig.infer;

/**
 * Cookie configuration type.
 * Controls cookie naming, domain, path, and security settings.
 */
export type CookieConfig = typeof cookieConfig.infer;

/**
 * CSRF configuration type.
 * Controls CSRF protection settings including header and cookie names.
 */
export type CsrfConfig = typeof csrfConfig.infer;

/**
 * Rate limit configuration type.
 * Controls login attempt limits and window size.
 */
export type RateLimitConfig = typeof rateLimitConfig.infer;

/**
 * Lockout configuration type.
 * Controls account lockout after failed attempts.
 */
export type LockoutConfig = typeof lockoutConfig.infer;

/**
 * Security configuration type.
 * Groups rate limit, lockout, and CSRF settings.
 */
export type SecurityConfig = typeof securityConfig.infer;

/**
 * Tenant configuration type.
 * Controls multi-tenancy strategy and resolution method.
 */
export type TenantConfig = typeof tenantConfig.infer;

/**
 * OAuth provider configuration type.
 * Contains client credentials and callback URL for an OAuth provider.
 */
export type OAuthProviderConfig = typeof oauthProviderConfig.infer;

/**
 * OTP email configuration type.
 * Controls email OTP settings including expiry, length, and rate limits.
 */
export type OtpEmailConfig = typeof otpEmailConfig.infer;

/**
 * OTP SMS configuration type.
 * Controls SMS OTP settings including expiry, length, and rate limits.
 */
export type OtpSmsConfig = typeof otpSmsConfig.infer;

/**
 * OTP configuration type.
 * Groups email and SMS OTP settings.
 */
export type OtpConfig = typeof otpConfig.infer;

/**
 * Magic link configuration type.
 * Controls magic link expiry and send function.
 */
export type MagicLinkConfig = typeof magicLinkConfig.infer;

/**
 * TOTP configuration type.
 * Controls time-based OTP settings for 2FA including issuer and backup codes.
 */
export type TotpConfig = typeof totpConfig.infer;

/**
 * WebAuthn configuration type.
 * Controls WebAuthn/FIDO2 settings including relying party info.
 */
export type WebAuthnConfig = typeof webauthnConfig.infer;

/**
 * Password configuration type.
 * Controls password requirements including length and character requirements.
 */
export type PasswordConfig = typeof passwordConfig.infer;

/**
 * OAuth providers configuration type.
 * Maps OAuth provider names to their configurations.
 */
export type OAuthProvidersConfig = typeof oauthProvidersConfig.infer;

/**
 * Auth providers configuration type.
 * Groups all authentication provider settings.
 */
export type ProvidersConfig = typeof providersConfig.infer;

/**
 * Auth storage configuration type.
 * Controls session/token storage backend selection.
 */
export type StorageConfig = typeof storageConfig.infer;

/**
 * Main Pars auth configuration type.
 * Complete configuration object for the Pars authentication system.
 */
export type ParsAuthConfig = typeof parsAuthConfig.infer;
