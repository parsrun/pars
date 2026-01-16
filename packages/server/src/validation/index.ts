/**
 * @parsrun/server - ArkType Validation
 * Request validation with ArkType (powered by @parsrun/types)
 */

import type { HonoContext, HonoNext } from "../context.js";
import { ValidationError } from "../middleware/error-handler.js";
import type { Type } from "@parsrun/types";

// Re-export from @parsrun/types
export {
  type,
  // Common schemas
  uuid,
  timestamp,
  email,
  url,
  nonEmptyString,
  positiveInt,
  nonNegativeInt,
  status,
  pagination,
  paginationMeta,
  cursorPagination,
  cursorPaginationMeta,
  // Server schemas
  uuidParam,
  paginationQuery,
  cursorPaginationQuery,
  searchQuery,
  dateRangeQuery,
  healthResponse,
  apiInfoResponse,
  corsConfig,
  serverRateLimitConfig,
  loggerConfig,
  serverConfig,
  authContext,
  requestContext,
  // Response helpers
  successResponse,
  errorResponse,
  paginatedResponse,
  cursorPaginatedResponse,
  parsError,
  // Validation helpers
  validateWithSchema,
  safeValidate,
  isValid,
  formatErrors,
  // Types
  type UUID,
  type Timestamp,
  type Email,
  type Url,
  type NonEmptyString,
  type PositiveInt,
  type NonNegativeInt,
  type Status,
  type Pagination,
  type PaginationMeta,
  type CursorPagination,
  type CursorPaginationMeta,
  type UuidParam,
  type PaginationQuery,
  type CursorPaginationQuery,
  type SearchQuery,
  type DateRangeQuery,
  type HealthResponse,
  type ApiInfoResponse,
  type CorsConfig,
  type ServerRateLimitConfig,
  type LoggerConfig,
  type ServerConfig,
  type AuthContext,
  type RequestContext,
  type ErrorResponse,
  type ParsError,
  type ApiResponse,
  type ApiErrorResponse,
  type ApiPaginatedResponse,
  type ApiCursorPaginatedResponse,
} from "@parsrun/types";

import { type, formatErrors as formatArkErrors } from "@parsrun/types";

export type { Type } from "@parsrun/types";

/**
 * Infer type from ArkType schema
 */
export type Infer<T extends Type> = T["infer"];

/**
 * Validation target
 */
export type ValidationTarget = "json" | "query" | "param" | "header" | "form";

/**
 * Validation options
 */
export interface ValidateOptions {
  /** Error message prefix */
  messagePrefix?: string;
}

/**
 * Format ArkType errors to a simple object with arrays
 */
function formatValidationErrors(errors: type.errors): Record<string, string[]> {
  const formatted = formatArkErrors(errors);
  const result: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(formatted)) {
    result[key] = [value];
  }

  return result;
}

/**
 * Validate request body with ArkType schema
 *
 * @example
 * ```typescript
 * import { type } from '@parsrun/types';
 *
 * const CreateUserSchema = type({
 *   email: 'string.email',
 *   name: 'string',
 *   age: 'number >= 0',
 * });
 *
 * app.post('/users', validateBody(CreateUserSchema), async (c) => {
 *   const data = c.get('validatedBody');
 *   // data is typed as { email: string; name: string; age: number }
 * });
 * ```
 */
export function validateBody<T extends Type>(schema: T, options: ValidateOptions = {}) {
  return async (c: HonoContext, next: HonoNext): Promise<void> => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError("Invalid JSON body");
    }

    const result = schema(body);

    if (result instanceof type.errors) {
      throw new ValidationError(
        options.messagePrefix ?? "Validation failed",
        { errors: formatValidationErrors(result) }
      );
    }

    // Store validated data in context
    (c as HonoContext & { validatedBody: T["infer"] }).set("validatedBody" as never, result as never);

    await next();
  };
}

/**
 * Validate query parameters
 *
 * @example
 * ```typescript
 * const PaginationSchema = type({
 *   'page?': 'string',
 *   'limit?': 'string',
 *   'search?': 'string',
 * });
 *
 * app.get('/users', validateQuery(PaginationSchema), async (c) => {
 *   const { page, limit, search } = c.get('validatedQuery');
 * });
 * ```
 */
export function validateQuery<T extends Type>(schema: T, options: ValidateOptions = {}) {
  return async (c: HonoContext, next: HonoNext): Promise<void> => {
    const query = c.req.query();
    const result = schema(query);

    if (result instanceof type.errors) {
      throw new ValidationError(
        options.messagePrefix ?? "Invalid query parameters",
        { errors: formatValidationErrors(result) }
      );
    }

    (c as HonoContext & { validatedQuery: T["infer"] }).set("validatedQuery" as never, result as never);

    await next();
  };
}

/**
 * Validate route parameters
 *
 * @example
 * ```typescript
 * const IdParamSchema = type({
 *   id: 'string',
 * });
 *
 * app.get('/users/:id', validateParams(IdParamSchema), async (c) => {
 *   const { id } = c.get('validatedParams');
 * });
 * ```
 */
export function validateParams<T extends Type>(schema: T, options: ValidateOptions = {}) {
  return async (c: HonoContext, next: HonoNext): Promise<void> => {
    const params = c.req.param();
    const result = schema(params);

    if (result instanceof type.errors) {
      throw new ValidationError(
        options.messagePrefix ?? "Invalid route parameters",
        { errors: formatValidationErrors(result) }
      );
    }

    (c as HonoContext & { validatedParams: T["infer"] }).set("validatedParams" as never, result as never);

    await next();
  };
}

/**
 * Validate headers
 *
 * @example
 * ```typescript
 * const ApiKeySchema = type({
 *   'x-api-key': 'string',
 * });
 *
 * app.use('/api/*', validateHeaders(ApiKeySchema));
 * ```
 */
export function validateHeaders<T extends Type>(schema: T, options: ValidateOptions = {}) {
  return async (c: HonoContext, next: HonoNext): Promise<void> => {
    // Convert headers to plain object
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const result = schema(headers);

    if (result instanceof type.errors) {
      throw new ValidationError(
        options.messagePrefix ?? "Invalid headers",
        { errors: formatValidationErrors(result) }
      );
    }

    (c as HonoContext & { validatedHeaders: T["infer"] }).set("validatedHeaders" as never, result as never);

    await next();
  };
}

/**
 * Combined validation middleware
 *
 * @example
 * ```typescript
 * app.post('/users/:id',
 *   validate({
 *     params: type({ id: 'string' }),
 *     body: type({ name: 'string', email: 'string.email' }),
 *     query: type({ 'include?': 'string' }),
 *   }),
 *   async (c) => {
 *     const params = c.get('validatedParams');
 *     const body = c.get('validatedBody');
 *     const query = c.get('validatedQuery');
 *   }
 * );
 * ```
 */
export function validate<
  TParams extends Type | undefined = undefined,
  TBody extends Type | undefined = undefined,
  TQuery extends Type | undefined = undefined,
  THeaders extends Type | undefined = undefined
>(schemas: {
  params?: TParams;
  body?: TBody;
  query?: TQuery;
  headers?: THeaders;
}) {
  return async (c: HonoContext, next: HonoNext): Promise<void> => {
    // Validate params
    if (schemas.params) {
      const params = c.req.param();
      const result = schemas.params(params);
      if (result instanceof type.errors) {
        throw new ValidationError("Invalid route parameters", {
          errors: formatValidationErrors(result),
        });
      }
      (c as HonoContext & { validatedParams: unknown }).set("validatedParams" as never, result as never);
    }

    // Validate query
    if (schemas.query) {
      const query = c.req.query();
      const result = schemas.query(query);
      if (result instanceof type.errors) {
        throw new ValidationError("Invalid query parameters", {
          errors: formatValidationErrors(result),
        });
      }
      (c as HonoContext & { validatedQuery: unknown }).set("validatedQuery" as never, result as never);
    }

    // Validate headers
    if (schemas.headers) {
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const result = schemas.headers(headers);
      if (result instanceof type.errors) {
        throw new ValidationError("Invalid headers", {
          errors: formatValidationErrors(result),
        });
      }
      (c as HonoContext & { validatedHeaders: unknown }).set("validatedHeaders" as never, result as never);
    }

    // Validate body
    if (schemas.body) {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        throw new ValidationError("Invalid JSON body");
      }
      const result = schemas.body(body);
      if (result instanceof type.errors) {
        throw new ValidationError("Validation failed", {
          errors: formatValidationErrors(result),
        });
      }
      (c as HonoContext & { validatedBody: unknown }).set("validatedBody" as never, result as never);
    }

    await next();
  };
}

// ============================================================================
// Legacy Aliases (for backward compatibility)
// ============================================================================

// Schema aliases with PascalCase for backward compatibility
// Use the camelCase versions from @parsrun/types for new code
export {
  uuidParam as UuidParamSchema,
  paginationQuery as PaginationQuerySchema,
  searchQuery as SearchQuerySchema,
  dateRangeQuery as DateRangeQuerySchema,
} from "@parsrun/types";
