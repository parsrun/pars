/**
 * @module
 * Error classes for the Pars framework.
 * Provides typed errors for auth, validation, rate limiting, and more.
 *
 * @example
 * ```typescript
 * import { NotFoundError, ValidationError, UnauthorizedError } from '@parsrun/core';
 *
 * // Throw typed errors
 * throw new NotFoundError('User');
 * throw new ValidationError('Invalid input', [{ field: 'email', message: 'Invalid format' }]);
 * throw new UnauthorizedError('Token expired');
 * ```
 */

/**
 * Base error class for all Pars framework errors.
 * Includes error code, HTTP status code, and optional details.
 *
 * @example
 * ```typescript
 * throw new ParsError('Something went wrong', 'CUSTOM_ERROR', 500, { extra: 'info' });
 * ```
 */
export class ParsError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ParsError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details ?? undefined;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// ============================================
// AUTH ERRORS
// ============================================

/** Base class for authentication-related errors (HTTP 401/403) */
export class AuthError extends ParsError {
  constructor(
    message: string,
    code: string = "AUTH_ERROR",
    statusCode: number = 401,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, details);
    this.name = "AuthError";
  }
}

/** User is not authenticated (HTTP 401) */
export class UnauthorizedError extends AuthError {
  constructor(message: string = "Unauthorized", details?: Record<string, unknown>) {
    super(message, "UNAUTHORIZED", 401, details);
    this.name = "UnauthorizedError";
  }
}

/** User lacks permission for the requested action (HTTP 403) */
export class ForbiddenError extends AuthError {
  constructor(message: string = "Forbidden", details?: Record<string, unknown>) {
    super(message, "FORBIDDEN", 403, details);
    this.name = "ForbiddenError";
  }
}

/**
 * Credentials (username/password, API key, etc.) are invalid (HTTP 401).
 * Thrown during authentication when credentials don't match.
 */
export class InvalidCredentialsError extends AuthError {
  constructor(message: string = "Invalid credentials", details?: Record<string, unknown>) {
    super(message, "INVALID_CREDENTIALS", 401, details);
    this.name = "InvalidCredentialsError";
  }
}

/**
 * User session has expired (HTTP 401).
 * User needs to re-authenticate to continue.
 */
export class SessionExpiredError extends AuthError {
  constructor(message: string = "Session expired", details?: Record<string, unknown>) {
    super(message, "SESSION_EXPIRED", 401, details);
    this.name = "SessionExpiredError";
  }
}

/**
 * Two-factor authentication is required to complete login (HTTP 403).
 * Contains a challengeId that should be used to submit the 2FA code.
 */
export class TwoFactorRequiredError extends AuthError {
  constructor(
    message: string = "Two-factor authentication required",
    /** Unique identifier for the 2FA challenge */
    public readonly challengeId: string,
    details?: Record<string, unknown>
  ) {
    super(message, "TWO_FACTOR_REQUIRED", 403, { ...details, challengeId });
    this.name = "TwoFactorRequiredError";
  }
}

/**
 * Account has been locked due to too many failed attempts or admin action (HTTP 423).
 * May include a lockedUntil timestamp indicating when the account will be unlocked.
 */
export class AccountLockedError extends AuthError {
  constructor(
    message: string = "Account locked",
    /** When the account will be automatically unlocked (if applicable) */
    public readonly lockedUntil?: Date,
    details?: Record<string, unknown>
  ) {
    super(message, "ACCOUNT_LOCKED", 423, { ...details, lockedUntil });
    this.name = "AccountLockedError";
  }
}

// ============================================
// TENANT ERRORS
// ============================================

/** Base class for tenant-related errors */
export class TenantError extends ParsError {
  constructor(
    message: string,
    code: string = "TENANT_ERROR",
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, details);
    this.name = "TenantError";
  }
}

/** Tenant does not exist or user does not have access to it (HTTP 404) */
export class TenantNotFoundError extends TenantError {
  constructor(message: string = "Tenant not found", details?: Record<string, unknown>) {
    super(message, "TENANT_NOT_FOUND", 404, details);
    this.name = "TenantNotFoundError";
  }
}

/** Tenant has been suspended and access is denied (HTTP 403) */
export class TenantSuspendedError extends TenantError {
  constructor(message: string = "Tenant suspended", details?: Record<string, unknown>) {
    super(message, "TENANT_SUSPENDED", 403, details);
    this.name = "TenantSuspendedError";
  }
}

/** Base class for membership-related errors */
export class MembershipError extends TenantError {
  constructor(
    message: string = "Membership error",
    code: string = "MEMBERSHIP_ERROR",
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message, code, statusCode, details);
    this.name = "MembershipError";
  }
}

/** User is not a member of the specified tenant (HTTP 404) */
export class MembershipNotFoundError extends MembershipError {
  constructor(message: string = "Membership not found", details?: Record<string, unknown>) {
    super(message, "MEMBERSHIP_NOT_FOUND", 404, details);
    this.name = "MembershipNotFoundError";
  }
}

/** User's membership in the tenant has expired (HTTP 403) */
export class MembershipExpiredError extends MembershipError {
  constructor(message: string = "Membership expired", details?: Record<string, unknown>) {
    super(message, "MEMBERSHIP_EXPIRED", 403, details);
    this.name = "MembershipExpiredError";
  }
}

// ============================================
// VALIDATION ERRORS
// ============================================

/** Request validation failed with one or more field errors (HTTP 400) */
export class ValidationError extends ParsError {
  constructor(
    message: string = "Validation failed",
    public readonly errors: ValidationErrorDetail[],
    details?: Record<string, unknown>
  ) {
    super(message, "VALIDATION_ERROR", 400, { ...details, errors });
    this.name = "ValidationError";
  }
}

/** Details about a single validation error */
export interface ValidationErrorDetail {
  /** Field path that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Optional error code for programmatic handling */
  code?: string;
}

// ============================================
// RATE LIMIT ERRORS
// ============================================

/** Too many requests - rate limit exceeded (HTTP 429) */
export class RateLimitError extends ParsError {
  constructor(
    message: string = "Rate limit exceeded",
    public readonly retryAfter?: number,
    details?: Record<string, unknown>
  ) {
    super(message, "RATE_LIMIT_EXCEEDED", 429, { ...details, retryAfter });
    this.name = "RateLimitError";
  }
}

// ============================================
// NOT FOUND ERRORS
// ============================================

/** Requested resource was not found (HTTP 404) */
export class NotFoundError extends ParsError {
  constructor(
    resource: string = "Resource",
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(message ?? `${resource} not found`, "NOT_FOUND", 404, { ...details, resource });
    this.name = "NotFoundError";
  }
}

// ============================================
// CONFLICT ERRORS
// ============================================

/** Resource conflict, such as duplicate entry (HTTP 409) */
export class ConflictError extends ParsError {
  constructor(message: string = "Conflict", details?: Record<string, unknown>) {
    super(message, "CONFLICT", 409, details);
    this.name = "ConflictError";
  }
}

/**
 * A duplicate resource already exists (HTTP 409).
 * Used when attempting to create a resource that violates a uniqueness constraint.
 */
export class DuplicateError extends ConflictError {
  constructor(
    /** The type of resource that already exists */
    resource: string = "Resource",
    /** The field that caused the conflict (e.g., 'email', 'slug') */
    field?: string,
    details?: Record<string, unknown>
  ) {
    super(`${resource} already exists${field ? ` with this ${field}` : ""}`, {
      ...details,
      resource,
      field,
    });
    this.name = "DuplicateError";
  }
}
