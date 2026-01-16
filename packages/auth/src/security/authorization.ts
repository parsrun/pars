/**
 * Authorization & Access Control
 * Guards for tenant, role, and permission-based access control
 */

/**
 * Authorization context - usually extracted from JWT
 */
export interface AuthorizationContext {
  userId: string;
  tenantId?: string | null;
  roles?: string[];
  permissions?: string[];
  memberships?: TenantMembershipInfo[];
}

/**
 * Tenant membership information
 */
export interface TenantMembershipInfo {
  tenantId: string;
  role: string;
  permissions: string[];
  status: 'active' | 'inactive' | 'pending';
}

/**
 * Authorization check result
 */
export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  missingPermissions?: string[];
  missingRoles?: string[];
}

/**
 * Permission pattern for matching
 * Supports wildcards: 'users:*', '*:read', '*'
 */
export type PermissionPattern = string;

/**
 * Authorization Guard
 * Checks if a user has required permissions/roles for an action
 */
export class AuthorizationGuard {
  private context: AuthorizationContext;

  constructor(context: AuthorizationContext) {
    this.context = context;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.context.userId;
  }

  /**
   * Check if user has a tenant context
   */
  hasTenant(): boolean {
    return !!this.context.tenantId;
  }

  /**
   * Check if user is member of a specific tenant
   */
  isMemberOf(tenantId: string): boolean {
    if (this.context.tenantId === tenantId) {
      return true;
    }

    if (this.context.memberships) {
      return this.context.memberships.some(
        m => m.tenantId === tenantId && m.status === 'active'
      );
    }

    return false;
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: string): boolean {
    return this.context.roles?.includes(role) ?? false;
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(roles: string[]): boolean {
    return roles.some(role => this.hasRole(role));
  }

  /**
   * Check if user has all of the specified roles
   */
  hasAllRoles(roles: string[]): boolean {
    return roles.every(role => this.hasRole(role));
  }

  /**
   * Check if user has a specific permission
   * Supports wildcards: 'users:*', '*:read', '*'
   */
  hasPermission(permission: PermissionPattern): boolean {
    const userPermissions = this.context.permissions ?? [];

    // Check for exact match
    if (userPermissions.includes(permission)) {
      return true;
    }

    // Check for super admin wildcard
    if (userPermissions.includes('*')) {
      return true;
    }

    // Check for pattern matching
    const [resource, action] = permission.split(':');

    for (const userPerm of userPermissions) {
      const [userResource, userAction] = userPerm.split(':');

      // Match 'resource:*' patterns
      if (userResource === resource && userAction === '*') {
        return true;
      }

      // Match '*:action' patterns
      if (userResource === '*' && userAction === action) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has any of the specified permissions
   */
  hasAnyPermission(permissions: PermissionPattern[]): boolean {
    return permissions.some(perm => this.hasPermission(perm));
  }

  /**
   * Check if user has all of the specified permissions
   */
  hasAllPermissions(permissions: PermissionPattern[]): boolean {
    return permissions.every(perm => this.hasPermission(perm));
  }

  /**
   * Check if user has role in specific tenant
   */
  hasRoleInTenant(tenantId: string, role: string): boolean {
    if (!this.context.memberships) {
      // Fallback to current context if no memberships
      return this.context.tenantId === tenantId && this.hasRole(role);
    }

    const membership = this.context.memberships.find(
      m => m.tenantId === tenantId && m.status === 'active'
    );

    return membership?.role === role;
  }

  /**
   * Check if user has permission in specific tenant
   */
  hasPermissionInTenant(tenantId: string, permission: PermissionPattern): boolean {
    if (!this.context.memberships) {
      // Fallback to current context if no memberships
      return this.context.tenantId === tenantId && this.hasPermission(permission);
    }

    const membership = this.context.memberships.find(
      m => m.tenantId === tenantId && m.status === 'active'
    );

    if (!membership) {
      return false;
    }

    // Check permissions from membership
    const permissions = membership.permissions;
    if (permissions.includes(permission) || permissions.includes('*')) {
      return true;
    }

    // Pattern matching
    const [resource, action] = permission.split(':');
    for (const perm of permissions) {
      const [permResource, permAction] = perm.split(':');
      if (permResource === resource && permAction === '*') return true;
      if (permResource === '*' && permAction === action) return true;
    }

    return false;
  }

  /**
   * Comprehensive authorization check
   */
  authorize(requirements: AuthorizationRequirements): AuthorizationResult {
    const result: AuthorizationResult = { allowed: true };

    // Check authentication
    if (requirements.authenticated && !this.isAuthenticated()) {
      return { allowed: false, reason: 'Authentication required' };
    }

    // Check tenant
    if (requirements.tenant && !this.hasTenant()) {
      return { allowed: false, reason: 'Tenant context required' };
    }

    // Check specific tenant membership
    if (requirements.memberOf && !this.isMemberOf(requirements.memberOf)) {
      return { allowed: false, reason: `Membership in tenant ${requirements.memberOf} required` };
    }

    // Check roles
    if (requirements.roles) {
      const mode = requirements.rolesMode ?? 'any';
      const hasRoles = mode === 'any'
        ? this.hasAnyRole(requirements.roles)
        : this.hasAllRoles(requirements.roles);

      if (!hasRoles) {
        return {
          allowed: false,
          reason: `Missing required roles`,
          missingRoles: requirements.roles.filter(r => !this.hasRole(r)),
        };
      }
    }

    // Check permissions
    if (requirements.permissions) {
      const mode = requirements.permissionsMode ?? 'all';
      const hasPermissions = mode === 'any'
        ? this.hasAnyPermission(requirements.permissions)
        : this.hasAllPermissions(requirements.permissions);

      if (!hasPermissions) {
        return {
          allowed: false,
          reason: `Missing required permissions`,
          missingPermissions: requirements.permissions.filter(p => !this.hasPermission(p)),
        };
      }
    }

    // Custom check
    if (requirements.custom && !requirements.custom(this.context)) {
      return { allowed: false, reason: requirements.customReason ?? 'Custom authorization check failed' };
    }

    return result;
  }

  /**
   * Get current tenant ID
   */
  getTenantId(): string | null {
    return this.context.tenantId ?? null;
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    return this.context.userId;
  }

  /**
   * Get all user roles
   */
  getRoles(): string[] {
    return this.context.roles ?? [];
  }

  /**
   * Get all user permissions
   */
  getPermissions(): string[] {
    return this.context.permissions ?? [];
  }

  /**
   * Get all tenant memberships
   */
  getMemberships(): TenantMembershipInfo[] {
    return this.context.memberships ?? [];
  }
}

/**
 * Authorization requirements
 */
export interface AuthorizationRequirements {
  /** User must be authenticated */
  authenticated?: boolean;
  /** User must have tenant context */
  tenant?: boolean;
  /** User must be member of specific tenant */
  memberOf?: string;
  /** Required roles */
  roles?: string[];
  /** Role check mode: 'any' (at least one) or 'all' */
  rolesMode?: 'any' | 'all';
  /** Required permissions */
  permissions?: PermissionPattern[];
  /** Permission check mode: 'any' (at least one) or 'all' */
  permissionsMode?: 'any' | 'all';
  /** Custom authorization function */
  custom?: (context: AuthorizationContext) => boolean;
  /** Custom failure reason */
  customReason?: string;
}

/**
 * Create an authorization guard
 */
export function createAuthorizationGuard(context: AuthorizationContext): AuthorizationGuard {
  return new AuthorizationGuard(context);
}

/**
 * Quick authorization checks
 */
export const authorize = {
  /**
   * Check if authenticated
   */
  isAuthenticated(context: AuthorizationContext): AuthorizationResult {
    return new AuthorizationGuard(context).authorize({ authenticated: true });
  },

  /**
   * Check if has tenant
   */
  hasTenant(context: AuthorizationContext): AuthorizationResult {
    return new AuthorizationGuard(context).authorize({ tenant: true });
  },

  /**
   * Check if has specific role
   */
  hasRole(context: AuthorizationContext, role: string): AuthorizationResult {
    return new AuthorizationGuard(context).authorize({ roles: [role] });
  },

  /**
   * Check if has specific permission
   */
  hasPermission(context: AuthorizationContext, permission: string): AuthorizationResult {
    return new AuthorizationGuard(context).authorize({ permissions: [permission] });
  },

  /**
   * Check if is member of tenant
   */
  isMemberOf(context: AuthorizationContext, tenantId: string): AuthorizationResult {
    return new AuthorizationGuard(context).authorize({ memberOf: tenantId });
  },

  /**
   * Check if is admin (has 'admin' role or '*' permission)
   */
  isAdmin(context: AuthorizationContext): AuthorizationResult {
    const guard = new AuthorizationGuard(context);
    if (guard.hasRole('admin') || guard.hasRole('superadmin') || guard.hasPermission('*')) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Admin access required' };
  },

  /**
   * Check if is owner of resource
   */
  isOwner(context: AuthorizationContext, ownerId: string): AuthorizationResult {
    if (context.userId === ownerId) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Resource owner access required' };
  },

  /**
   * Check if is owner or has permission
   */
  isOwnerOrHasPermission(
    context: AuthorizationContext,
    ownerId: string,
    permission: string
  ): AuthorizationResult {
    const guard = new AuthorizationGuard(context);
    if (context.userId === ownerId || guard.hasPermission(permission)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Owner or permission required' };
  },
};

/**
 * Common permission patterns
 */
export const Permissions = {
  // User management
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  USERS_ADMIN: 'users:*',

  // Tenant management
  TENANTS_READ: 'tenants:read',
  TENANTS_WRITE: 'tenants:write',
  TENANTS_DELETE: 'tenants:delete',
  TENANTS_ADMIN: 'tenants:*',

  // Member management
  MEMBERS_READ: 'members:read',
  MEMBERS_INVITE: 'members:invite',
  MEMBERS_REMOVE: 'members:remove',
  MEMBERS_ADMIN: 'members:*',

  // Role management
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_DELETE: 'roles:delete',
  ROLES_ADMIN: 'roles:*',

  // Super admin
  SUPER_ADMIN: '*',
} as const;

/**
 * Common roles
 */
export const Roles = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  MEMBER: 'member',
  VIEWER: 'viewer',
  GUEST: 'guest',
} as const;
