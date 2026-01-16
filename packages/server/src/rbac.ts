/**
 * @parsrun/server - Role-Based Access Control (RBAC)
 * Permission and role management with middleware
 */

import { ForbiddenError, UnauthorizedError } from "@parsrun/core";
import type {
  ContextUser,
  HonoContext,
  HonoNext,
  Middleware,
  PermissionCheck,
  PermissionDefinition,
  RoleDefinition,
} from "./context.js";

/**
 * RBAC Permission Checker interface
 * Implement this for database-backed permission checks
 */
export interface PermissionChecker {
  /** Get user's permissions in a tenant */
  getUserPermissions(userId: string, tenantId?: string): Promise<string[]>;
  /** Get user's roles in a tenant */
  getUserRoles(userId: string, tenantId?: string): Promise<string[]>;
  /** Check if user has specific permission */
  hasPermission(userId: string, check: PermissionCheck, tenantId?: string): Promise<boolean>;
  /** Check if user is member of tenant */
  isTenantMember(userId: string, tenantId: string): Promise<boolean>;
}

/**
 * In-memory RBAC service
 * For simple use cases or testing
 */
export class InMemoryRBAC implements PermissionChecker {
  private userPermissions: Map<string, Set<string>> = new Map();
  private userRoles: Map<string, Set<string>> = new Map();
  private rolePermissions: Map<string, Set<string>> = new Map();
  private tenantMembers: Map<string, Set<string>> = new Map();

  /**
   * Grant permission to user
   */
  grantPermission(userId: string, permission: string): void {
    if (!this.userPermissions.has(userId)) {
      this.userPermissions.set(userId, new Set());
    }
    this.userPermissions.get(userId)!.add(permission);
  }

  /**
   * Revoke permission from user
   */
  revokePermission(userId: string, permission: string): void {
    this.userPermissions.get(userId)?.delete(permission);
  }

  /**
   * Assign role to user
   */
  assignRole(userId: string, role: string): void {
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }
    this.userRoles.get(userId)!.add(role);
  }

  /**
   * Remove role from user
   */
  removeRole(userId: string, role: string): void {
    this.userRoles.get(userId)?.delete(role);
  }

  /**
   * Define role with permissions
   */
  defineRole(roleName: string, permissions: string[]): void {
    this.rolePermissions.set(roleName, new Set(permissions));
  }

  /**
   * Add user to tenant
   */
  addTenantMember(tenantId: string, userId: string): void {
    if (!this.tenantMembers.has(tenantId)) {
      this.tenantMembers.set(tenantId, new Set());
    }
    this.tenantMembers.get(tenantId)!.add(userId);
  }

  /**
   * Remove user from tenant
   */
  removeTenantMember(tenantId: string, userId: string): void {
    this.tenantMembers.get(tenantId)?.delete(userId);
  }

  // PermissionChecker implementation

  async getUserPermissions(userId: string, _tenantId?: string): Promise<string[]> {
    const permissions = new Set<string>();

    // Direct permissions
    const direct = this.userPermissions.get(userId);
    if (direct) {
      direct.forEach((p) => permissions.add(p));
    }

    // Role-based permissions
    const roles = this.userRoles.get(userId);
    if (roles) {
      roles.forEach((role) => {
        const rolePerms = this.rolePermissions.get(role);
        if (rolePerms) {
          rolePerms.forEach((p) => permissions.add(p));
        }
      });
    }

    return Array.from(permissions);
  }

  async getUserRoles(userId: string, _tenantId?: string): Promise<string[]> {
    return Array.from(this.userRoles.get(userId) ?? []);
  }

  async hasPermission(
    userId: string,
    check: PermissionCheck,
    tenantId?: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, tenantId);
    const permissionName = `${check.resource}:${check.action}`;

    // Check exact match
    if (permissions.includes(permissionName)) {
      return true;
    }

    // Check wildcard patterns
    // users:* matches users:read, users:create, etc.
    // *:read matches items:read, users:read, etc.
    // * matches everything
    for (const perm of permissions) {
      if (perm === "*") return true;
      if (perm === `${check.resource}:*`) return true;
      if (perm === `*:${check.action}`) return true;
    }

    return false;
  }

  async isTenantMember(userId: string, tenantId: string): Promise<boolean> {
    return this.tenantMembers.get(tenantId)?.has(userId) ?? false;
  }
}

/**
 * RBAC Service for authorization checks
 */
export class RBACService {
  constructor(private checker: PermissionChecker) {}

  /**
   * Get user's permissions
   */
  async getUserPermissions(userId: string, tenantId?: string): Promise<string[]> {
    return this.checker.getUserPermissions(userId, tenantId);
  }

  /**
   * Get user's roles
   */
  async getUserRoles(userId: string, tenantId?: string): Promise<string[]> {
    return this.checker.getUserRoles(userId, tenantId);
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(
    userId: string,
    check: PermissionCheck,
    tenantId?: string
  ): Promise<boolean> {
    return this.checker.hasPermission(userId, check, tenantId);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(
    userId: string,
    checks: PermissionCheck[],
    tenantId?: string
  ): Promise<boolean> {
    for (const check of checks) {
      if (await this.hasPermission(userId, check, tenantId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if user has all specified permissions
   */
  async hasAllPermissions(
    userId: string,
    checks: PermissionCheck[],
    tenantId?: string
  ): Promise<boolean> {
    for (const check of checks) {
      if (!(await this.hasPermission(userId, check, tenantId))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if user is member of tenant
   */
  async isTenantMember(userId: string, tenantId: string): Promise<boolean> {
    return this.checker.isTenantMember(userId, tenantId);
  }

  /**
   * Check if user has specific role
   */
  async hasRole(userId: string, role: string, tenantId?: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId, tenantId);
    return roles.includes(role);
  }

  /**
   * Check if user has any of the specified roles
   */
  async hasAnyRole(userId: string, roles: string[], tenantId?: string): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId, tenantId);
    return roles.some((role) => userRoles.includes(role));
  }
}

/**
 * Create RBAC service with in-memory checker
 */
export function createInMemoryRBAC(): { rbac: RBACService; checker: InMemoryRBAC } {
  const checker = new InMemoryRBAC();
  const rbac = new RBACService(checker);
  return { rbac, checker };
}

/**
 * Create RBAC service with custom checker
 */
export function createRBACService(checker: PermissionChecker): RBACService {
  return new RBACService(checker);
}

// ============================================
// MIDDLEWARE FACTORIES
// ============================================

/**
 * Require authentication middleware
 */
export function requireAuth(): Middleware {
  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const user = c.get("user");

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    return next();
  };
}

/**
 * Require specific permission middleware
 *
 * @example
 * ```typescript
 * app.get('/items', requirePermission('items', 'read'), handler);
 * app.post('/items', requirePermission('items', 'create'), handler);
 * ```
 */
export function requirePermission(
  resource: string,
  action: string,
  options: { scope?: "tenant" | "global" | "own"; checker?: PermissionChecker } = {}
): Middleware {
  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const user = c.get("user");

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const check: PermissionCheck = {
      resource,
      action,
      scope: options.scope ?? "tenant",
    };

    // Use custom checker or check from user permissions
    let hasPermission = false;

    if (options.checker) {
      hasPermission = await options.checker.hasPermission(user.id, check, user.tenantId);
    } else {
      // Check from user's loaded permissions
      hasPermission = checkUserPermission(user, check);
    }

    if (!hasPermission) {
      throw new ForbiddenError(`Permission denied: ${resource}:${action}`);
    }

    return next();
  };
}

/**
 * Require any of specified permissions middleware
 */
export function requireAnyPermission(
  permissions: Array<{ resource: string; action: string }>,
  options: { checker?: PermissionChecker } = {}
): Middleware {
  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const user = c.get("user");

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    let hasAny = false;

    for (const perm of permissions) {
      const check: PermissionCheck = { resource: perm.resource, action: perm.action };

      if (options.checker) {
        if (await options.checker.hasPermission(user.id, check, user.tenantId)) {
          hasAny = true;
          break;
        }
      } else {
        if (checkUserPermission(user, check)) {
          hasAny = true;
          break;
        }
      }
    }

    if (!hasAny) {
      throw new ForbiddenError("Insufficient permissions");
    }

    return next();
  };
}

/**
 * Require specific role middleware
 */
export function requireRole(role: string): Middleware {
  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const user = c.get("user");

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    if (user.role !== role) {
      throw new ForbiddenError(`Role required: ${role}`);
    }

    return next();
  };
}

/**
 * Require any of specified roles middleware
 */
export function requireAnyRole(roles: string[]): Middleware {
  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const user = c.get("user");

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!user.role || !roles.includes(user.role)) {
      throw new ForbiddenError(`One of these roles required: ${roles.join(", ")}`);
    }

    return next();
  };
}

/**
 * Require tenant membership middleware
 */
export function requireTenantMember(requiredRole?: string): Middleware {
  return async (c: HonoContext, next: HonoNext): Promise<Response | void> => {
    const user = c.get("user");
    const tenant = c.get("tenant");

    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!tenant) {
      throw new ForbiddenError("Tenant context required");
    }

    if (user.tenantId !== tenant.id) {
      throw new ForbiddenError("Not a member of this tenant");
    }

    if (requiredRole && user.role !== requiredRole) {
      throw new ForbiddenError(`Role required in tenant: ${requiredRole}`);
    }

    return next();
  };
}

/**
 * Check user permission from loaded permissions array
 */
function checkUserPermission(user: ContextUser, check: PermissionCheck): boolean {
  const permissionName = `${check.resource}:${check.action}`;

  for (const perm of user.permissions) {
    if (perm === permissionName) return true;
    if (perm === "*") return true;
    if (perm === `${check.resource}:*`) return true;
    if (perm === `*:${check.action}`) return true;
  }

  return false;
}

// ============================================
// PERMISSION UTILITIES
// ============================================

/**
 * Parse permission string to PermissionCheck
 */
export function parsePermission(permission: string): PermissionCheck {
  const [resource, action] = permission.split(":");
  if (!resource || !action) {
    throw new Error(`Invalid permission format: ${permission}`);
  }
  return { resource, action };
}

/**
 * Create permission string from parts
 */
export function createPermission(resource: string, action: string): string {
  return `${resource}:${action}`;
}

/**
 * Standard CRUD permissions for a resource
 */
export function crudPermissions(resource: string): PermissionDefinition[] {
  return [
    { name: `${resource}:create`, resource, action: "create" },
    { name: `${resource}:read`, resource, action: "read" },
    { name: `${resource}:update`, resource, action: "update" },
    { name: `${resource}:delete`, resource, action: "delete" },
    { name: `${resource}:list`, resource, action: "list" },
  ];
}

/**
 * Standard roles
 */
export const StandardRoles: Record<string, RoleDefinition> = {
  OWNER: {
    name: "owner",
    displayName: "Owner",
    description: "Full access to all resources",
    permissions: ["*"],
    isSystem: true,
  },
  ADMIN: {
    name: "admin",
    displayName: "Administrator",
    description: "Administrative access",
    permissions: ["*:read", "*:create", "*:update", "*:list"],
    isSystem: true,
  },
  MEMBER: {
    name: "member",
    displayName: "Member",
    description: "Standard member access",
    permissions: ["*:read", "*:list"],
    isSystem: true,
  },
  VIEWER: {
    name: "viewer",
    displayName: "Viewer",
    description: "Read-only access",
    permissions: ["*:read", "*:list"],
    isSystem: true,
  },
};
