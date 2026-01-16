/**
 * @module
 * HTTP server validation schemas for request/response handling.
 * Includes pagination, CORS, rate limiting, and middleware context types.
 *
 * @example
 * ```typescript
 * import { serverConfig, healthResponse, type ServerConfig } from '@parsrun/types';
 *
 * const config: ServerConfig = {
 *   port: 3000,
 *   cors: { origin: '*', credentials: true },
 *   rateLimit: { windowMs: 60000, max: 100 }
 * };
 * ```
 */

import { type } from "arktype";
import { uuid } from "./common";

// ============================================================================
// Request Validation Schemas
// ============================================================================

/** UUID path parameter */
export const uuidParam = type({
  id: uuid,
});

/** Standard pagination query */
export const paginationQuery = type({
  "page?": "string",
  "limit?": "string",
  "orderBy?": "string",
  "orderDirection?": "'asc' | 'desc'",
});

/** Cursor pagination query */
export const cursorPaginationQuery = type({
  "cursor?": "string",
  "limit?": "string",
  "direction?": "'forward' | 'backward'",
});

/** Search query */
export const searchQuery = type({
  "q?": "string",
  "search?": "string",
  "filter?": "string",
});

/** Date range query */
export const dateRangeQuery = type({
  "startDate?": "string.date.iso",
  "endDate?": "string.date.iso",
});

// ============================================================================
// Response Schemas
// ============================================================================

/** Health check response */
export const healthResponse = type({
  status: "'healthy' | 'degraded' | 'unhealthy'",
  timestamp: "string",
  "version?": "string",
  "uptime?": "number",
  checks: type({
    name: "string",
    status: "'healthy' | 'degraded' | 'unhealthy'",
    "message?": "string",
    "latency?": "number",
  }).array(),
});

/** API info response */
export const apiInfoResponse = type({
  name: "string",
  version: "string",
  "description?": "string",
  "environment?": "string",
  "documentation?": "string",
});

// ============================================================================
// Server Config Schemas
// ============================================================================

/** CORS config */
export const corsConfig = type({
  "origin?": "string | string[] | boolean | Function",
  "methods?": "string[]",
  "allowedHeaders?": "string[]",
  "exposedHeaders?": "string[]",
  "credentials?": "boolean",
  "maxAge?": "number",
});

/** Server rate limit config */
export const serverRateLimitConfig = type({
  "enabled?": "boolean",
  "windowMs?": "number > 0",
  "max?": "number > 0",
  "keyGenerator?": "Function",
  "skip?": "Function",
  "message?": "string",
});

/** Logger config */
export const loggerConfig = type({
  "level?": "'debug' | 'info' | 'warn' | 'error'",
  "format?": "'json' | 'pretty' | 'combined' | 'short'",
  "redact?": "string[]",
  "timestamp?": "boolean",
});

/** Server config */
export const serverConfig = type({
  "port?": "number > 0",
  "host?": "string",
  "basePath?": "string",
  "cors?": corsConfig,
  "rateLimit?": serverRateLimitConfig,
  "logger?": loggerConfig,
  "trustProxy?": "boolean",
  "strictRouting?": "boolean",
  "caseSensitiveRouting?": "boolean",
});

// ============================================================================
// Middleware Context Schemas
// ============================================================================

/** Auth context (after auth middleware) */
export const authContext = type({
  userId: uuid,
  "tenantId?": uuid,
  "sessionId?": uuid,
  "roles?": "string[]",
  "permissions?": "string[]",
});

/** Request context */
export const requestContext = type({
  requestId: "string",
  "startTime?": "number",
  "ip?": "string",
  "userAgent?": "string",
  "auth?": authContext,
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * UUID path parameter type.
 * Contains an 'id' field for extracting UUID parameters from URL paths.
 */
export type UuidParam = typeof uuidParam.infer;

/**
 * Pagination query type for URL query parameters.
 * Contains page, limit, orderBy, and orderDirection as strings for parsing.
 */
export type PaginationQuery = typeof paginationQuery.infer;

/**
 * Cursor pagination query type for URL query parameters.
 * Contains cursor, limit, and direction as strings for parsing.
 */
export type CursorPaginationQuery = typeof cursorPaginationQuery.infer;

/**
 * Search query type for URL query parameters.
 * Contains q, search, and filter fields for search endpoints.
 */
export type SearchQuery = typeof searchQuery.infer;

/**
 * Date range query type for URL query parameters.
 * Contains startDate and endDate as ISO 8601 strings.
 */
export type DateRangeQuery = typeof dateRangeQuery.infer;

/**
 * Health check response type.
 * Contains overall status, timestamp, version, uptime, and individual check results.
 */
export type HealthResponse = typeof healthResponse.infer;

/**
 * API info response type.
 * Contains API name, version, description, environment, and documentation URL.
 */
export type ApiInfoResponse = typeof apiInfoResponse.infer;

/**
 * CORS configuration type.
 * Contains origin, methods, headers, credentials, and max age settings.
 */
export type CorsConfig = typeof corsConfig.infer;

/**
 * Server rate limit configuration type.
 * Contains window size, max requests, key generator, and skip function.
 */
export type ServerRateLimitConfig = typeof serverRateLimitConfig.infer;

/**
 * Logger configuration type.
 * Contains log level, format, fields to redact, and timestamp settings.
 */
export type LoggerConfig = typeof loggerConfig.infer;

/**
 * Server configuration type.
 * Contains port, host, base path, CORS, rate limiting, and logging settings.
 */
export type ServerConfig = typeof serverConfig.infer;

/**
 * Auth context type (available after auth middleware).
 * Contains user ID, tenant ID, session ID, roles, and permissions.
 */
export type AuthContext = typeof authContext.infer;

/**
 * Request context type.
 * Contains request ID, start time, client IP, user agent, and auth context.
 */
export type RequestContext = typeof requestContext.infer;
