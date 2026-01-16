/**
 * @parsrun/server - Middleware Exports
 */

// Auth
export {
  auth,
  optionalAuth,
  createAuthMiddleware,
  type AuthMiddlewareOptions,
  type JwtPayload,
  type JwtVerifier,
} from "./auth.js";

// CORS
export { cors } from "./cors.js";

// CSRF
export { csrf, doubleSubmitCookie, type CsrfOptions } from "./csrf.js";

// Error Handler
export {
  errorHandler,
  notFoundHandler,
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  type ErrorHandlerOptions,
} from "./error-handler.js";

// Rate Limit
export {
  rateLimit,
  createRateLimiter,
  MemoryRateLimitStorage,
  type RateLimitOptions,
  type RateLimitStorage,
} from "./rate-limit.js";

// Request Logger
export { requestLogger, type RequestLoggerOptions } from "./request-logger.js";

// Tracing
export {
  tracing,
  tracingMiddleware,
  parseTraceparent,
  generateTraceId,
  generateSpanId,
  createTraceparent,
  type TracingOptions,
  type TraceContext,
} from "./tracing.js";

// Usage Tracking
export {
  usageTracking,
  createUsageTracking,
  type UsageTrackingOptions,
  type UsageServiceLike,
} from "./usage-tracking.js";

// Quota Enforcement
export {
  quotaEnforcement,
  createQuotaEnforcement,
  multiQuotaEnforcement,
  QuotaExceededError,
  type QuotaEnforcementOptions,
  type QuotaManagerLike,
  type QuotaCheckResult,
} from "./quota-enforcement.js";
