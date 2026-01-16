/**
 * @parsrun/core - Type Definitions
 */

// ============================================
// TENANT TYPES
// ============================================

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

export type TenantStatus = "active" | "suspended" | "pending" | "deleted";

// ============================================
// USER TYPES
// ============================================

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

export type MembershipStatus = "pending" | "active" | "suspended" | "expired" | "revoked";

export type AccessLevel = "full" | "limited" | "readonly" | "custom";

export interface MembershipPermissions {
  [resource: string]: string[];
}

export interface ResourceRestrictions {
  locations?: string[];
  departments?: string[];
  projects?: string[];
  [key: string]: string[] | undefined;
}

export interface IpRestrictions {
  allowedIps?: string[];
  allowedCidrs?: string[];
  deniedIps?: string[];
}

export interface TimeRestrictions {
  timezone?: string;
  allowedDays?: number[]; // 0-6, Sunday = 0
  allowedHoursStart?: number; // 0-23
  allowedHoursEnd?: number; // 0-23
}

// ============================================
// AUTH CONTEXT
// ============================================

export interface AuthContext {
  user: User;
  session: Session;
  tenant: Tenant;
  membership: TenantMembership;
}

// ============================================
// PAGINATION
// ============================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

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

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================
// UTILITY TYPES
// ============================================

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];
