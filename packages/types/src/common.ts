/**
 * @module
 * Common validation schemas shared across all Pars packages.
 * Includes primitive validators, pagination, and response wrappers.
 *
 * @example
 * ```typescript
 * import { uuid, email, pagination, successResponse } from '@parsrun/types';
 *
 * // Validate a UUID
 * const id = uuid('550e8400-e29b-41d4-a716-446655440000');
 *
 * // Create paginated response schema
 * const usersResponse = paginatedResponse(user.array());
 * ```
 */

import { type } from "arktype";

// ============================================================================
// Primitive Schemas
// ============================================================================

/** UUID v4 string validation */
export const uuid = type("string.uuid");

/** ISO 8601 timestamp string */
export const timestamp = type("string.date.iso");

/** Email address validation */
export const email = type("string.email");

/** URL validation */
export const url = type("string.url");

/** Non-empty string */
export const nonEmptyString = type("string >= 1");

/** Positive integer */
export const positiveInt = type("number.integer > 0");

/** Non-negative integer */
export const nonNegativeInt = type("number.integer >= 0");

// ============================================================================
// Status Schemas
// ============================================================================

/** Common entity status */
export const status = type("'active' | 'inactive' | 'suspended' | 'deleted'");

/** Session status */
export const sessionStatus = type("'active' | 'expired' | 'revoked'");

// ============================================================================
// Pagination Schemas
// ============================================================================

/** Pagination request parameters */
export const pagination = type({
  page: "number >= 1",
  limit: "number >= 1",
  "orderBy?": "string",
  "orderDirection?": "'asc' | 'desc'",
});

/** Pagination metadata in responses */
export const paginationMeta = type({
  page: "number",
  limit: "number",
  total: "number",
  totalPages: "number",
  hasNext: "boolean",
  hasPrev: "boolean",
});

/** Cursor-based pagination */
export const cursorPagination = type({
  "cursor?": "string",
  limit: "number >= 1",
  "direction?": "'forward' | 'backward'",
});

/** Cursor pagination metadata */
export const cursorPaginationMeta = type({
  "cursor?": "string",
  "nextCursor?": "string",
  "prevCursor?": "string",
  hasMore: "boolean",
  limit: "number",
});

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * Creates a success response schema wrapper for any data type.
 * @template T - The data schema type
 * @param dataSchema - The ArkType schema for the response data
 * @returns An ArkType schema for a success response containing the data
 */
export const successResponse = <T>(dataSchema: T) =>
  type({
    success: "'true'",
    data: dataSchema as never,
    "message?": "string",
  });

/** Error response */
export const errorResponse = type({
  success: "'false'",
  error: {
    code: "string",
    message: "string",
    "details?": "unknown",
  },
  "message?": "string",
});

/**
 * Creates a paginated response schema wrapper for offset-based pagination.
 * @template T - The data schema type (typically an array schema)
 * @param dataSchema - The ArkType schema for the paginated data array
 * @returns An ArkType schema for a paginated response with pagination metadata
 */
export const paginatedResponse = <T>(dataSchema: T) =>
  type({
    success: "boolean",
    data: dataSchema as never,
    pagination: paginationMeta,
    "message?": "string",
  });

/**
 * Creates a cursor-paginated response schema wrapper for cursor-based pagination.
 * @template T - The data schema type (typically an array schema)
 * @param dataSchema - The ArkType schema for the paginated data array
 * @returns An ArkType schema for a cursor-paginated response with cursor metadata
 */
export const cursorPaginatedResponse = <T>(dataSchema: T) =>
  type({
    success: "boolean",
    data: dataSchema as never,
    pagination: cursorPaginationMeta,
    "message?": "string",
  });

// ============================================================================
// Error Schemas
// ============================================================================

/** Pars framework error */
export const parsError = type({
  message: "string",
  statusCode: "number >= 100",
  "code?": "string",
  "details?": "unknown",
});

/** Validation error details */
export const validationErrorDetail = type({
  path: "string",
  message: "string",
  "expected?": "string",
  "received?": "unknown",
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * UUID v4 string type.
 * Represents a universally unique identifier in the standard UUID v4 format.
 */
export type UUID = typeof uuid.infer;

/**
 * ISO 8601 timestamp string type.
 * Represents a date-time value in ISO 8601 format (e.g., "2024-01-15T10:30:00Z").
 */
export type Timestamp = typeof timestamp.infer;

/**
 * Valid email address string type.
 * Represents a properly formatted email address.
 */
export type Email = typeof email.infer;

/**
 * Valid URL string type.
 * Represents a properly formatted URL.
 */
export type Url = typeof url.infer;

/**
 * Non-empty string type (length >= 1).
 * Ensures the string contains at least one character.
 */
export type NonEmptyString = typeof nonEmptyString.infer;

/**
 * Positive integer type (> 0).
 * Represents whole numbers greater than zero.
 */
export type PositiveInt = typeof positiveInt.infer;

/**
 * Non-negative integer type (>= 0).
 * Represents whole numbers that are zero or greater.
 */
export type NonNegativeInt = typeof nonNegativeInt.infer;

/**
 * Entity status type.
 * Common lifecycle states for entities: 'active' | 'inactive' | 'suspended' | 'deleted'.
 */
export type Status = typeof status.infer;

/**
 * Session status type.
 * Represents the current state of a user session: 'active' | 'expired' | 'revoked'.
 */
export type SessionStatus = typeof sessionStatus.infer;

/**
 * Pagination request parameters type.
 * Contains page number, limit, and optional ordering for offset-based pagination.
 */
export type Pagination = typeof pagination.infer;

/**
 * Pagination metadata type for responses.
 * Contains page info, totals, and navigation flags for offset-based pagination.
 */
export type PaginationMeta = typeof paginationMeta.infer;

/**
 * Cursor-based pagination request type.
 * Contains cursor, limit, and direction for cursor-based pagination.
 */
export type CursorPagination = typeof cursorPagination.infer;

/**
 * Cursor-based pagination metadata type.
 * Contains current/next/prev cursors and hasMore flag for cursor-based pagination.
 */
export type CursorPaginationMeta = typeof cursorPaginationMeta.infer;

/**
 * Standard error response structure type.
 * Contains success flag, error object with code/message/details, and optional message.
 */
export type ErrorResponse = typeof errorResponse.infer;

/**
 * Pars framework error structure type.
 * Contains message, HTTP status code, optional error code, and optional details.
 */
export type ParsError = typeof parsError.infer;

/**
 * Validation error detail type.
 * Contains the field path, error message, and optional expected/received values.
 */
export type ValidationErrorDetail = typeof validationErrorDetail.infer;

// ============================================================================
// API Response Interfaces (for TypeScript convenience)
// ============================================================================

/** Generic API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

/** API error response structure */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  message?: string;
}

/** Paginated API response with offset-based pagination */
export interface ApiPaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  message?: string;
}

/** Paginated API response with cursor-based pagination */
export interface ApiCursorPaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  pagination: CursorPaginationMeta;
  message?: string;
}
