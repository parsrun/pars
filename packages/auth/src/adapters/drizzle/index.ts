/**
 * Drizzle ORM Adapter for @parsrun/auth
 * Implements AuthAdapter interface using Drizzle ORM with PostgreSQL
 */

import { eq, and, desc, isNull, like } from 'drizzle-orm';
import type {
  AuthAdapter,
  AdapterUser,
  AdapterSession,
  AdapterAuthMethod,
  AdapterTenant,
  AdapterMembership,
  CreateUserInput,
  CreateSessionInput,
  CreateAuthMethodInput,
  CreateMembershipInput,
  CreateTenantInput,
} from '../../config.js';
import type {
  DrizzleDatabase,
  DrizzleAuthSchema,
  DrizzleUser,
  DrizzleSession,
  DrizzleAuthMethod,
  DrizzleTenant,
  DrizzleTenantMembership,
} from './types.js';

// Re-export types
export * from './types.js';

/**
 * Drizzle adapter configuration
 */
export interface DrizzleAdapterConfig {
  /** Drizzle database instance */
  db: DrizzleDatabase;
  /** Database schema with auth tables */
  schema: DrizzleAuthSchema;
  /** Enable soft deletes (default: true) */
  softDelete?: boolean;
  /** Enable audit logging (default: false) */
  enableAuditLog?: boolean;
}

/**
 * Convert Drizzle user to adapter user
 */
function toAdapterUser(user: DrizzleUser, authMethod?: DrizzleAuthMethod): AdapterUser {
  return {
    id: user.id,
    email: authMethod?.provider === 'email' ? authMethod.providerId : null,
    phone: authMethod?.provider === 'phone' ? authMethod.providerId : null,
    name: user.displayName ?? null,
    avatar: user.avatarUrl ?? null,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    status: user.status as AdapterUser['status'],
    createdAt: user.insertedAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Convert Drizzle session to adapter session
 */
function toAdapterSession(session: DrizzleSession): AdapterSession {
  return {
    id: session.id,
    userId: session.userId,
    tenantId: session.currentTenantId ?? null,
    expiresAt: session.expiresAt,
    refreshExpiresAt: session.refreshExpiresAt ?? null,
    deviceType: session.deviceType ?? null,
    deviceName: session.deviceName ?? null,
    userAgent: session.userAgent ?? null,
    ipAddress: session.ipAddress ?? null,
    status: session.status as AdapterSession['status'],
    createdAt: session.insertedAt,
    updatedAt: session.updatedAt,
  };
}

/**
 * Convert Drizzle auth method to adapter auth method
 */
function toAdapterAuthMethod(method: DrizzleAuthMethod): AdapterAuthMethod {
  return {
    id: method.id,
    userId: method.userId,
    provider: method.provider,
    providerId: method.providerId,
    verified: method.verified,
    metadata: method.metadata ?? undefined,
    createdAt: method.insertedAt,
    updatedAt: method.updatedAt,
  };
}

/**
 * Convert Drizzle tenant to adapter tenant
 */
function toAdapterTenant(tenant: DrizzleTenant): AdapterTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status as AdapterTenant['status'],
    parentId: tenant.parentId,
    path: tenant.path,
    depth: tenant.depth,
    createdAt: tenant.insertedAt,
    updatedAt: tenant.updatedAt,
  };
}

/**
 * Convert Drizzle membership to adapter membership
 */
function toAdapterMembership(membership: DrizzleTenantMembership, roleName?: string): AdapterMembership {
  return {
    id: membership.id,
    userId: membership.userId,
    tenantId: membership.tenantId,
    role: roleName ?? 'member',
    permissions: membership.permissions ? Object.keys(membership.permissions) : undefined,
    status: membership.status as AdapterMembership['status'],
    createdAt: membership.insertedAt,
    updatedAt: membership.updatedAt,
  };
}

/**
 * Create Drizzle adapter
 */
export function createDrizzleAdapter(config: DrizzleAdapterConfig): AuthAdapter {
  const { db, schema, softDelete = true } = config;
  const { users, sessions, authMethods, tenants, tenantMemberships, roles } = schema;

  return {
    // ============================================
    // User Operations
    // ============================================

    async createUser(input: CreateUserInput): Promise<AdapterUser> {
      const [user] = await db
        .insert(users)
        .values({
          displayName: input.name,
          avatarUrl: input.avatar,
          emailVerified: input.emailVerified ?? false,
          phoneVerified: input.phoneVerified ?? false,
          twoFactorEnabled: false,
          status: 'active',
          metadata: {},
        })
        .returning();

      // Create auth method if email or phone provided
      let authMethod: DrizzleAuthMethod | undefined;
      if (input.email) {
        [authMethod] = await db
          .insert(authMethods)
          .values({
            userId: user.id,
            provider: 'email',
            providerId: input.email.toLowerCase(),
            verified: input.emailVerified ?? false,
          })
          .returning();
      } else if (input.phone) {
        [authMethod] = await db
          .insert(authMethods)
          .values({
            userId: user.id,
            provider: 'phone',
            providerId: input.phone,
            verified: input.phoneVerified ?? false,
          })
          .returning();
      }

      return toAdapterUser(user, authMethod);
    },

    async findUserById(id: string): Promise<AdapterUser | null> {
      const [result] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), softDelete ? isNull(users.deletedAt) : undefined))
        .limit(1);

      if (!result) return null;

      // Get primary auth method
      const [authMethod] = await db
        .select()
        .from(authMethods)
        .where(and(eq(authMethods.userId, id), isNull(authMethods.deletedAt)))
        .limit(1);

      return toAdapterUser(result, authMethod);
    },

    async findUserByEmail(email: string): Promise<AdapterUser | null> {
      const normalizedEmail = email.toLowerCase().trim();

      const [result] = await db
        .select({
          user: users,
          authMethod: authMethods,
        })
        .from(authMethods)
        .innerJoin(users, eq(authMethods.userId, users.id))
        .where(
          and(
            eq(authMethods.provider, 'email'),
            eq(authMethods.providerId, normalizedEmail),
            softDelete ? isNull(users.deletedAt) : undefined
          )
        )
        .limit(1);

      if (!result) return null;

      return toAdapterUser(result.user, result.authMethod);
    },

    async findUserByPhone(phone: string): Promise<AdapterUser | null> {
      const [result] = await db
        .select({
          user: users,
          authMethod: authMethods,
        })
        .from(authMethods)
        .innerJoin(users, eq(authMethods.userId, users.id))
        .where(
          and(
            eq(authMethods.provider, 'phone'),
            eq(authMethods.providerId, phone),
            softDelete ? isNull(users.deletedAt) : undefined
          )
        )
        .limit(1);

      if (!result) return null;

      return toAdapterUser(result.user, result.authMethod);
    },

    async updateUser(
      id: string,
      data: Partial<AdapterUser>
    ): Promise<AdapterUser> {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updateData['displayName'] = data.name;
      if (data.avatar !== undefined) updateData['avatarUrl'] = data.avatar;
      if (data.emailVerified !== undefined) updateData['emailVerified'] = data.emailVerified;
      if (data.phoneVerified !== undefined) updateData['phoneVerified'] = data.phoneVerified;
      if (data.twoFactorEnabled !== undefined) updateData['twoFactorEnabled'] = data.twoFactorEnabled;
      if (data.status !== undefined) updateData['status'] = data.status;

      const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

      const [authMethod] = await db
        .select()
        .from(authMethods)
        .where(eq(authMethods.userId, id))
        .limit(1);

      return toAdapterUser(user, authMethod);
    },

    async deleteUser(id: string): Promise<void> {
      if (softDelete) {
        await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
      } else {
        await db.delete(users).where(eq(users.id, id));
      }
    },

    // ============================================
    // Session Operations
    // ============================================

    async createSession(input: CreateSessionInput): Promise<AdapterSession> {
      const [session] = await db
        .insert(sessions)
        .values({
          userId: input.userId,
          currentTenantId: input.tenantId,
          expiresAt: input.expiresAt,
          refreshExpiresAt: input.refreshExpiresAt,
          deviceType: input.deviceType,
          deviceName: input.deviceName,
          userAgent: input.userAgent,
          ipAddress: input.ipAddress,
          status: 'active',
          csrfTokenHash: '',
          lastActivityAt: new Date(),
        })
        .returning();

      return toAdapterSession(session);
    },

    async findSessionById(id: string): Promise<AdapterSession | null> {
      const [session] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.status, 'active')))
        .limit(1);

      if (!session) return null;

      return toAdapterSession(session);
    },

    async findSessionsByUserId(userId: string): Promise<AdapterSession[]> {
      const result = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, userId), eq(sessions.status, 'active')))
        .orderBy(desc(sessions.lastActivityAt));

      return result.map(toAdapterSession);
    },

    async updateSession(
      id: string,
      data: Partial<AdapterSession>
    ): Promise<AdapterSession> {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.tenantId !== undefined) updateData['currentTenantId'] = data.tenantId;
      if (data.expiresAt !== undefined) updateData['expiresAt'] = data.expiresAt;
      if (data.refreshExpiresAt !== undefined) updateData['refreshExpiresAt'] = data.refreshExpiresAt;
      if (data.status !== undefined) updateData['status'] = data.status;

      const [session] = await db
        .update(sessions)
        .set(updateData)
        .where(eq(sessions.id, id))
        .returning();

      return toAdapterSession(session);
    },

    async deleteSession(id: string): Promise<void> {
      await db
        .update(sessions)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(sessions.id, id));
    },

    async deleteSessionsByUserId(userId: string): Promise<void> {
      await db
        .update(sessions)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(sessions.userId, userId));
    },

    // ============================================
    // Auth Method Operations
    // ============================================

    async createAuthMethod(input: CreateAuthMethodInput): Promise<AdapterAuthMethod> {
      const [method] = await db
        .insert(authMethods)
        .values({
          userId: input.userId,
          provider: input.provider,
          providerId: input.providerId,
          verified: input.verified ?? false,
          metadata: input.metadata ?? {},
        })
        .returning();

      return toAdapterAuthMethod(method);
    },

    async findAuthMethod(provider: string, providerId: string): Promise<AdapterAuthMethod | null> {
      const [method] = await db
        .select()
        .from(authMethods)
        .where(
          and(
            eq(authMethods.provider, provider),
            eq(authMethods.providerId, providerId),
            softDelete ? isNull(authMethods.deletedAt) : undefined
          )
        )
        .limit(1);

      if (!method) return null;

      return toAdapterAuthMethod(method);
    },

    async findAuthMethodsByUserId(userId: string): Promise<AdapterAuthMethod[]> {
      const result = await db
        .select()
        .from(authMethods)
        .where(
          and(eq(authMethods.userId, userId), softDelete ? isNull(authMethods.deletedAt) : undefined)
        );

      return result.map(toAdapterAuthMethod);
    },

    async deleteAuthMethod(id: string): Promise<void> {
      if (softDelete) {
        await db.update(authMethods).set({ deletedAt: new Date() }).where(eq(authMethods.id, id));
      } else {
        await db.delete(authMethods).where(eq(authMethods.id, id));
      }
    },

    // ============================================
    // Tenant Operations (Optional)
    // ============================================

    async findTenantById(id: string): Promise<AdapterTenant | null> {
      if (!tenants) return null;

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(and(eq(tenants.id, id), softDelete ? isNull(tenants.deletedAt) : undefined))
        .limit(1);

      if (!tenant) return null;

      return toAdapterTenant(tenant);
    },

    async findTenantBySlug(slug: string): Promise<AdapterTenant | null> {
      if (!tenants) return null;

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(and(eq(tenants.slug, slug), softDelete ? isNull(tenants.deletedAt) : undefined))
        .limit(1);

      if (!tenant) return null;

      return toAdapterTenant(tenant);
    },

    async createTenant(input: CreateTenantInput): Promise<AdapterTenant> {
      if (!tenants) {
        throw new Error('Tenants table not configured');
      }

      const [tenant] = await db
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          status: input.status ?? 'active',
          parentId: input.parentId ?? null,
          path: input.path ?? null,
          depth: input.depth ?? null,
          subscriptionPlan: 'free',
          settings: {},
        })
        .returning();

      return toAdapterTenant(tenant);
    },

    async updateTenant(id: string, data: Partial<AdapterTenant>): Promise<AdapterTenant> {
      if (!tenants) {
        throw new Error('Tenants table not configured');
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updateData['name'] = data.name;
      if (data.slug !== undefined) updateData['slug'] = data.slug;
      if (data.status !== undefined) updateData['status'] = data.status;
      if (data.parentId !== undefined) updateData['parentId'] = data.parentId;
      if (data.path !== undefined) updateData['path'] = data.path;
      if (data.depth !== undefined) updateData['depth'] = data.depth;

      const [tenant] = await db
        .update(tenants)
        .set(updateData)
        .where(eq(tenants.id, id))
        .returning();

      return toAdapterTenant(tenant);
    },

    async deleteTenant(id: string): Promise<void> {
      if (!tenants) return;

      if (softDelete) {
        await db.update(tenants).set({ deletedAt: new Date() }).where(eq(tenants.id, id));
      } else {
        await db.delete(tenants).where(eq(tenants.id, id));
      }
    },

    // ============================================
    // Tenant Hierarchy Operations (Optional)
    // ============================================

    async findTenantsByParentId(parentId: string | null): Promise<AdapterTenant[]> {
      if (!tenants) return [];

      const result = await db
        .select()
        .from(tenants)
        .where(
          and(
            parentId === null ? isNull(tenants.parentId) : eq(tenants.parentId, parentId),
            softDelete ? isNull(tenants.deletedAt) : undefined
          )
        );

      return result.map(toAdapterTenant);
    },

    async findTenantsByPath(pathPrefix: string): Promise<AdapterTenant[]> {
      if (!tenants) return [];

      const result = await db
        .select()
        .from(tenants)
        .where(
          and(
            like(tenants.path, `${pathPrefix}%`),
            softDelete ? isNull(tenants.deletedAt) : undefined
          )
        );

      return result.map(toAdapterTenant);
    },

    async updateTenantPath(tenantId: string, path: string, depth: number): Promise<void> {
      if (!tenants) return;

      await db
        .update(tenants)
        .set({ path, depth, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));
    },

    // ============================================
    // Membership Operations (Optional)
    // ============================================

    async findMembership(userId: string, tenantId: string): Promise<AdapterMembership | null> {
      if (!tenantMemberships) return null;

      const [membership] = await db
        .select()
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.userId, userId),
            eq(tenantMemberships.tenantId, tenantId),
            softDelete ? isNull(tenantMemberships.deletedAt) : undefined
          )
        )
        .limit(1);

      if (!membership) return null;

      // Get role name if roles table exists
      let roleName: string | undefined;
      if (roles && membership.roleId) {
        const [role] = await db
          .select()
          .from(roles)
          .where(eq(roles.id, membership.roleId))
          .limit(1);
        roleName = role?.name;
      }

      return toAdapterMembership(membership, roleName);
    },

    async findMembershipsByUserId(userId: string): Promise<AdapterMembership[]> {
      if (!tenantMemberships) return [];

      const result = await db
        .select()
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.userId, userId),
            eq(tenantMemberships.status, 'active'),
            softDelete ? isNull(tenantMemberships.deletedAt) : undefined
          )
        );

      // Get role names if roles table exists
      const membershipsWithRoles = await Promise.all(
        result.map(async (membership: DrizzleTenantMembership) => {
          let roleName: string | undefined;
          if (roles && membership.roleId) {
            const [role] = await db
              .select()
              .from(roles)
              .where(eq(roles.id, membership.roleId))
              .limit(1);
            roleName = role?.name;
          }
          return toAdapterMembership(membership, roleName);
        })
      );

      return membershipsWithRoles;
    },

    async createMembership(input: CreateMembershipInput): Promise<AdapterMembership> {
      if (!tenantMemberships) {
        throw new Error('Tenant memberships table not configured');
      }

      // Find role by name if roles table exists
      let roleId: string | undefined;
      if (roles && input.role) {
        const [role] = await db
          .select()
          .from(roles)
          .where(eq(roles.name, input.role))
          .limit(1);
        roleId = role?.id;
      }

      const [membership] = await db
        .insert(tenantMemberships)
        .values({
          userId: input.userId,
          tenantId: input.tenantId,
          roleId: roleId ?? null,
          status: 'active',
          permissions: input.permissions ? Object.fromEntries(input.permissions.map(p => [p, true])) : {},
          accessLevel: 'full',
          resourceRestrictions: {},
          joinedAt: new Date(),
        })
        .returning();

      return toAdapterMembership(membership, input.role);
    },

    async updateMembership(
      id: string,
      data: Partial<AdapterMembership>
    ): Promise<AdapterMembership> {
      if (!tenantMemberships) {
        throw new Error('Tenant memberships table not configured');
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      // Find role by name if updating role
      if (data.role !== undefined && roles) {
        const [role] = await db
          .select()
          .from(roles)
          .where(eq(roles.name, data.role))
          .limit(1);
        updateData['roleId'] = role?.id ?? null;
      }

      if (data.status !== undefined) updateData['status'] = data.status;
      if (data.permissions !== undefined) {
        updateData['permissions'] = Object.fromEntries(data.permissions.map(p => [p, true]));
      }

      const [membership] = await db
        .update(tenantMemberships)
        .set(updateData)
        .where(eq(tenantMemberships.id, id))
        .returning();

      // Get role name
      let roleName: string | undefined;
      if (roles && membership.roleId) {
        const [role] = await db
          .select()
          .from(roles)
          .where(eq(roles.id, membership.roleId))
          .limit(1);
        roleName = role?.name;
      }

      return toAdapterMembership(membership, roleName);
    },

    async deleteMembership(id: string): Promise<void> {
      if (!tenantMemberships) return;

      if (softDelete) {
        await db
          .update(tenantMemberships)
          .set({ deletedAt: new Date(), status: 'inactive' })
          .where(eq(tenantMemberships.id, id));
      } else {
        await db.delete(tenantMemberships).where(eq(tenantMemberships.id, id));
      }
    },
  };
}
