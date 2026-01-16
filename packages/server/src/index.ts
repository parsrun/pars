/**
 * @module
 * Server framework for Pars - Edge-compatible, multi-tenant, modular.
 *
 * @example
 * ```typescript
 * import { createServer, createRouter, requireAuth, success } from '@parsrun/server';
 *
 * const app = createServer({
 *   name: 'my-api',
 *   cors: { origin: '*' }
 * });
 *
 * const api = createRouter();
 * api.get('/users', requireAuth(), async (c) => {
 *   const users = await getUsers();
 *   return success(c, users);
 * });
 *
 * app.route('/api/v1', api);
 * ```
 */

// ============================================================================
// App Factory
// ============================================================================

export {
  createServer,
  createRouter,
  createVersionedRouter,
  createModuleRouter,
  type CreateServerOptions,
} from "./app.js";

// ============================================================================
// Context and Types
// ============================================================================

export {
  type DatabaseAdapter,
  type ModuleManifest,
  type ServerConfig,
  type CorsConfig,
  type ContextUser,
  type ContextTenant,
  type ServerContextVariables,
  type HonoApp,
  type HonoContext,
  type HonoNext,
  type Middleware,
  type RouteHandler,
  type PermissionCheck,
  type PermissionDefinition,
  type RoleDefinition,
  type ApiResponse,
  success,
  error,
  generateRequestId,
} from "./context.js";

// ============================================================================
// Module Loader
// ============================================================================

export {
  ModuleLoader,
  createModuleLoader,
  defineModule,
  type ModuleLoaderOptions,
} from "./module-loader.js";

// ============================================================================
// Row Level Security (RLS)
// ============================================================================

export {
  RLSManager,
  RLSError,
  createRLSManager,
  rlsMiddleware,
  generateRLSPolicy,
  generateDisableRLS,
  type RLSConfig,
} from "./rls.js";

// ============================================================================
// Role-Based Access Control (RBAC)
// ============================================================================

export {
  // Interfaces
  type PermissionChecker,
  // Classes
  InMemoryRBAC,
  RBACService,
  // Factory functions
  createInMemoryRBAC,
  createRBACService,
  // Middleware
  requireAuth,
  requirePermission,
  requireAnyPermission,
  requireRole,
  requireAnyRole,
  requireTenantMember,
  // Utilities
  parsePermission,
  createPermission,
  crudPermissions,
  // Constants
  StandardRoles,
} from "./rbac.js";

// ============================================================================
// Middleware
// ============================================================================

export {
  // Auth
  auth,
  optionalAuth,
  createAuthMiddleware,
  type AuthMiddlewareOptions,
  type JwtPayload,
  type JwtVerifier,
  // CORS
  cors,
  // CSRF
  csrf,
  doubleSubmitCookie,
  type CsrfOptions,
  // Error Handler
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
  // Rate Limit
  rateLimit,
  createRateLimiter,
  MemoryRateLimitStorage,
  type RateLimitOptions,
  type RateLimitStorage,
  // Request Logger
  requestLogger,
  type RequestLoggerOptions,
  // Usage Tracking
  usageTracking,
  createUsageTracking,
  type UsageTrackingOptions,
  type UsageServiceLike,
  // Quota Enforcement
  quotaEnforcement,
  createQuotaEnforcement,
  multiQuotaEnforcement,
  QuotaExceededError,
  type QuotaEnforcementOptions,
  type QuotaManagerLike,
  type QuotaCheckResult,
} from "./middleware/index.js";

// ============================================================================
// Validation (ArkType)
// ============================================================================

export {
  // ArkType re-exports
  type,
  type Type,
  type Infer,
  // Validators
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  validate,
  type ValidationTarget,
  type ValidateOptions,
  // Common schemas (as Schema suffix for values, types are PascalCase)
  UuidParamSchema,
  PaginationQuerySchema,
  SearchQuerySchema,
  DateRangeQuerySchema,
  // Types
  type UuidParam,
  type PaginationQuery,
  type SearchQuery,
  type DateRangeQuery,
} from "./validation/index.js";

// ============================================================================
// Utils
// ============================================================================

export {
  // Pagination
  parsePagination,
  createPaginationMeta,
  paginate,
  parseCursorPagination,
  cursorPaginate,
  setPaginationHeaders,
  type PaginationParams,
  type PaginationMeta,
  type PaginatedResponse,
  type PaginationOptions,
  type CursorPaginationParams,
  type CursorPaginationMeta,
  type CursorPaginatedResponse,
  // Response helpers
  json,
  jsonWithMeta,
  jsonError,
  created,
  noContent,
  accepted,
  redirect,
  stream,
  sse,
  download,
} from "./utils/index.js";

// ============================================================================
// Health
// ============================================================================

export {
  createHealthRouter,
  healthHandler,
  type HealthStatus,
  type HealthCheck,
  type HealthCheckResult,
  type HealthResponse,
  type HealthCheckOptions,
} from "./health.js";
