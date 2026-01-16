/**
 * Security Module
 * Rate limiting, CSRF protection, and account lockout
 */

// Rate Limiter
export {
  RateLimiter,
  createRateLimiter,
  RateLimitPresets,
  type RateLimitConfig,
  type RateLimitResult,
} from './rate-limiter.js';

// CSRF Protection
export {
  CsrfManager,
  createCsrfManager,
  CsrfUtils,
  type CsrfConfig,
  type CsrfTokenPair,
} from './csrf.js';

// Account Lockout
export {
  LockoutManager,
  createLockoutManager,
  DefaultLockoutConfig,
  type LockoutConfig,
  type LockoutStatus,
} from './lockout.js';

// Authorization & Access Control
export {
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
} from './authorization.js';
