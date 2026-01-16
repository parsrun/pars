/**
 * Tenant Manager
 * CRUD operations for tenants and memberships
 */

import type { AuthAdapter, AdapterTenant, AdapterMembership } from '../config.js';

/**
 * Tenant creation input
 */
export interface CreateTenantInput {
  /** Tenant name */
  name: string;
  /** URL-friendly slug (auto-generated if not provided) */
  slug?: string;
  /** Owner user ID */
  ownerId: string;
  /** Owner role name (default: 'owner') */
  ownerRole?: string;
  /** Initial status (default: 'active') */
  status?: 'active' | 'suspended' | 'inactive';
}

/**
 * Tenant update input
 */
export interface UpdateTenantInput {
  /** Tenant name */
  name?: string;
  /** Status */
  status?: 'active' | 'suspended' | 'inactive';
}

/**
 * Membership creation input
 */
export interface AddMemberInput {
  /** User ID to add */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Role name */
  role: string;
  /** Initial permissions */
  permissions?: string[];
  /** Status (default: 'active') */
  status?: 'active' | 'inactive' | 'pending';
}

/**
 * Membership update input
 */
export interface UpdateMemberInput {
  /** New role */
  role?: string;
  /** New permissions */
  permissions?: string[];
  /** New status */
  status?: 'active' | 'inactive' | 'pending';
}

/**
 * Tenant with members
 */
export interface TenantWithMembers extends AdapterTenant {
  members: AdapterMembership[];
  memberCount: number;
}

/**
 * User's tenant memberships with tenant details
 */
export interface UserTenantMembership extends AdapterMembership {
  tenant?: AdapterTenant;
}

/**
 * Tenant Manager
 */
export class TenantManager {
  private adapter: AuthAdapter;

  constructor(adapter: AuthAdapter) {
    this.adapter = adapter;
  }

  // ============================================
  // Tenant Operations
  // ============================================

  /**
   * Create a new tenant with owner
   */
  async createTenant(input: CreateTenantInput): Promise<{
    tenant: AdapterTenant;
    membership: AdapterMembership;
  }> {
    // Check if adapter supports tenant operations
    if (!this.adapter.findTenantById) {
      throw new Error('Tenant operations not supported by adapter');
    }

    // Generate slug if not provided
    const slug = input.slug ?? this.generateSlug(input.name);

    // Check if slug is unique
    const existingTenant = await this.adapter.findTenantBySlug?.(slug);
    if (existingTenant) {
      throw new Error(`Tenant with slug '${slug}' already exists`);
    }

    // Create tenant - need to use adapter directly
    // Since adapter doesn't have createTenant, we need to extend it
    // For now, throw an informative error
    throw new Error(
      'createTenant not implemented in adapter. ' +
      'Please implement createTenant in your adapter or use direct database access.'
    );
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(id: string): Promise<AdapterTenant | null> {
    if (!this.adapter.findTenantById) {
      return null;
    }
    return this.adapter.findTenantById(id);
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<AdapterTenant | null> {
    if (!this.adapter.findTenantBySlug) {
      return null;
    }
    return this.adapter.findTenantBySlug(slug);
  }

  /**
   * Check if user is member of tenant
   */
  async isMember(userId: string, tenantId: string): Promise<boolean> {
    if (!this.adapter.findMembership) {
      return false;
    }

    const membership = await this.adapter.findMembership(userId, tenantId);
    return membership !== null && membership.status === 'active';
  }

  /**
   * Check if user has specific role in tenant
   */
  async hasRole(userId: string, tenantId: string, role: string): Promise<boolean> {
    if (!this.adapter.findMembership) {
      return false;
    }

    const membership = await this.adapter.findMembership(userId, tenantId);
    return membership !== null && membership.role === role && membership.status === 'active';
  }

  /**
   * Check if user is owner of tenant
   */
  async isOwner(userId: string, tenantId: string): Promise<boolean> {
    return this.hasRole(userId, tenantId, 'owner');
  }

  /**
   * Check if user is admin of tenant (owner or admin)
   */
  async isAdmin(userId: string, tenantId: string): Promise<boolean> {
    if (!this.adapter.findMembership) {
      return false;
    }

    const membership = await this.adapter.findMembership(userId, tenantId);
    if (!membership || membership.status !== 'active') {
      return false;
    }

    return membership.role === 'owner' || membership.role === 'admin';
  }

  // ============================================
  // Membership Operations
  // ============================================

  /**
   * Add a member to tenant
   */
  async addMember(input: AddMemberInput): Promise<AdapterMembership> {
    if (!this.adapter.createMembership) {
      throw new Error('Membership operations not supported by adapter');
    }

    // Check if already a member
    const existing = await this.adapter.findMembership?.(input.userId, input.tenantId);
    if (existing) {
      throw new Error('User is already a member of this tenant');
    }

    return this.adapter.createMembership({
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      permissions: input.permissions,
    });
  }

  /**
   * Update member role/permissions
   */
  async updateMember(
    userId: string,
    tenantId: string,
    updates: UpdateMemberInput
  ): Promise<AdapterMembership> {
    if (!this.adapter.findMembership || !this.adapter.updateMembership) {
      throw new Error('Membership operations not supported by adapter');
    }

    const membership = await this.adapter.findMembership(userId, tenantId);
    if (!membership) {
      throw new Error('Membership not found');
    }

    return this.adapter.updateMembership(membership.id, updates);
  }

  /**
   * Remove member from tenant
   */
  async removeMember(userId: string, tenantId: string): Promise<void> {
    if (!this.adapter.findMembership || !this.adapter.deleteMembership) {
      throw new Error('Membership operations not supported by adapter');
    }

    const membership = await this.adapter.findMembership(userId, tenantId);
    if (!membership) {
      throw new Error('Membership not found');
    }

    // Prevent removing the last owner
    if (membership.role === 'owner') {
      const allMemberships = await this.getMembersByTenant(tenantId);
      const owners = allMemberships.filter(m => m.role === 'owner');
      if (owners.length <= 1) {
        throw new Error('Cannot remove the last owner of a tenant');
      }
    }

    await this.adapter.deleteMembership(membership.id);
  }

  /**
   * Get membership for user in tenant
   */
  async getMembership(userId: string, tenantId: string): Promise<AdapterMembership | null> {
    if (!this.adapter.findMembership) {
      return null;
    }
    return this.adapter.findMembership(userId, tenantId);
  }

  /**
   * Get all tenants for a user
   */
  async getUserTenants(userId: string): Promise<UserTenantMembership[]> {
    if (!this.adapter.findMembershipsByUserId) {
      return [];
    }

    const memberships = await this.adapter.findMembershipsByUserId(userId);

    // Enrich with tenant details
    const enriched = await Promise.all(
      memberships.map(async (membership) => {
        const tenant = await this.adapter.findTenantById?.(membership.tenantId);
        return {
          ...membership,
          tenant: tenant ?? undefined,
        };
      })
    );

    return enriched;
  }

  /**
   * Get all members of a tenant
   * Note: This requires iterating through users, which is not efficient
   * Consider adding findMembershipsByTenantId to the adapter
   */
  async getMembersByTenant(_tenantId: string): Promise<AdapterMembership[]> {
    // This is a placeholder - the adapter should implement this
    // For now, return empty array
    console.warn(
      'getMembersByTenant: Consider implementing findMembershipsByTenantId in adapter'
    );
    return [];
  }

  /**
   * Transfer ownership to another member
   */
  async transferOwnership(
    tenantId: string,
    currentOwnerId: string,
    newOwnerId: string
  ): Promise<void> {
    if (!this.adapter.findMembership || !this.adapter.updateMembership) {
      throw new Error('Membership operations not supported by adapter');
    }

    // Verify current owner
    const currentOwnership = await this.adapter.findMembership(currentOwnerId, tenantId);
    if (!currentOwnership || currentOwnership.role !== 'owner') {
      throw new Error('Current user is not the owner');
    }

    // Verify new owner is a member
    const newOwnership = await this.adapter.findMembership(newOwnerId, tenantId);
    if (!newOwnership) {
      throw new Error('New owner must be an existing member');
    }

    // Update roles
    await this.adapter.updateMembership(newOwnership.id, { role: 'owner' });
    await this.adapter.updateMembership(currentOwnership.id, { role: 'admin' });
  }

  // ============================================
  // Tenant Switching
  // ============================================

  /**
   * Validate tenant switch
   * Returns the tenant if switch is allowed
   */
  async validateTenantSwitch(
    userId: string,
    targetTenantId: string
  ): Promise<{ tenant: AdapterTenant; membership: AdapterMembership }> {
    // Get tenant
    const tenant = await this.getTenantById(targetTenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Check tenant status
    if (tenant.status !== 'active') {
      throw new Error('Tenant is not active');
    }

    // Check membership
    const membership = await this.getMembership(userId, targetTenantId);
    if (!membership) {
      throw new Error('User is not a member of this tenant');
    }

    if (membership.status !== 'active') {
      throw new Error('Membership is not active');
    }

    return { tenant, membership };
  }

  /**
   * Get default tenant for user
   * Returns the first active tenant membership
   */
  async getDefaultTenant(userId: string): Promise<UserTenantMembership | null> {
    const tenants = await this.getUserTenants(userId);

    // Find first active tenant
    const active = tenants.find(
      t => t.status === 'active' && t.tenant?.status === 'active'
    );

    return active ?? null;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Generate URL-friendly slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Generate unique tenant slug
   */
  async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = this.generateSlug(name);
    let slug = baseSlug;
    let counter = 1;

    while (await this.adapter.findTenantBySlug?.(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }
}

/**
 * Create a tenant manager
 */
export function createTenantManager(adapter: AuthAdapter): TenantManager {
  return new TenantManager(adapter);
}
