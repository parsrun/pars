/**
 * Drizzle Adapter Types
 * Database table definitions for auth (PostgreSQL)
 */

/**
 * Database schema types - these should match your actual Drizzle schema
 * Import these from your database package when using the adapter
 */

export interface DrizzleAuthSchema {
  /** Users table */
  users: any;
  /** Sessions table */
  sessions: any;
  /** Auth methods table (email, phone, oauth) */
  authMethods: any;
  /** Tenants table */
  tenants?: any;
  /** Tenant memberships table */
  tenantMemberships?: any;
  /** Roles table */
  roles?: any;
  /** Email verification tokens table */
  emailVerificationTokens?: any;
  /** TOTP secrets table */
  totpSecrets?: any;
  /** WebAuthn credentials table */
  webauthnCredentials?: any;
  /** OAuth states table */
  oauthStates?: any;
  /** Magic link tokens table */
  magicLinkTokens?: any;
  /** Audit log table */
  authAuditLog?: any;
}

/**
 * User model
 */
export interface DrizzleUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  insertedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Session model
 */
export interface DrizzleSession {
  id: string;
  userId: string;
  authMethodId: string | null;
  currentTenantId: string | null;
  accessTokenHash: string | null;
  refreshTokenHash: string | null;
  csrfTokenHash: string;
  expiresAt: Date;
  refreshExpiresAt: Date | null;
  deviceType: string | null;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  locationData: Record<string, unknown> | null;
  deviceFingerprint: string | null;
  status: string;
  lastActivityAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  insertedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Auth method model
 */
export interface DrizzleAuthMethod {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  verified: boolean;
  metadata: Record<string, unknown> | null;
  insertedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Tenant model
 */
export interface DrizzleTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscriptionPlan: string;
  settings: Record<string, unknown>;
  insertedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Tenant membership model
 */
export interface DrizzleTenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  roleId: string | null;
  status: string;
  permissions: Record<string, unknown>;
  accessLevel: string;
  resourceRestrictions: Record<string, unknown>;
  ipRestrictions: Record<string, unknown> | null;
  timeRestrictions: Record<string, unknown> | null;
  expiresAt: Date | null;
  invitedBy: string | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  lastLoginAt: Date | null;
  insertedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Role model
 */
export interface DrizzleRole {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  color: string | null;
  insertedAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Email verification token model
 */
export interface DrizzleEmailVerificationToken {
  id: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdBy: string | null;
  insertedAt: Date;
  updatedAt: Date;
}

/**
 * Drizzle database instance type
 */
export type DrizzleDatabase = {
  select: (fields?: any) => any;
  insert: (table: any) => any;
  update: (table: any) => any;
  delete: (table: any) => any;
  query: Record<string, any>;
};
