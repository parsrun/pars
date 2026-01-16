/**
 * @parsrun/types - Auth Schemas
 * Authentication and authorization validation schemas
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
export type User = typeof user.infer;
export type AuthMethod = typeof authMethod.infer;
export type Session = typeof session.infer;
export type TenantMembership = typeof tenantMembership.infer;

// OTP types
export type RequestOTPRequest = typeof requestOTPRequest.infer;
export type RequestOTPResponse = typeof requestOTPResponse.infer;
export type VerifyOTPRequest = typeof verifyOTPRequest.infer;
export type ResendOTPRequest = typeof resendOTPRequest.infer;

// Login types
export type LoginResponseData = typeof loginResponseData.infer;
export type LoginResponse = typeof loginResponse.infer;

// Current user types
export type CurrentUserResponseData = typeof currentUserResponseData.infer;
export type CurrentUserResponse = typeof currentUserResponse.infer;

// Token types
export type RefreshTokenRequest = typeof refreshTokenRequest.infer;
export type TokenInfo = typeof tokenInfo.infer;
export type JwtPayload = typeof jwtPayload.infer;

// RBAC types
export type Permission = typeof permission.infer;
export type Role = typeof role.infer;
export type PermissionCheck = typeof permissionCheck.infer;

// Session management types
export type LogoutRequest = typeof logoutRequest.infer;
export type RevokeSessionRequest = typeof revokeSessionRequest.infer;
export type RevokeAllSessionsRequest = typeof revokeAllSessionsRequest.infer;
export type RevokeAllSessionsResponse = typeof revokeAllSessionsResponse.infer;

// Email verification types
export type SendVerificationEmailRequest = typeof sendVerificationEmailRequest.infer;
export type VerifyEmailRequest = typeof verifyEmailRequest.infer;
export type CheckVerificationStatusRequest = typeof checkVerificationStatusRequest.infer;
export type CheckVerificationStatusResponse = typeof checkVerificationStatusResponse.infer;

// CSRF types
export type CSRFTokenRequest = typeof csrfTokenRequest.infer;

// Config types
export type SessionConfig = typeof sessionConfig.infer;
export type JwtConfig = typeof jwtConfig.infer;
export type CookieConfig = typeof cookieConfig.infer;
export type CsrfConfig = typeof csrfConfig.infer;
export type RateLimitConfig = typeof rateLimitConfig.infer;
export type LockoutConfig = typeof lockoutConfig.infer;
export type SecurityConfig = typeof securityConfig.infer;
export type TenantConfig = typeof tenantConfig.infer;
export type OAuthProviderConfig = typeof oauthProviderConfig.infer;
export type OtpEmailConfig = typeof otpEmailConfig.infer;
export type OtpSmsConfig = typeof otpSmsConfig.infer;
export type OtpConfig = typeof otpConfig.infer;
export type MagicLinkConfig = typeof magicLinkConfig.infer;
export type TotpConfig = typeof totpConfig.infer;
export type WebAuthnConfig = typeof webauthnConfig.infer;
export type PasswordConfig = typeof passwordConfig.infer;
export type OAuthProvidersConfig = typeof oauthProvidersConfig.infer;
export type ProvidersConfig = typeof providersConfig.infer;
export type StorageConfig = typeof storageConfig.infer;
export type ParsAuthConfig = typeof parsAuthConfig.infer;
