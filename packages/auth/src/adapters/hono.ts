/**
 * Hono Framework Adapter
 * Middleware and routes for Hono applications
 */

import type { Context, MiddlewareHandler, Hono } from 'hono';
import type { ParsAuthEngine } from '../core/auth-engine.js';
import { extractBearerToken } from '../session/index.js';
import {
  createAuthCookies,
  createLogoutCookies,
  type AuthContext,
  type CookieOptions,
} from './types.js';
import {
  type AuthorizationContext,
  createAuthorizationGuard,
  type PermissionPattern,
} from '../security/authorization.js';

/**
 * Hono auth context variables
 */
export interface AuthVariables {
  auth: AuthContext;
}

/**
 * Hono adapter configuration
 */
export interface HonoAdapterConfig {
  /** Auth engine instance */
  auth: ParsAuthEngine;
  /** Cookie configuration */
  cookies?: {
    prefix?: string;
    path?: string;
    domain?: string;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    httpOnly?: boolean;
  };
  /** Custom error handler */
  onError?: (error: Error, c: Context) => Response | Promise<Response>;
  /** Custom unauthorized handler */
  onUnauthorized?: (c: Context, message?: string) => Response | Promise<Response>;
}

/**
 * Set cookie on response
 */
function setCookie(c: Context, cookie: CookieOptions): void {
  let cookieString = `${cookie.name}=${cookie.value}`;

  if (cookie.expires) {
    cookieString += `; Expires=${cookie.expires.toUTCString()}`;
  }
  if (cookie.maxAge !== undefined) {
    cookieString += `; Max-Age=${cookie.maxAge}`;
  }
  if (cookie.path) {
    cookieString += `; Path=${cookie.path}`;
  }
  if (cookie.domain) {
    cookieString += `; Domain=${cookie.domain}`;
  }
  if (cookie.secure) {
    cookieString += '; Secure';
  }
  if (cookie.httpOnly) {
    cookieString += '; HttpOnly';
  }
  if (cookie.sameSite) {
    cookieString += `; SameSite=${cookie.sameSite.charAt(0).toUpperCase() + cookie.sameSite.slice(1)}`;
  }

  c.header('Set-Cookie', cookieString, { append: true });
}

/**
 * Get cookie from request
 */
function getCookie(c: Context, name: string): string | undefined {
  const cookieHeader = c.req.header('Cookie');
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [cookieName, ...valueParts] = cookie.split('=');
    if (cookieName === name) {
      return valueParts.join('=');
    }
  }
  return undefined;
}

/**
 * Create Hono auth middleware
 * Validates JWT and attaches auth context to request
 */
export function createAuthMiddleware(
  config: HonoAdapterConfig
): MiddlewareHandler<{ Variables: AuthVariables }> {
  const { auth, onUnauthorized } = config;

  return async (c, next) => {
    // Get token from Authorization header or cookie
    const authHeader = c.req.header('Authorization');
    let token = extractBearerToken(authHeader);

    if (!token) {
      const cookiePrefix = config.cookies?.prefix ?? 'pars';
      token = getCookie(c, `${cookiePrefix}.access_token`) ?? null;
    }

    if (!token) {
      if (onUnauthorized) {
        return onUnauthorized(c, 'No token provided');
      }
      return c.json({ error: 'Unauthorized', message: 'No token provided' }, 401);
    }

    // Verify token
    const result = await auth.verifyAccessToken(token);

    if (!result.valid || !result.payload) {
      if (onUnauthorized) {
        return onUnauthorized(c, result.error);
      }
      return c.json({ error: 'Unauthorized', message: result.error }, 401);
    }

    // Attach auth context
    const authContext: AuthContext = {
      userId: result.payload.sub,
      payload: result.payload,
      ...(result.payload.sid && { sessionId: result.payload.sid }),
      ...(result.payload.tid && { tenantId: result.payload.tid }),
      ...(result.payload.roles && { roles: result.payload.roles }),
      ...(result.payload.permissions && { permissions: result.payload.permissions }),
    };

    c.set('auth', authContext);

    await next();
  };
}

/**
 * Create optional auth middleware
 * Attaches auth context if token is valid, but doesn't block if not
 */
export function createOptionalAuthMiddleware(
  config: HonoAdapterConfig
): MiddlewareHandler<{ Variables: Partial<AuthVariables> }> {
  const { auth } = config;

  return async (c, next) => {
    // Get token from Authorization header or cookie
    const authHeader = c.req.header('Authorization');
    let token = extractBearerToken(authHeader);

    if (!token) {
      const cookiePrefix = config.cookies?.prefix ?? 'pars';
      token = getCookie(c, `${cookiePrefix}.access_token`) ?? null;
    }

    if (token) {
      const result = await auth.verifyAccessToken(token);

      if (result.valid && result.payload) {
        const authContext: AuthContext = {
          userId: result.payload.sub,
          payload: result.payload,
          ...(result.payload.sid && { sessionId: result.payload.sid }),
          ...(result.payload.tid && { tenantId: result.payload.tid }),
          ...(result.payload.roles && { roles: result.payload.roles }),
          ...(result.payload.permissions && { permissions: result.payload.permissions }),
        };

        c.set('auth', authContext);
      }
    }

    await next();
  };
}

/**
 * Create auth routes
 * Provides standard auth endpoints: /otp/request, /otp/verify, /sign-in, /sign-out, /refresh
 */
export function createAuthRoutes<E extends { Variables: Partial<AuthVariables> }>(
  app: Hono<E>,
  config: HonoAdapterConfig
): Hono<E> {
  const { auth, cookies: cookieConfig } = config;

  /**
   * Request OTP
   * POST /otp/request
   */
  app.post('/otp/request', async (c) => {
    try {
      const body = await c.req.json<{ identifier: string; type: 'email' | 'sms' }>();

      if (!body.identifier || !body.type) {
        return c.json({ error: 'Bad Request', message: 'identifier and type are required' }, 400);
      }

      const result = await auth.requestOTP({
        identifier: body.identifier,
        type: body.type,
      });

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error,
          remainingRequests: result.remainingRequests,
        }, 429);
      }

      return c.json({
        success: true,
        expiresAt: result.expiresAt,
        remainingRequests: result.remainingRequests,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Verify OTP and sign in
   * POST /otp/verify
   */
  app.post('/otp/verify', async (c) => {
    try {
      const body = await c.req.json<{
        identifier: string;
        code: string;
        type?: 'email' | 'sms';
      }>();

      if (!body.identifier || !body.code) {
        return c.json({ error: 'Bad Request', message: 'identifier and code are required' }, 400);
      }

      const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip');
      const userAgent = c.req.header('user-agent');

      const result = await auth.signIn({
        provider: 'otp',
        identifier: body.identifier,
        credential: body.code,
        data: { type: body.type ?? 'email' },
        metadata: {
          ...(ipAddress && { ipAddress }),
          ...(userAgent && { userAgent }),
        },
      });

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        }, 401);
      }

      // Set cookies
      if (result.tokens && cookieConfig) {
        const cookies = createAuthCookies(result.tokens, cookieConfig);
        for (const cookie of cookies) {
          setCookie(c, cookie);
        }
      }

      return c.json({
        success: true,
        user: result.user ? {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        } : undefined,
        tokens: result.tokens,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Sign in (generic)
   * POST /sign-in
   */
  app.post('/sign-in', async (c) => {
    try {
      const body = await c.req.json<{
        provider: string;
        identifier: string;
        credential?: string;
        data?: Record<string, unknown>;
      }>();

      if (!body.provider || !body.identifier) {
        return c.json({
          error: 'Bad Request',
          message: 'provider and identifier are required',
        }, 400);
      }

      const ipAddress = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip');
      const userAgent = c.req.header('user-agent');

      const result = await auth.signIn({
        provider: body.provider,
        identifier: body.identifier,
        ...(body.credential && { credential: body.credential }),
        ...(body.data && { data: body.data }),
        metadata: {
          ...(ipAddress && { ipAddress }),
          ...(userAgent && { userAgent }),
        },
      });

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error,
          errorCode: result.errorCode,
          requiresTwoFactor: result.requiresTwoFactor,
        }, 401);
      }

      // Set cookies
      if (result.tokens && cookieConfig) {
        const cookies = createAuthCookies(result.tokens, cookieConfig);
        for (const cookie of cookies) {
          setCookie(c, cookie);
        }
      }

      return c.json({
        success: true,
        user: result.user ? {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        } : undefined,
        tokens: result.tokens,
        requiresTwoFactor: result.requiresTwoFactor,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Sign out
   * POST /sign-out
   */
  app.post('/sign-out', async (c) => {
    try {
      // Get auth context
      const authContext = c.get('auth') as AuthContext | undefined;

      if (authContext?.sessionId) {
        await auth.signOut(authContext.sessionId);
      }

      // Clear cookies
      if (cookieConfig) {
        const cookies = createLogoutCookies(cookieConfig);
        for (const cookie of cookies) {
          setCookie(c, cookie);
        }
      }

      return c.json({ success: true });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Refresh tokens
   * POST /refresh
   */
  app.post('/refresh', async (c) => {
    try {
      // Get refresh token from body or cookie
      let refreshToken: string | undefined;

      try {
        const body = await c.req.json<{ refreshToken?: string }>();
        refreshToken = body.refreshToken;
      } catch {
        // Body might not be JSON
      }

      if (!refreshToken) {
        const cookiePrefix = cookieConfig?.prefix ?? 'pars';
        refreshToken = getCookie(c, `${cookiePrefix}.refresh_token`);
      }

      if (!refreshToken) {
        return c.json({
          success: false,
          error: 'No refresh token provided',
        }, 401);
      }

      const result = await auth.refreshTokens(refreshToken);

      if (!result.success) {
        // Clear cookies on refresh failure
        if (cookieConfig) {
          const cookies = createLogoutCookies(cookieConfig);
          for (const cookie of cookies) {
            setCookie(c, cookie);
          }
        }

        return c.json({
          success: false,
          error: result.error,
        }, 401);
      }

      // Set new cookies
      if (result.tokens && cookieConfig) {
        const cookies = createAuthCookies(result.tokens, cookieConfig);
        for (const cookie of cookies) {
          setCookie(c, cookie);
        }
      }

      return c.json({
        success: true,
        tokens: result.tokens,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Get current user
   * GET /me
   */
  app.get('/me', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get user from adapter
    const user = await auth.getAdapter().findUserById(authContext.userId);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  });

  /**
   * Get sessions
   * GET /sessions
   */
  app.get('/sessions', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessions = await auth.getSessions(authContext.userId, authContext.sessionId);

    return c.json({ sessions });
  });

  /**
   * Revoke session
   * DELETE /sessions/:id
   */
  app.delete('/sessions/:id', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');

    // Verify the session belongs to the user
    const sessions = await auth.getSessions(authContext.userId);
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    await auth.revokeSession(sessionId);

    return c.json({ success: true });
  });

  /**
   * Revoke all sessions
   * DELETE /sessions
   */
  app.delete('/sessions', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await auth.revokeAllSessions(authContext.userId);

    // Clear cookies
    if (cookieConfig) {
      const cookies = createLogoutCookies(cookieConfig);
      for (const cookie of cookies) {
        setCookie(c, cookie);
      }
    }

    return c.json({ success: true });
  });

  /**
   * Get available providers
   * GET /providers
   */
  app.get('/providers', async (c) => {
    const providers = auth.getProviders();
    return c.json({ providers });
  });

  // ============================================
  // MULTI-TENANT ROUTES
  // ============================================

  /**
   * Get user's tenants
   * GET /tenants
   */
  app.get('/tenants', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const tenants = await auth.getUserTenants(authContext.userId);
      return c.json({
        tenants: tenants.map((t) => ({
          id: t.tenant.id,
          name: t.tenant.name,
          slug: t.tenant.slug,
          role: t.membership.role,
          status: t.tenant.status,
        })),
        currentTenantId: authContext.tenantId,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Switch tenant
   * POST /tenants/switch
   */
  app.post('/tenants/switch', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext?.sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const body = await c.req.json<{ tenantId: string }>();

      if (!body.tenantId) {
        return c.json({ error: 'Bad Request', message: 'tenantId is required' }, 400);
      }

      const result = await auth.switchTenant(authContext.sessionId, body.tenantId);

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 403);
      }

      // Set new cookies with updated tokens
      if (result.tokens && cookieConfig) {
        const cookies = createAuthCookies(result.tokens, cookieConfig);
        for (const cookie of cookies) {
          setCookie(c, cookie);
        }
      }

      return c.json({
        success: true,
        tokens: result.tokens,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Get current tenant membership
   * GET /tenants/current
   */
  app.get('/tenants/current', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!authContext.tenantId) {
      return c.json({ tenant: null, membership: null });
    }

    try {
      const membership = await auth.getTenantMembership(
        authContext.userId,
        authContext.tenantId
      );

      if (!membership) {
        return c.json({ tenant: null, membership: null });
      }

      const tenant = await auth.getAdapter().findTenantById?.(authContext.tenantId);

      return c.json({
        tenant: tenant ? {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
        } : null,
        membership: {
          role: membership.role,
          permissions: membership.permissions,
          status: membership.status,
        },
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Invite user to tenant
   * POST /tenants/:tenantId/invite
   */
  app.post('/tenants/:tenantId/invite', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const tenantId = c.req.param('tenantId');
      const body = await c.req.json<{
        email: string;
        role: string;
        permissions?: string[];
        message?: string;
      }>();

      if (!body.email || !body.role) {
        return c.json({ error: 'Bad Request', message: 'email and role are required' }, 400);
      }

      // Check if user is admin of tenant
      const isAdmin = await auth.hasRoleInTenant(authContext.userId, tenantId, 'admin') ||
                      await auth.hasRoleInTenant(authContext.userId, tenantId, 'owner');

      if (!isAdmin) {
        return c.json({ error: 'Forbidden', message: 'Admin access required' }, 403);
      }

      const result = await auth.inviteToTenant({
        email: body.email,
        tenantId,
        role: body.role,
        permissions: body.permissions,
        invitedBy: authContext.userId,
        message: body.message,
      });

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }

      return c.json({
        success: true,
        invitationUrl: result.invitationUrl,
        expiresAt: result.invitation?.expiresAt,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Check invitation status
   * GET /invitation
   */
  app.get('/invitation', async (c) => {
    try {
      const token = c.req.query('token');

      if (!token) {
        return c.json({ error: 'Bad Request', message: 'token is required' }, 400);
      }

      const result = await auth.checkInvitation(token);

      return c.json(result);
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Accept invitation
   * POST /invitation/accept
   */
  app.post('/invitation/accept', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const body = await c.req.json<{ token: string }>();

      if (!body.token) {
        return c.json({ error: 'Bad Request', message: 'token is required' }, 400);
      }

      const result = await auth.acceptInvitation(body.token, authContext.userId);

      if (!result.success) {
        return c.json({ success: false, error: result.error }, 400);
      }

      return c.json({
        success: true,
        tenant: result.tenant ? {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
        } : undefined,
        membership: result.membership ? {
          role: result.membership.role,
          status: result.membership.status,
        } : undefined,
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Remove member from tenant
   * DELETE /tenants/:tenantId/members/:userId
   */
  app.delete('/tenants/:tenantId/members/:userId', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const tenantId = c.req.param('tenantId');
      const userId = c.req.param('userId');

      // Check if user is admin of tenant (or removing themselves)
      const isAdmin = await auth.hasRoleInTenant(authContext.userId, tenantId, 'admin') ||
                      await auth.hasRoleInTenant(authContext.userId, tenantId, 'owner');
      const isSelf = authContext.userId === userId;

      if (!isAdmin && !isSelf) {
        return c.json({ error: 'Forbidden', message: 'Admin access required' }, 403);
      }

      await auth.removeTenantMember(userId, tenantId);

      return c.json({ success: true });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  /**
   * Update member role
   * PATCH /tenants/:tenantId/members/:userId
   */
  app.patch('/tenants/:tenantId/members/:userId', async (c) => {
    const authContext = c.get('auth') as AuthContext | undefined;

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const tenantId = c.req.param('tenantId');
      const userId = c.req.param('userId');
      const body = await c.req.json<{
        role?: string;
        permissions?: string[];
        status?: 'active' | 'inactive';
      }>();

      // Check if user is admin/owner of tenant
      const isAdmin = await auth.hasRoleInTenant(authContext.userId, tenantId, 'admin') ||
                      await auth.hasRoleInTenant(authContext.userId, tenantId, 'owner');

      if (!isAdmin) {
        return c.json({ error: 'Forbidden', message: 'Admin access required' }, 403);
      }

      const membership = await auth.updateTenantMember(userId, tenantId, body);

      return c.json({
        success: true,
        membership: {
          role: membership.role,
          permissions: membership.permissions,
          status: membership.status,
        },
      });
    } catch (error) {
      if (config.onError) {
        return config.onError(error as Error, c);
      }
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  return app;
}

/**
 * Create complete Hono auth integration
 */
export function createHonoAuth(config: HonoAdapterConfig) {
  return {
    /** Auth middleware (requires authentication) */
    middleware: createAuthMiddleware(config),
    /** Optional auth middleware (attaches auth if present) */
    optionalMiddleware: createOptionalAuthMiddleware(config),
    /** Create auth routes on an app */
    createRoutes: <E extends { Variables: Partial<AuthVariables> }>(app: Hono<E>) =>
      createAuthRoutes(app, config),
  };
}

// ============================================
// AUTHORIZATION MIDDLEWARE HELPERS
// ============================================

/**
 * Helper to convert AuthContext to AuthorizationContext
 */
function toAuthorizationContext(auth: AuthContext): AuthorizationContext {
  return {
    userId: auth.userId,
    tenantId: auth.tenantId,
    roles: auth.roles,
    permissions: auth.permissions,
  };
}

/**
 * Require specific role(s)
 * Use after createAuthMiddleware
 *
 * @example
 * ```ts
 * app.get('/admin', authMiddleware, requireRole('admin'), handler);
 * app.get('/managers', authMiddleware, requireRole('admin', 'manager'), handler);
 * ```
 */
export function requireRole(
  ...allowedRoles: string[]
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const guard = createAuthorizationGuard(toAuthorizationContext(auth));

    if (!guard.hasAnyRole(allowedRoles)) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Insufficient role',
          required: allowedRoles,
          current: auth.roles ?? [],
        },
        403
      );
    }

    await next();
  };
}

/**
 * Require specific permission(s)
 * Supports wildcards: 'users:*', '*:read', '*'
 *
 * @example
 * ```ts
 * app.get('/users', authMiddleware, requirePermission('users:read'), handler);
 * app.delete('/users/:id', authMiddleware, requirePermission('users:delete'), handler);
 * ```
 */
export function requirePermission(
  ...permissions: PermissionPattern[]
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const guard = createAuthorizationGuard(toAuthorizationContext(auth));

    // Check if user has ALL required permissions
    if (!guard.hasAllPermissions(permissions)) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Missing required permissions',
          required: permissions,
          current: auth.permissions ?? [],
        },
        403
      );
    }

    await next();
  };
}

/**
 * Require any of the specified permissions
 * User only needs one of the permissions
 *
 * @example
 * ```ts
 * app.get('/content', authMiddleware, requireAnyPermission('content:read', 'content:admin'), handler);
 * ```
 */
export function requireAnyPermission(
  ...permissions: PermissionPattern[]
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const guard = createAuthorizationGuard(toAuthorizationContext(auth));

    if (!guard.hasAnyPermission(permissions)) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Missing required permissions',
          required: permissions,
          current: auth.permissions ?? [],
        },
        403
      );
    }

    await next();
  };
}

/**
 * Require tenant context
 * Ensures user has an active tenant selected
 *
 * @example
 * ```ts
 * app.use('/api/tenant/*', authMiddleware, requireTenant());
 * ```
 */
export function requireTenant(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    if (!auth.tenantId) {
      return c.json(
        { error: 'Forbidden', message: 'Tenant context required' },
        403
      );
    }

    await next();
  };
}

/**
 * Require access to specific tenant
 * Validates that user can access the tenant specified in the request
 *
 * @example
 * ```ts
 * // Check tenant from URL param
 * app.get('/tenants/:tenantId/*', authMiddleware, requireTenantAccess(c => c.req.param('tenantId')), handler);
 *
 * // Check tenant from header
 * app.use('/api/*', authMiddleware, requireTenantAccess(c => c.req.header('x-tenant-id')), handler);
 * ```
 */
export function requireTenantAccess(
  getTenantId: (c: Context) => string | undefined,
  options?: {
    /** Roles that can access any tenant (e.g., ['super_admin']) */
    bypassRoles?: string[];
  }
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const requestedTenantId = getTenantId(c);

    // If no tenant requested, allow (tenant might be optional)
    if (!requestedTenantId) {
      await next();
      return;
    }

    const guard = createAuthorizationGuard(toAuthorizationContext(auth));

    // Check bypass roles (e.g., super_admin)
    if (options?.bypassRoles && guard.hasAnyRole(options.bypassRoles)) {
      await next();
      return;
    }

    // Check if user has access to the requested tenant
    if (auth.tenantId !== requestedTenantId) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Access denied to this tenant',
          requestedTenant: requestedTenantId,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Require admin access
 * Checks for 'admin' or 'owner' role, or '*' permission
 *
 * @example
 * ```ts
 * app.use('/admin/*', authMiddleware, requireAdmin(), handler);
 * ```
 */
export function requireAdmin(): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const guard = createAuthorizationGuard(toAuthorizationContext(auth));

    const isAdmin =
      guard.hasRole('admin') ||
      guard.hasRole('owner') ||
      guard.hasRole('superadmin') ||
      guard.hasRole('super_admin') ||
      guard.hasPermission('*');

    if (!isAdmin) {
      return c.json({ error: 'Forbidden', message: 'Admin access required' }, 403);
    }

    await next();
  };
}

/**
 * Require resource ownership or permission
 * Allows access if user owns the resource OR has the specified permission
 *
 * @example
 * ```ts
 * app.put('/posts/:id', authMiddleware, requireOwnerOrPermission(
 *   async (c) => (await getPost(c.req.param('id'))).authorId,
 *   'posts:edit'
 * ), handler);
 * ```
 */
export function requireOwnerOrPermission(
  getOwnerId: (c: Context) => string | Promise<string>,
  permission: PermissionPattern
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const guard = createAuthorizationGuard(toAuthorizationContext(auth));

    // Check permission first (faster than potentially async ownership check)
    if (guard.hasPermission(permission)) {
      await next();
      return;
    }

    // Check ownership
    const ownerId = await getOwnerId(c);
    if (auth.userId === ownerId) {
      await next();
      return;
    }

    return c.json(
      {
        error: 'Forbidden',
        message: 'Resource owner or permission required',
        requiredPermission: permission,
      },
      403
    );
  };
}

/**
 * Combine multiple authorization requirements
 * All requirements must pass
 *
 * @example
 * ```ts
 * app.delete('/projects/:id',
 *   authMiddleware,
 *   requireAll(
 *     requireTenant(),
 *     requireRole('admin', 'manager'),
 *     requirePermission('projects:delete')
 *   ),
 *   handler
 * );
 * ```
 */
export function requireAll(
  ...middlewares: MiddlewareHandler<{ Variables: AuthVariables }>[]
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    for (const middleware of middlewares) {
      let passed = false;
      await middleware(c, async () => {
        passed = true;
      });
      if (!passed) {
        // Middleware already sent error response
        return;
      }
    }
    await next();
  };
}

/**
 * Combine multiple authorization requirements
 * At least one requirement must pass
 *
 * @example
 * ```ts
 * app.get('/content/:id',
 *   authMiddleware,
 *   requireAny(
 *     requireRole('admin'),
 *     requirePermission('content:read'),
 *     requireOwnerOrPermission(getContentOwnerId, 'content:view-own')
 *   ),
 *   handler
 * );
 * ```
 */
export function requireAny(
  ...middlewares: MiddlewareHandler<{ Variables: AuthVariables }>[]
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    for (const middleware of middlewares) {
      let passed = false;
      await middleware(c, async () => {
        passed = true;
      });
      if (passed) {
        await next();
        return;
      }
    }
    // None passed
    return c.json(
      { error: 'Forbidden', message: 'None of the authorization requirements were met' },
      403
    );
  };
}
