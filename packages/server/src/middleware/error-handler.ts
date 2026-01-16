/**
 * @parsrun/server - Error Handler Middleware
 * Global error handling and response formatting
 */

import type { HonoContext, HonoNext } from "../context.js";
import { error as errorResponse } from "../context.js";
import type { ErrorTransport, ErrorContext } from "@parsrun/core/transports";

/**
 * Base API error class
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse() {
    return errorResponse(this.code, this.message, this.details);
  }
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends ApiError {
  constructor(message = "Bad request", details?: Record<string, unknown>) {
    super(400, "BAD_REQUEST", message, details);
    this.name = "BadRequestError";
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized", details?: Record<string, unknown>) {
    super(401, "UNAUTHORIZED", message, details);
    this.name = "UnauthorizedError";
  }
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden", details?: Record<string, unknown>) {
    super(403, "FORBIDDEN", message, details);
    this.name = "ForbiddenError";
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends ApiError {
  constructor(message = "Not found", details?: Record<string, unknown>) {
    super(404, "NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

/**
 * 409 Conflict
 */
export class ConflictError extends ApiError {
  constructor(message = "Conflict", details?: Record<string, unknown>) {
    super(409, "CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

/**
 * 422 Unprocessable Entity (Validation Error)
 */
export class ValidationError extends ApiError {
  constructor(message = "Validation failed", details?: Record<string, unknown>) {
    super(422, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

/**
 * 429 Too Many Requests
 */
export class RateLimitError extends ApiError {
  constructor(
    message = "Too many requests",
    public readonly retryAfter?: number
  ) {
    super(429, "RATE_LIMIT_EXCEEDED", message, { retryAfter });
    this.name = "RateLimitError";
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends ApiError {
  constructor(message = "Internal server error", details?: Record<string, unknown>) {
    super(500, "INTERNAL_ERROR", message, details);
    this.name = "InternalError";
  }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message = "Service unavailable", details?: Record<string, unknown>) {
    super(503, "SERVICE_UNAVAILABLE", message, details);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
  /** Include stack trace in development */
  includeStack?: boolean;
  /** Custom error logger */
  onError?: (error: Error, c: HonoContext) => void;
  /**
   * Error transport for external error tracking (e.g., Sentry)
   * Automatically captures exceptions with request context
   */
  errorTransport?: ErrorTransport;
  /**
   * Capture all errors including 4xx client errors
   * By default, only 5xx server errors are captured
   * @default false
   */
  captureAllErrors?: boolean;
  /**
   * Custom function to determine if an error should be captured
   * Overrides the default captureAllErrors behavior
   */
  shouldCapture?: (error: Error, statusCode: number) => boolean;
}

/**
 * Global error handler middleware
 *
 * @example Basic usage
 * ```typescript
 * app.use('*', errorHandler({
 *   includeStack: process.env.NODE_ENV === 'development',
 *   onError: (error, c) => {
 *     console.error(`[${c.get('requestId')}]`, error);
 *   },
 * }));
 * ```
 *
 * @example With Sentry error tracking
 * ```typescript
 * import { SentryTransport } from '@parsrun/core/transports';
 *
 * const sentry = new SentryTransport({
 *   dsn: process.env.SENTRY_DSN!,
 *   environment: process.env.NODE_ENV,
 * });
 *
 * app.use('*', errorHandler({
 *   errorTransport: sentry,
 *   captureAllErrors: false, // Only capture 5xx errors
 * }));
 * ```
 */
export function errorHandler(options: ErrorHandlerOptions = {}) {
  const {
    includeStack = false,
    onError,
    errorTransport,
    captureAllErrors = false,
    shouldCapture,
  } = options;

  return async (c: HonoContext, next: HonoNext) => {
    try {
      await next();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Determine status code
      const statusCode = error instanceof ApiError ? error.statusCode : 500;

      // Log error
      if (onError) {
        onError(error, c);
      } else {
        const logger = c.get("logger");
        if (logger) {
          logger.error("Request error", {
            requestId: c.get("requestId"),
            error: error.message,
            stack: error.stack,
          });
        }
      }

      // Capture to error transport if configured
      if (errorTransport) {
        const shouldCaptureError = shouldCapture
          ? shouldCapture(error, statusCode)
          : captureAllErrors || statusCode >= 500;

        if (shouldCaptureError) {
          const user = c.get("user");
          const tenant = c.get("tenant");

          // Build error context with only defined values
          const errorContext: ErrorContext = {
            requestId: c.get("requestId"),
            tags: {
              path: c.req.path,
              method: c.req.method,
              statusCode: String(statusCode),
            },
          };

          if (user?.id) {
            errorContext.userId = user.id;
          }
          if (tenant?.id) {
            errorContext.tenantId = tenant.id;
          }

          // Add extra context
          const extra: Record<string, unknown> = {
            query: c.req.query(),
          };
          if (error instanceof ApiError) {
            extra["errorCode"] = error.code;
          }
          errorContext.extra = extra;

          // Capture asynchronously to not block response
          Promise.resolve(
            errorTransport.captureException(error, errorContext)
          ).catch(() => {
            // Silent fail - don't let transport errors affect response
          });
        }
      }

      // Handle known API errors
      if (error instanceof ApiError) {
        return c.json(error.toResponse(), error.statusCode as 400);
      }

      // Handle unknown errors
      const details: Record<string, unknown> = {};

      if (includeStack && error.stack) {
        details["stack"] = error.stack;
      }

      return c.json(
        errorResponse("INTERNAL_ERROR", "An unexpected error occurred", details),
        500
      );
    }
  };
}

/**
 * Not found handler
 *
 * @example
 * ```typescript
 * app.notFound(notFoundHandler);
 * ```
 */
export function notFoundHandler(c: HonoContext) {
  return c.json(
    errorResponse("NOT_FOUND", `Route ${c.req.method} ${c.req.path} not found`),
    404
  );
}
