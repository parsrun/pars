/**
 * @parsrun/core - Error Classes
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

export class UnauthorizedError extends AuthError {
  constructor(message: string = "Unauthorized", details?: Record<string, unknown>) {
    super(message, "UNAUTHORIZED", 401, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = "Forbidden", details?: Record<string, unknown>) {
    super(message, "FORBIDDEN", 403, details);
    this.name = "ForbiddenError";
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message: string = "Invalid credentials", details?: Record<string, unknown>) {
    super(message, "INVALID_CREDENTIALS", 401, details);
    this.name = "InvalidCredentialsError";
  }
}

export class SessionExpiredError extends AuthError {
  constructor(message: string = "Session expired", details?: Record<string, unknown>) {
    super(message, "SESSION_EXPIRED", 401, details);
    this.name = "SessionExpiredError";
  }
}

export class TwoFactorRequiredError extends AuthError {
  constructor(
    message: string = "Two-factor authentication required",
    public readonly challengeId: string,
    details?: Record<string, unknown>
  ) {
    super(message, "TWO_FACTOR_REQUIRED", 403, { ...details, challengeId });
    this.name = "TwoFactorRequiredError";
  }
}

export class AccountLockedError extends AuthError {
  constructor(
    message: string = "Account locked",
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

export class TenantNotFoundError extends TenantError {
  constructor(message: string = "Tenant not found", details?: Record<string, unknown>) {
    super(message, "TENANT_NOT_FOUND", 404, details);
    this.name = "TenantNotFoundError";
  }
}

export class TenantSuspendedError extends TenantError {
  constructor(message: string = "Tenant suspended", details?: Record<string, unknown>) {
    super(message, "TENANT_SUSPENDED", 403, details);
    this.name = "TenantSuspendedError";
  }
}

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

export class MembershipNotFoundError extends MembershipError {
  constructor(message: string = "Membership not found", details?: Record<string, unknown>) {
    super(message, "MEMBERSHIP_NOT_FOUND", 404, details);
    this.name = "MembershipNotFoundError";
  }
}

export class MembershipExpiredError extends MembershipError {
  constructor(message: string = "Membership expired", details?: Record<string, unknown>) {
    super(message, "MEMBERSHIP_EXPIRED", 403, details);
    this.name = "MembershipExpiredError";
  }
}

// ============================================
// VALIDATION ERRORS
// ============================================

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

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
}

// ============================================
// RATE LIMIT ERRORS
// ============================================

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

export class ConflictError extends ParsError {
  constructor(message: string = "Conflict", details?: Record<string, unknown>) {
    super(message, "CONFLICT", 409, details);
    this.name = "ConflictError";
  }
}

export class DuplicateError extends ConflictError {
  constructor(
    resource: string = "Resource",
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
