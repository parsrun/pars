/**
 * Framework Adapters
 * Integrations for web frameworks
 */

// Common types
export {
  createAuthCookies,
  createLogoutCookies,
  type AuthContext,
  type CookieOptions,
  type AuthResponse,
  type RequestOtpBody,
  type VerifyOtpBody,
  type SignInBody,
  type RefreshBody,
} from './types.js';

// Hono adapter
export {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  createAuthRoutes,
  createHonoAuth,
  type AuthVariables,
  type HonoAdapterConfig,
  // Authorization middleware helpers
  requireRole,
  requirePermission,
  requireAnyPermission,
  requireTenant,
  requireTenantAccess,
  requireAdmin,
  requireOwnerOrPermission,
  requireAll,
  requireAny,
} from './hono.js';
