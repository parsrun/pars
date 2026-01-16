/**
 * @parsrun/auth - ArkType Schemas
 * Re-exports auth schemas from @parsrun/types
 */

// Re-export everything from @parsrun/types auth module
export {
  // ArkType re-export
  type,

  // Common schemas
  uuid,
  timestamp,
  email,
  status,
  sessionStatus,

  // Validation helpers
  validateWithSchema,
  safeValidate,
  isValid,
  formatErrors,

  // User schemas
  user,
  authMethod,

  // Session schemas
  session,

  // Tenant schemas
  tenantMembership,

  // OTP schemas
  requestOTPRequest,
  requestOTPResponse,
  verifyOTPRequest,
  resendOTPRequest,

  // Login response schemas
  loginResponseData,
  loginResponse,

  // Current user schemas
  currentUserResponseData,
  currentUserResponse,

  // Token schemas
  refreshTokenRequest,
  tokenInfo,
  jwtPayload,

  // RBAC schemas
  permission,
  role,
  permissionCheck,

  // Session management schemas
  logoutRequest,
  revokeSessionRequest,
  revokeAllSessionsRequest,
  revokeAllSessionsResponse,

  // Email verification schemas
  sendVerificationEmailRequest,
  verifyEmailRequest,
  checkVerificationStatusRequest,
  checkVerificationStatusResponse,

  // CSRF schemas
  csrfTokenRequest,

  // Config schemas
  sessionConfig,
  jwtConfig,
  cookieConfig,
  csrfConfig,
  rateLimitConfig,
  lockoutConfig,
  securityConfig,
  tenantConfig,
  oauthProviderConfig,
  otpEmailConfig,
  otpSmsConfig,
  otpConfig,
  magicLinkConfig,
  totpConfig,
  webauthnConfig,
  passwordConfig,
  oauthProvidersConfig,
  providersConfig,
  storageConfig,
  parsAuthConfig,

  // Type exports
  type UUID,
  type Timestamp,
  type Email,
  type Status,
  type SessionStatus,
  type User,
  type AuthMethod,
  type Session,
  type TenantMembership,
  type RequestOTPRequest,
  type RequestOTPResponse,
  type VerifyOTPRequest,
  type ResendOTPRequest,
  type LoginResponseData,
  type LoginResponse,
  type CurrentUserResponseData,
  type CurrentUserResponse,
  type RefreshTokenRequest,
  type TokenInfo,
  type JwtPayload,
  type Permission,
  type Role,
  type PermissionCheck,
  type LogoutRequest,
  type RevokeSessionRequest,
  type RevokeAllSessionsRequest,
  type RevokeAllSessionsResponse,
  type SendVerificationEmailRequest,
  type VerifyEmailRequest,
  type CheckVerificationStatusRequest,
  type CheckVerificationStatusResponse,
  type CSRFTokenRequest,
  type SessionConfig,
  type JwtConfig,
  type CookieConfig,
  type CsrfConfig,
  type RateLimitConfig,
  type LockoutConfig,
  type SecurityConfig,
  type TenantConfig,
  type OAuthProviderConfig,
  type OtpEmailConfig,
  type OtpSmsConfig,
  type OtpConfig,
  type MagicLinkConfig,
  type TotpConfig,
  type WebAuthnConfig,
  type PasswordConfig,
  type OAuthProvidersConfig,
  type ProvidersConfig,
  type StorageConfig,
  type ParsAuthConfig,
} from "@parsrun/types";

// Legacy alias for backward compatibility
export { parsAuthConfig as ParsAuthConfigSchema } from "@parsrun/types";
export type { ParsAuthConfig as ParsAuthConfigInput } from "@parsrun/types";

/**
 * Validate auth config and return typed result
 */
export function validateAuthConfig(config: unknown): import("@parsrun/types").ParsAuthConfig {
  const { validateWithSchema, parsAuthConfig } = require("@parsrun/types");
  return validateWithSchema(parsAuthConfig, config);
}

/**
 * Validate sign in input
 */
export function validateSignInInput(input: unknown): import("@parsrun/types").RequestOTPRequest {
  const { validateWithSchema, requestOTPRequest } = require("@parsrun/types");
  return validateWithSchema(requestOTPRequest, input);
}

/**
 * Validate OTP verification input
 */
export function validateVerifyOtpInput(input: unknown): import("@parsrun/types").VerifyOTPRequest {
  const { validateWithSchema, verifyOTPRequest } = require("@parsrun/types");
  return validateWithSchema(verifyOTPRequest, input);
}
