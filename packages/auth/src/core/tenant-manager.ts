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
  /** Parent tenant ID for creating child tenants */
  parentId?: string;
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
    if (!this.adapter.findTenantById || !this.adapter.createTenant) {
      throw new Error('Tenant operations not supported by adapter');
    }

    if (!this.adapter.createMembership) {
      throw new Error('Membership operations not supported by adapter');
    }

    // Generate slug if not provided
    const slug = input.slug ?? this.generateSlug(input.name);

    // Check if slug is unique
    const existingTenant = await this.adapter.findTenantBySlug?.(slug);
    if (existingTenant) {
      throw new Error(`Tenant with slug '${slug}' already exists`);
    }

    // Calculate path and depth for hierarchy
    let parentId: string | null = null;
    let path: string | null = null;
    let depth: number = 0;

    if (input.parentId) {
      const parent = await this.adapter.findTenantById(input.parentId);
      if (!parent) {
        throw new Error(`Parent tenant '${input.parentId}' not found`);
      }
      parentId = input.parentId;
      depth = (parent.depth ?? 0) + 1;
      // Path will be updated after we get the tenant ID
    }

    // Create tenant
    const tenant = await this.adapter.createTenant({
      name: input.name,
      slug,
      status: input.status ?? 'active',
      parentId,
      path: null, // Will be updated after creation
      depth,
    });

    // Calculate and update path with tenant ID
    if (input.parentId) {
      const parent = await this.adapter.findTenantById(input.parentId);
      const parentPath = parent?.path ?? `/${input.parentId}/`;
      path = `${parentPath.replace(/\/$/, '')}/${tenant.id}/`;
    } else {
      path = `/${tenant.id}/`;
    }

    // Update tenant with path
    if (this.adapter.updateTenantPath) {
      await this.adapter.updateTenantPath(tenant.id, path, depth);
      tenant.path = path;
      tenant.depth = depth;
    }

    // Create owner membership
    const membership = await this.adapter.createMembership({
      userId: input.ownerId,
      tenantId: tenant.id,
      role: input.ownerRole ?? 'owner',
    });

    return { tenant, membership };
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

  // ============================================
  // Tenant Hierarchy Operations
  // ============================================

  /**
   * Get direct children of a tenant
   */
  async getChildren(tenantId: string): Promise<AdapterTenant[]> {
    if (!this.adapter.findTenantsByParentId) {
      return [];
    }
    return this.adapter.findTenantsByParentId(tenantId);
  }

  /**
   * Get parent of a tenant
   */
  async getParent(tenantId: string): Promise<AdapterTenant | null> {
    if (!this.adapter.findTenantById) {
      return null;
    }

    const tenant = await this.adapter.findTenantById(tenantId);
    if (!tenant || !tenant.parentId) {
      return null;
    }

    return this.adapter.findTenantById(tenant.parentId);
  }

  /**
   * Get all ancestors of a tenant (from immediate parent to root)
   */
  async getAncestors(tenantId: string): Promise<AdapterTenant[]> {
    if (!this.adapter.findTenantById) {
      return [];
    }

    const tenant = await this.adapter.findTenantById(tenantId);
    if (!tenant || !tenant.path) {
      return [];
    }

    // Parse path to get ancestor IDs: "/root/parent/child/" -> ["root", "parent"]
    const pathParts = tenant.path.split('/').filter(Boolean);
    // Remove current tenant ID (last element)
    const ancestorIds = pathParts.slice(0, -1);

    // Fetch ancestors in order (root to immediate parent)
    const ancestors: AdapterTenant[] = [];
    for (const ancestorId of ancestorIds) {
      const ancestor = await this.adapter.findTenantById(ancestorId);
      if (ancestor) {
        ancestors.push(ancestor);
      }
    }

    return ancestors;
  }

  /**
   * Get all descendants of a tenant (all levels)
   */
  async getDescendants(tenantId: string): Promise<AdapterTenant[]> {
    if (!this.adapter.findTenantById || !this.adapter.findTenantsByPath) {
      return [];
    }

    const tenant = await this.adapter.findTenantById(tenantId);
    if (!tenant) {
      return [];
    }

    // Use path for efficient descendant query
    const path = tenant.path ?? `/${tenantId}/`;
    const allDescendants = await this.adapter.findTenantsByPath(path);

    // Filter out the tenant itself
    return allDescendants.filter(t => t.id !== tenantId);
  }

  /**
   * Get siblings of a tenant (same parent)
   */
  async getSiblings(tenantId: string): Promise<AdapterTenant[]> {
    if (!this.adapter.findTenantById || !this.adapter.findTenantsByParentId) {
      return [];
    }

    const tenant = await this.adapter.findTenantById(tenantId);
    if (!tenant) {
      return [];
    }

    // Get all tenants with the same parent
    const siblings = await this.adapter.findTenantsByParentId(tenant.parentId ?? null);

    // Filter out the tenant itself
    return siblings.filter(t => t.id !== tenantId);
  }

  /**
   * Get root tenant of a hierarchy
   */
  async getRootTenant(tenantId: string): Promise<AdapterTenant | null> {
    if (!this.adapter.findTenantById) {
      return null;
    }

    const tenant = await this.adapter.findTenantById(tenantId);
    if (!tenant) {
      return null;
    }

    // If no parent, this is the root
    if (!tenant.parentId) {
      return tenant;
    }

    // Get root from path
    if (tenant.path) {
      const pathParts = tenant.path.split('/').filter(Boolean);
      const rootId = pathParts[0];
      if (rootId) {
        return this.adapter.findTenantById(rootId);
      }
    }

    // Fallback: traverse up the hierarchy
    let current = tenant;
    while (current.parentId) {
      const parent = await this.adapter.findTenantById(current.parentId);
      if (!parent) break;
      current = parent;
    }

    return current;
  }

  /**
   * Move a tenant to a new parent
   */
  async moveToParent(tenantId: string, newParentId: string | null): Promise<void> {
    if (!this.adapter.findTenantById || !this.adapter.updateTenant || !this.adapter.updateTenantPath) {
      throw new Error('Tenant hierarchy operations not supported by adapter');
    }

    const tenant = await this.adapter.findTenantById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Prevent circular reference
    if (newParentId) {
      const isDescendant = await this.isDescendantOf(newParentId, tenantId);
      if (isDescendant) {
        throw new Error('Cannot move tenant to its own descendant');
      }
    }

    // Get descendants BEFORE updating path (they still have old paths)
    const oldPath = tenant.path ?? `/${tenantId}/`;
    const descendants = await this.getDescendants(tenantId);

    // Calculate new path and depth
    let newPath: string;
    let newDepth: number;

    if (newParentId) {
      const newParent = await this.adapter.findTenantById(newParentId);
      if (!newParent) {
        throw new Error('New parent tenant not found');
      }
      const parentPath = newParent.path ?? `/${newParentId}/`;
      newPath = `${parentPath.replace(/\/$/, '')}/${tenantId}/`;
      newDepth = (newParent.depth ?? 0) + 1;
    } else {
      newPath = `/${tenantId}/`;
      newDepth = 0;
    }

    // Update tenant
    await this.adapter.updateTenant(tenantId, { parentId: newParentId });
    await this.adapter.updateTenantPath(tenantId, newPath, newDepth);

    for (const descendant of descendants) {
      if (descendant.path) {
        const descendantNewPath = descendant.path.replace(oldPath, newPath);
        const descendantNewDepth = (descendant.depth ?? 0) - (tenant.depth ?? 0) + newDepth;
        await this.adapter.updateTenantPath(descendant.id, descendantNewPath, descendantNewDepth);
      }
    }
  }

  /**
   * Check if a tenant is an ancestor of another tenant
   */
  async isAncestorOf(ancestorId: string, descendantId: string): Promise<boolean> {
    if (!this.adapter.findTenantById) {
      return false;
    }

    const descendant = await this.adapter.findTenantById(descendantId);
    if (!descendant || !descendant.path) {
      return false;
    }

    // Check if ancestor ID is in the descendant's path
    return descendant.path.includes(`/${ancestorId}/`);
  }

  /**
   * Check if a tenant is a descendant of another tenant
   */
  async isDescendantOf(descendantId: string, ancestorId: string): Promise<boolean> {
    return this.isAncestorOf(ancestorId, descendantId);
  }

  /**
   * Get all root tenants (tenants without parent)
   */
  async getRootTenants(): Promise<AdapterTenant[]> {
    if (!this.adapter.findTenantsByParentId) {
      return [];
    }
    return this.adapter.findTenantsByParentId(null);
  }

  // ============================================
  // Membership Operations
  // ============================================

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
