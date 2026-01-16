/**
 * @parsrun/core - Type Definitions
 *
 * Core type definitions for multi-tenant applications including users,
 * sessions, tenants, memberships, and common utility types.
 */

// ============================================
// TENANT TYPES
// ============================================

/**
 * Represents a tenant (organization/workspace) in a multi-tenant application.
 * Each tenant has its own isolated data and can have multiple users.
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan?: string;
  settings?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Possible states for a tenant.
 * - `active`: Tenant is fully operational
 * - `suspended`: Tenant access is temporarily disabled
 * - `pending`: Tenant is awaiting activation or verification
 * - `deleted`: Tenant has been soft-deleted
 */
export type TenantStatus = "active" | "suspended" | "pending" | "deleted";

// ============================================
// USER TYPES
// ============================================

/**
 * Represents a user in the system.
 * Users can belong to multiple tenants through memberships.
 */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents an authenticated user session.
 * Sessions are scoped to a specific user and tenant.
 */
export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// ============================================
// MEMBERSHIP TYPES
// ============================================

/**
 * Represents a user's membership in a tenant.
 * Contains role, permissions, and access restrictions.
 */
export interface TenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  roleId?: string;
  permissions: MembershipPermissions;
  accessLevel: AccessLevel;
  resourceRestrictions: ResourceRestrictions;
  ipRestrictions?: IpRestrictions;
  timeRestrictions?: TimeRestrictions;
  status: MembershipStatus;
  expiresAt?: Date;
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Possible states for a tenant membership.
 * - `pending`: Invitation sent, awaiting acceptance
 * - `active`: Membership is active and user has access
 * - `suspended`: Membership temporarily disabled
 * - `expired`: Membership has passed its expiration date
 * - `revoked`: Membership has been permanently revoked
 */
export type MembershipStatus = "pending" | "active" | "suspended" | "expired" | "revoked";

/**
 * Access level for a membership.
 * - `full`: Complete access to all resources
 * - `limited`: Restricted access based on permissions
 * - `readonly`: Can view but not modify resources
 * - `custom`: Custom permission set defined by permissions field
 */
export type AccessLevel = "full" | "limited" | "readonly" | "custom";

/**
 * Maps resources to allowed actions.
 * Keys are resource names, values are arrays of permitted actions.
 *
 * @example
 * ```typescript
 * const permissions: MembershipPermissions = {
 *   users: ['read', 'create'],
 *   settings: ['read']
 * };
 * ```
 */
export interface MembershipPermissions {
  [resource: string]: string[];
}

/**
 * Restricts access to specific resources within a tenant.
 * Can limit access by location, department, project, or custom dimensions.
 */
export interface ResourceRestrictions {
  /** Allowed location IDs */
  locations?: string[];
  /** Allowed department IDs */
  departments?: string[];
  /** Allowed project IDs */
  projects?: string[];
  /** Custom resource restrictions */
  [key: string]: string[] | undefined;
}

/**
 * IP-based access restrictions for a membership.
 * Can whitelist or blacklist specific IPs or CIDR ranges.
 */
export interface IpRestrictions {
  /** Specific IP addresses that are allowed */
  allowedIps?: string[];
  /** CIDR ranges that are allowed (e.g., "192.168.1.0/24") */
  allowedCidrs?: string[];
  /** Specific IP addresses that are denied */
  deniedIps?: string[];
}

/**
 * Time-based access restrictions for a membership.
 * Can limit access to specific days and hours.
 */
export interface TimeRestrictions {
  /** Timezone for time calculations (e.g., "America/New_York") */
  timezone?: string;
  /** Days of the week when access is allowed (0-6, Sunday = 0) */
  allowedDays?: number[];
  /** Hour when access begins (0-23) */
  allowedHoursStart?: number;
  /** Hour when access ends (0-23) */
  allowedHoursEnd?: number;
}

// ============================================
// AUTH CONTEXT
// ============================================

/**
 * Complete authentication context for a request.
 * Contains the authenticated user, their session, tenant, and membership.
 */
export interface AuthContext {
  user: User;
  session: Session;
  tenant: Tenant;
  membership: TenantMembership;
}

// ============================================
// PAGINATION
// ============================================

/**
 * Parameters for paginated queries.
 * Supports both offset-based and cursor-based pagination.
 */
export interface PaginationParams {
  /** Page number (1-indexed) for offset pagination */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Cursor for cursor-based pagination */
  cursor?: string;
}

/**
 * Result of a paginated query.
 * Contains the data array and pagination metadata.
 *
 * @typeParam T - The type of items in the result
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor?: string;
  };
}

// ============================================
// RESULT TYPES
// ============================================

/**
 * A discriminated union type representing either success or failure.
 * Use pattern matching to safely handle both cases.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type (defaults to Error)
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err('Division by zero');
 *   return ok(a / b);
 * }
 *
 * const result = divide(10, 2);
 * if (result.success) {
 *   console.log(result.data); // 5
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a successful Result.
 *
 * @param data - The success value
 * @returns A Result indicating success with the provided data
 *
 * @example
 * ```typescript
 * return ok({ id: 1, name: 'John' });
 * ```
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failed Result.
 *
 * @param error - The error value
 * @returns A Result indicating failure with the provided error
 *
 * @example
 * ```typescript
 * return err(new Error('User not found'));
 * ```
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Flattens complex intersection types for better IDE display.
 * Use this to make hover information more readable.
 *
 * @typeParam T - The type to prettify
 *
 * @example
 * ```typescript
 * type Ugly = { a: string } & { b: number };
 * type Pretty = Prettify<Ugly>; // { a: string; b: number }
 * ```
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Makes all properties in T optional recursively.
 * Useful for partial updates or patch operations.
 *
 * @typeParam T - The type to make deeply partial
 *
 * @example
 * ```typescript
 * interface User { name: string; address: { city: string } }
 * type PartialUser = DeepPartial<User>;
 * // { name?: string; address?: { city?: string } }
 * ```
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Requires at least one of the specified keys to be present.
 * Useful for APIs that need at least one identifier.
 *
 * @typeParam T - The base type
 * @typeParam Keys - The keys of which at least one must be present
 *
 * @example
 * ```typescript
 * interface Query { id?: string; email?: string; name?: string }
 * type UserQuery = RequireAtLeastOne<Query, 'id' | 'email'>;
 * // Must have either id or email (or both)
 * ```
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];
