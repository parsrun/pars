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

export type UuidParam = typeof uuidParam.infer;
export type PaginationQuery = typeof paginationQuery.infer;
export type CursorPaginationQuery = typeof cursorPaginationQuery.infer;
export type SearchQuery = typeof searchQuery.infer;
export type DateRangeQuery = typeof dateRangeQuery.infer;
export type HealthResponse = typeof healthResponse.infer;
export type ApiInfoResponse = typeof apiInfoResponse.infer;
export type CorsConfig = typeof corsConfig.infer;
export type ServerRateLimitConfig = typeof serverRateLimitConfig.infer;
export type LoggerConfig = typeof loggerConfig.infer;
export type ServerConfig = typeof serverConfig.infer;
export type AuthContext = typeof authContext.infer;
export type RequestContext = typeof requestContext.infer;
