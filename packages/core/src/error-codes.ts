/**
 * @parsrun/core - Error Code Catalog
 * Centralized error code definitions for the entire framework
 */

/**
 * Error category for grouping and filtering
 */
export type ErrorCategory =
  | "auth"
  | "tenant"
  | "validation"
  | "resource"
  | "rate_limit"
  | "server"
  | "database"
  | "external";

/**
 * Error code definition
 */
export interface ErrorCodeDefinition {
  readonly code: string;
  readonly status: number;
  readonly category: ErrorCategory;
  readonly retryable?: boolean;
}

/**
 * Centralized error code catalog
 * All error codes used throughout the framework are defined here
 */
export const ErrorCodes = {
  // ============================================================================
  // Authentication Errors (401, 403, 423)
  // ============================================================================
  AUTH_ERROR: {
    code: "AUTH_ERROR",
    status: 401,
    category: "auth",
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    status: 401,
    category: "auth",
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: 403,
    category: "auth",
  },
  INVALID_CREDENTIALS: {
    code: "INVALID_CREDENTIALS",
    status: 401,
    category: "auth",
  },
  SESSION_EXPIRED: {
    code: "SESSION_EXPIRED",
    status: 401,
    category: "auth",
  },
  TOKEN_EXPIRED: {
    code: "TOKEN_EXPIRED",
    status: 401,
    category: "auth",
  },
  TOKEN_INVALID: {
    code: "TOKEN_INVALID",
    status: 401,
    category: "auth",
  },
  TWO_FACTOR_REQUIRED: {
    code: "TWO_FACTOR_REQUIRED",
    status: 403,
    category: "auth",
  },
  TWO_FACTOR_INVALID: {
    code: "TWO_FACTOR_INVALID",
    status: 401,
    category: "auth",
  },
  ACCOUNT_LOCKED: {
    code: "ACCOUNT_LOCKED",
    status: 423,
    category: "auth",
  },
  ACCOUNT_DISABLED: {
    code: "ACCOUNT_DISABLED",
    status: 403,
    category: "auth",
  },
  PASSWORD_RESET_REQUIRED: {
    code: "PASSWORD_RESET_REQUIRED",
    status: 403,
    category: "auth",
  },

  // ============================================================================
  // Tenant Errors (400, 403, 404)
  // ============================================================================
  TENANT_ERROR: {
    code: "TENANT_ERROR",
    status: 400,
    category: "tenant",
  },
  TENANT_NOT_FOUND: {
    code: "TENANT_NOT_FOUND",
    status: 404,
    category: "tenant",
  },
  TENANT_SUSPENDED: {
    code: "TENANT_SUSPENDED",
    status: 403,
    category: "tenant",
  },
  TENANT_LIMIT_EXCEEDED: {
    code: "TENANT_LIMIT_EXCEEDED",
    status: 403,
    category: "tenant",
  },
  MEMBERSHIP_ERROR: {
    code: "MEMBERSHIP_ERROR",
    status: 400,
    category: "tenant",
  },
  MEMBERSHIP_NOT_FOUND: {
    code: "MEMBERSHIP_NOT_FOUND",
    status: 404,
    category: "tenant",
  },
  MEMBERSHIP_EXPIRED: {
    code: "MEMBERSHIP_EXPIRED",
    status: 403,
    category: "tenant",
  },

  // ============================================================================
  // Validation Errors (400, 422)
  // ============================================================================
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    status: 400,
    category: "validation",
  },
  BAD_REQUEST: {
    code: "BAD_REQUEST",
    status: 400,
    category: "validation",
  },
  INVALID_INPUT: {
    code: "INVALID_INPUT",
    status: 422,
    category: "validation",
  },
  MISSING_REQUIRED_FIELD: {
    code: "MISSING_REQUIRED_FIELD",
    status: 400,
    category: "validation",
  },
  INVALID_FORMAT: {
    code: "INVALID_FORMAT",
    status: 400,
    category: "validation",
  },

  // ============================================================================
  // Resource Errors (404, 409, 410)
  // ============================================================================
  NOT_FOUND: {
    code: "NOT_FOUND",
    status: 404,
    category: "resource",
  },
  CONFLICT: {
    code: "CONFLICT",
    status: 409,
    category: "resource",
  },
  DUPLICATE: {
    code: "DUPLICATE",
    status: 409,
    category: "resource",
  },
  GONE: {
    code: "GONE",
    status: 410,
    category: "resource",
  },
  RESOURCE_LOCKED: {
    code: "RESOURCE_LOCKED",
    status: 423,
    category: "resource",
  },

  // ============================================================================
  // Rate Limiting (429)
  // ============================================================================
  RATE_LIMIT_EXCEEDED: {
    code: "RATE_LIMIT_EXCEEDED",
    status: 429,
    category: "rate_limit",
    retryable: true,
  },
  QUOTA_EXCEEDED: {
    code: "QUOTA_EXCEEDED",
    status: 429,
    category: "rate_limit",
  },

  // ============================================================================
  // Server Errors (500, 502, 503, 504)
  // ============================================================================
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    status: 500,
    category: "server",
  },
  BAD_GATEWAY: {
    code: "BAD_GATEWAY",
    status: 502,
    category: "server",
    retryable: true,
  },
  SERVICE_UNAVAILABLE: {
    code: "SERVICE_UNAVAILABLE",
    status: 503,
    category: "server",
    retryable: true,
  },
  GATEWAY_TIMEOUT: {
    code: "GATEWAY_TIMEOUT",
    status: 504,
    category: "server",
    retryable: true,
  },

  // ============================================================================
  // Database Errors (500)
  // ============================================================================
  DATABASE_ERROR: {
    code: "DATABASE_ERROR",
    status: 500,
    category: "database",
  },
  CONNECTION_ERROR: {
    code: "CONNECTION_ERROR",
    status: 503,
    category: "database",
    retryable: true,
  },
  TRANSACTION_ERROR: {
    code: "TRANSACTION_ERROR",
    status: 500,
    category: "database",
  },
  RLS_ERROR: {
    code: "RLS_ERROR",
    status: 500,
    category: "database",
  },

  // ============================================================================
  // External Service Errors (502, 503)
  // ============================================================================
  EXTERNAL_SERVICE_ERROR: {
    code: "EXTERNAL_SERVICE_ERROR",
    status: 502,
    category: "external",
    retryable: true,
  },
  EXTERNAL_TIMEOUT: {
    code: "EXTERNAL_TIMEOUT",
    status: 504,
    category: "external",
    retryable: true,
  },
} as const;

/**
 * Error code type (union of all error code keys)
 */
export type ErrorCode = keyof typeof ErrorCodes;

/**
 * Get error code definition by code string
 */
export function getErrorCode(code: string): ErrorCodeDefinition | undefined {
  return (ErrorCodes as Record<string, ErrorCodeDefinition>)[code];
}

/**
 * Get all error codes by category
 */
export function getErrorCodesByCategory(
  category: ErrorCategory
): ErrorCodeDefinition[] {
  return Object.values(ErrorCodes).filter((e) => e.category === category);
}

/**
 * Check if an error code is retryable
 */
export function isRetryableError(code: string): boolean {
  const errorCode = getErrorCode(code);
  return errorCode?.retryable === true;
}

/**
 * Get HTTP status for an error code
 */
export function getStatusForCode(code: string): number {
  const errorCode = getErrorCode(code);
  return errorCode?.status ?? 500;
}
