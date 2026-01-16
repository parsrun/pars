/**
 * @parsrun/types - Common Schemas
 * Shared validation schemas used across all Pars packages
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

/** Success response wrapper */
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

/** Paginated response wrapper */
export const paginatedResponse = <T>(dataSchema: T) =>
  type({
    success: "boolean",
    data: dataSchema as never,
    pagination: paginationMeta,
    "message?": "string",
  });

/** Cursor paginated response wrapper */
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

export type UUID = typeof uuid.infer;
export type Timestamp = typeof timestamp.infer;
export type Email = typeof email.infer;
export type Url = typeof url.infer;
export type NonEmptyString = typeof nonEmptyString.infer;
export type PositiveInt = typeof positiveInt.infer;
export type NonNegativeInt = typeof nonNegativeInt.infer;

export type Status = typeof status.infer;
export type SessionStatus = typeof sessionStatus.infer;

export type Pagination = typeof pagination.infer;
export type PaginationMeta = typeof paginationMeta.infer;
export type CursorPagination = typeof cursorPagination.infer;
export type CursorPaginationMeta = typeof cursorPaginationMeta.infer;

export type ErrorResponse = typeof errorResponse.infer;
export type ParsError = typeof parsError.infer;
export type ValidationErrorDetail = typeof validationErrorDetail.infer;

// ============================================================================
// API Response Interfaces (for TypeScript convenience)
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  message?: string;
}

export interface ApiPaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  message?: string;
}

export interface ApiCursorPaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  pagination: CursorPaginationMeta;
  message?: string;
}
