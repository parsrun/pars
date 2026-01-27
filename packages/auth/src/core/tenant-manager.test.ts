import { describe, it, expect, beforeEach } from "vitest";
import {
  TenantManager,
  createTenantManager,
} from "./tenant-manager.js";
import type {
  AuthAdapter,
  AdapterTenant,
  AdapterMembership,
} from "../config.js";

/**
 * Create a mock adapter for testing tenant hierarchy
 */
function createMockAdapter(): AuthAdapter & {
  tenants: Map<string, AdapterTenant>;
  memberships: Map<string, AdapterMembership>;
} {
  const tenants = new Map<string, AdapterTenant>();
  const memberships = new Map<string, AdapterMembership>();

  return {
    tenants,
    memberships,

    // User operations (minimal implementation)
    async findUserById() { return null; },
    async findUserByEmail() { return null; },
    async findUserByPhone() { return null; },
    async createUser() { throw new Error("Not implemented"); },
    async updateUser() { throw new Error("Not implemented"); },
    async deleteUser() {},

    // Session operations (minimal implementation)
    async findSessionById() { return null; },
    async findSessionsByUserId() { return []; },
    async createSession() { throw new Error("Not implemented"); },
    async updateSession() { throw new Error("Not implemented"); },
    async deleteSession() {},
    async deleteSessionsByUserId() {},

    // Auth method operations (minimal implementation)
    async findAuthMethod() { return null; },
    async findAuthMethodsByUserId() { return []; },
    async createAuthMethod() { throw new Error("Not implemented"); },
    async deleteAuthMethod() {},

    // Tenant operations
    async findTenantById(id: string) {
      return tenants.get(id) ?? null;
    },

    async findTenantBySlug(slug: string) {
      for (const tenant of tenants.values()) {
        if (tenant.slug === slug) {
          return tenant;
        }
      }
      return null;
    },

    async createTenant(data) {
      const id = `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const tenant: AdapterTenant = {
        id,
        name: data.name,
        slug: data.slug,
        status: data.status ?? 'active',
        parentId: data.parentId ?? null,
        path: data.path ?? null,
        depth: data.depth ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tenants.set(id, tenant);
      return tenant;
    },

    async updateTenant(id: string, data: Partial<AdapterTenant>) {
      const tenant = tenants.get(id);
      if (!tenant) {
        throw new Error("Tenant not found");
      }
      const updated = { ...tenant, ...data, updatedAt: new Date() };
      tenants.set(id, updated);
      return updated;
    },

    async deleteTenant(id: string) {
      tenants.delete(id);
    },

    // Tenant hierarchy operations
    async findTenantsByParentId(parentId: string | null) {
      const result: AdapterTenant[] = [];
      for (const tenant of tenants.values()) {
        if (tenant.parentId === parentId) {
          result.push(tenant);
        }
      }
      return result;
    },

    async findTenantsByPath(pathPrefix: string) {
      const result: AdapterTenant[] = [];
      for (const tenant of tenants.values()) {
        if (tenant.path?.startsWith(pathPrefix)) {
          result.push(tenant);
        }
      }
      return result;
    },

    async updateTenantPath(tenantId: string, path: string, depth: number) {
      const tenant = tenants.get(tenantId);
      if (tenant) {
        tenant.path = path;
        tenant.depth = depth;
        tenant.updatedAt = new Date();
        tenants.set(tenantId, tenant);
      }
    },

    // Membership operations
    async findMembership(userId: string, tenantId: string) {
      const key = `${userId}:${tenantId}`;
      return memberships.get(key) ?? null;
    },

    async findMembershipsByUserId(userId: string) {
      const result: AdapterMembership[] = [];
      for (const [key, membership] of memberships.entries()) {
        if (key.startsWith(`${userId}:`)) {
          result.push(membership);
        }
      }
      return result;
    },

    async createMembership(data) {
      const id = `membership-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const membership: AdapterMembership = {
        id,
        userId: data.userId,
        tenantId: data.tenantId,
        role: data.role,
        permissions: data.permissions,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const key = `${data.userId}:${data.tenantId}`;
      memberships.set(key, membership);
      return membership;
    },

    async updateMembership(id: string, data: Partial<AdapterMembership>) {
      for (const [key, membership] of memberships.entries()) {
        if (membership.id === id) {
          const updated = { ...membership, ...data, updatedAt: new Date() };
          memberships.set(key, updated);
          return updated;
        }
      }
      throw new Error("Membership not found");
    },

    async deleteMembership(id: string) {
      for (const [key, membership] of memberships.entries()) {
        if (membership.id === id) {
          memberships.delete(key);
          return;
        }
      }
    },
  };
}

describe("@parsrun/auth - TenantManager Hierarchy", () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let tenantManager: TenantManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    tenantManager = createTenantManager(adapter);
  });

  describe("createTenant", () => {
    it("should create a root tenant with correct path and depth", async () => {
      const result = await tenantManager.createTenant({
        name: "Holding Company",
        ownerId: "user-1",
      });

      expect(result.tenant).toBeDefined();
      expect(result.tenant.name).toBe("Holding Company");
      expect(result.tenant.parentId).toBeNull();
      expect(result.tenant.depth).toBe(0);
      expect(result.tenant.path).toMatch(/^\/[^/]+\/$/); // Should be "/{id}/"
      expect(result.membership).toBeDefined();
      expect(result.membership.role).toBe("owner");
    });

    it("should create a child tenant with correct path and depth", async () => {
      // Create parent
      const parent = await tenantManager.createTenant({
        name: "Holding",
        ownerId: "user-1",
      });

      // Create child
      const child = await tenantManager.createTenant({
        name: "Company A",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      expect(child.tenant.parentId).toBe(parent.tenant.id);
      expect(child.tenant.depth).toBe(1);
      expect(child.tenant.path).toBe(`${parent.tenant.path?.replace(/\/$/, '')}/${child.tenant.id}/`);
    });

    it("should throw error if parent tenant does not exist", async () => {
      await expect(
        tenantManager.createTenant({
          name: "Orphan",
          ownerId: "user-1",
          parentId: "non-existent",
        })
      ).rejects.toThrow("Parent tenant 'non-existent' not found");
    });

    it("should throw error if slug already exists", async () => {
      await tenantManager.createTenant({
        name: "Company",
        slug: "company",
        ownerId: "user-1",
      });

      await expect(
        tenantManager.createTenant({
          name: "Another Company",
          slug: "company",
          ownerId: "user-2",
        })
      ).rejects.toThrow("Tenant with slug 'company' already exists");
    });
  });

  describe("getChildren", () => {
    it("should return direct children of a tenant", async () => {
      const parent = await tenantManager.createTenant({
        name: "Parent",
        ownerId: "user-1",
      });

      await tenantManager.createTenant({
        name: "Child 1",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      await tenantManager.createTenant({
        name: "Child 2",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      const children = await tenantManager.getChildren(parent.tenant.id);

      expect(children).toHaveLength(2);
      expect(children.map(c => c.name).sort()).toEqual(["Child 1", "Child 2"]);
    });

    it("should return empty array for tenant without children", async () => {
      const tenant = await tenantManager.createTenant({
        name: "Leaf",
        ownerId: "user-1",
      });

      const children = await tenantManager.getChildren(tenant.tenant.id);

      expect(children).toHaveLength(0);
    });
  });

  describe("getParent", () => {
    it("should return parent of a child tenant", async () => {
      const parent = await tenantManager.createTenant({
        name: "Parent",
        ownerId: "user-1",
      });

      const child = await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      const foundParent = await tenantManager.getParent(child.tenant.id);

      expect(foundParent).toBeDefined();
      expect(foundParent?.id).toBe(parent.tenant.id);
    });

    it("should return null for root tenant", async () => {
      const root = await tenantManager.createTenant({
        name: "Root",
        ownerId: "user-1",
      });

      const parent = await tenantManager.getParent(root.tenant.id);

      expect(parent).toBeNull();
    });
  });

  describe("getAncestors", () => {
    it("should return all ancestors from root to immediate parent", async () => {
      const root = await tenantManager.createTenant({
        name: "Root",
        ownerId: "user-1",
      });

      const middle = await tenantManager.createTenant({
        name: "Middle",
        ownerId: "user-1",
        parentId: root.tenant.id,
      });

      const leaf = await tenantManager.createTenant({
        name: "Leaf",
        ownerId: "user-1",
        parentId: middle.tenant.id,
      });

      const ancestors = await tenantManager.getAncestors(leaf.tenant.id);

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].id).toBe(root.tenant.id);
      expect(ancestors[1].id).toBe(middle.tenant.id);
    });

    it("should return empty array for root tenant", async () => {
      const root = await tenantManager.createTenant({
        name: "Root",
        ownerId: "user-1",
      });

      const ancestors = await tenantManager.getAncestors(root.tenant.id);

      expect(ancestors).toHaveLength(0);
    });
  });

  describe("getDescendants", () => {
    it("should return all descendants at all levels", async () => {
      const root = await tenantManager.createTenant({
        name: "Root",
        ownerId: "user-1",
      });

      const child1 = await tenantManager.createTenant({
        name: "Child 1",
        ownerId: "user-1",
        parentId: root.tenant.id,
      });

      await tenantManager.createTenant({
        name: "Child 2",
        ownerId: "user-1",
        parentId: root.tenant.id,
      });

      await tenantManager.createTenant({
        name: "Grandchild",
        ownerId: "user-1",
        parentId: child1.tenant.id,
      });

      const descendants = await tenantManager.getDescendants(root.tenant.id);

      expect(descendants).toHaveLength(3);
      expect(descendants.map(d => d.name).sort()).toEqual(["Child 1", "Child 2", "Grandchild"]);
    });

    it("should return empty array for leaf tenant", async () => {
      const leaf = await tenantManager.createTenant({
        name: "Leaf",
        ownerId: "user-1",
      });

      const descendants = await tenantManager.getDescendants(leaf.tenant.id);

      expect(descendants).toHaveLength(0);
    });
  });

  describe("getSiblings", () => {
    it("should return siblings with same parent", async () => {
      const parent = await tenantManager.createTenant({
        name: "Parent",
        ownerId: "user-1",
      });

      const child1 = await tenantManager.createTenant({
        name: "Child 1",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      await tenantManager.createTenant({
        name: "Child 2",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      await tenantManager.createTenant({
        name: "Child 3",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      const siblings = await tenantManager.getSiblings(child1.tenant.id);

      expect(siblings).toHaveLength(2);
      expect(siblings.map(s => s.name).sort()).toEqual(["Child 2", "Child 3"]);
    });

    it("should return other root tenants for root tenant", async () => {
      const root1 = await tenantManager.createTenant({
        name: "Root 1",
        ownerId: "user-1",
      });

      await tenantManager.createTenant({
        name: "Root 2",
        ownerId: "user-1",
      });

      const siblings = await tenantManager.getSiblings(root1.tenant.id);

      expect(siblings).toHaveLength(1);
      expect(siblings[0].name).toBe("Root 2");
    });
  });

  describe("getRootTenant", () => {
    it("should return root of a deep hierarchy", async () => {
      const root = await tenantManager.createTenant({
        name: "Root",
        ownerId: "user-1",
      });

      const middle = await tenantManager.createTenant({
        name: "Middle",
        ownerId: "user-1",
        parentId: root.tenant.id,
      });

      const leaf = await tenantManager.createTenant({
        name: "Leaf",
        ownerId: "user-1",
        parentId: middle.tenant.id,
      });

      const foundRoot = await tenantManager.getRootTenant(leaf.tenant.id);

      expect(foundRoot).toBeDefined();
      expect(foundRoot?.id).toBe(root.tenant.id);
    });

    it("should return itself for root tenant", async () => {
      const root = await tenantManager.createTenant({
        name: "Root",
        ownerId: "user-1",
      });

      const foundRoot = await tenantManager.getRootTenant(root.tenant.id);

      expect(foundRoot).toBeDefined();
      expect(foundRoot?.id).toBe(root.tenant.id);
    });
  });

  describe("getRootTenants", () => {
    it("should return all root tenants", async () => {
      await tenantManager.createTenant({
        name: "Root 1",
        ownerId: "user-1",
      });

      const root2 = await tenantManager.createTenant({
        name: "Root 2",
        ownerId: "user-1",
      });

      // Add a child to root2
      await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: root2.tenant.id,
      });

      const roots = await tenantManager.getRootTenants();

      expect(roots).toHaveLength(2);
      expect(roots.map(r => r.name).sort()).toEqual(["Root 1", "Root 2"]);
    });
  });

  describe("isAncestorOf", () => {
    it("should return true for direct parent", async () => {
      const parent = await tenantManager.createTenant({
        name: "Parent",
        ownerId: "user-1",
      });

      const child = await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      const result = await tenantManager.isAncestorOf(parent.tenant.id, child.tenant.id);

      expect(result).toBe(true);
    });

    it("should return true for distant ancestor", async () => {
      const root = await tenantManager.createTenant({
        name: "Root",
        ownerId: "user-1",
      });

      const middle = await tenantManager.createTenant({
        name: "Middle",
        ownerId: "user-1",
        parentId: root.tenant.id,
      });

      const leaf = await tenantManager.createTenant({
        name: "Leaf",
        ownerId: "user-1",
        parentId: middle.tenant.id,
      });

      const result = await tenantManager.isAncestorOf(root.tenant.id, leaf.tenant.id);

      expect(result).toBe(true);
    });

    it("should return false for non-ancestor", async () => {
      const tenant1 = await tenantManager.createTenant({
        name: "Tenant 1",
        ownerId: "user-1",
      });

      const tenant2 = await tenantManager.createTenant({
        name: "Tenant 2",
        ownerId: "user-1",
      });

      const result = await tenantManager.isAncestorOf(tenant1.tenant.id, tenant2.tenant.id);

      expect(result).toBe(false);
    });
  });

  describe("isDescendantOf", () => {
    it("should return true for direct child", async () => {
      const parent = await tenantManager.createTenant({
        name: "Parent",
        ownerId: "user-1",
      });

      const child = await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      const result = await tenantManager.isDescendantOf(child.tenant.id, parent.tenant.id);

      expect(result).toBe(true);
    });

    it("should return false for non-descendant", async () => {
      const tenant1 = await tenantManager.createTenant({
        name: "Tenant 1",
        ownerId: "user-1",
      });

      const tenant2 = await tenantManager.createTenant({
        name: "Tenant 2",
        ownerId: "user-1",
      });

      const result = await tenantManager.isDescendantOf(tenant1.tenant.id, tenant2.tenant.id);

      expect(result).toBe(false);
    });
  });

  describe("moveToParent", () => {
    it("should move tenant to a new parent", async () => {
      const parent1 = await tenantManager.createTenant({
        name: "Parent 1",
        ownerId: "user-1",
      });

      const parent2 = await tenantManager.createTenant({
        name: "Parent 2",
        ownerId: "user-1",
      });

      const child = await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: parent1.tenant.id,
      });

      await tenantManager.moveToParent(child.tenant.id, parent2.tenant.id);

      const movedChild = await tenantManager.getTenantById(child.tenant.id);

      expect(movedChild?.parentId).toBe(parent2.tenant.id);
      expect(movedChild?.path).toContain(parent2.tenant.id);
    });

    it("should move tenant to root (null parent)", async () => {
      const parent = await tenantManager.createTenant({
        name: "Parent",
        ownerId: "user-1",
      });

      const child = await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      await tenantManager.moveToParent(child.tenant.id, null);

      const movedChild = await tenantManager.getTenantById(child.tenant.id);

      expect(movedChild?.parentId).toBeNull();
      expect(movedChild?.depth).toBe(0);
    });

    it("should update descendants paths when moving", async () => {
      const parent1 = await tenantManager.createTenant({
        name: "Parent 1",
        ownerId: "user-1",
      });

      const parent2 = await tenantManager.createTenant({
        name: "Parent 2",
        ownerId: "user-1",
      });

      const child = await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: parent1.tenant.id,
      });

      const grandchild = await tenantManager.createTenant({
        name: "Grandchild",
        ownerId: "user-1",
        parentId: child.tenant.id,
      });

      await tenantManager.moveToParent(child.tenant.id, parent2.tenant.id);

      const movedGrandchild = await tenantManager.getTenantById(grandchild.tenant.id);

      expect(movedGrandchild?.path).toContain(parent2.tenant.id);
      expect(movedGrandchild?.path).toContain(child.tenant.id);
      expect(movedGrandchild?.depth).toBe(2);
    });

    it("should prevent circular reference", async () => {
      const parent = await tenantManager.createTenant({
        name: "Parent",
        ownerId: "user-1",
      });

      const child = await tenantManager.createTenant({
        name: "Child",
        ownerId: "user-1",
        parentId: parent.tenant.id,
      });

      // Try to move parent under its own child
      await expect(
        tenantManager.moveToParent(parent.tenant.id, child.tenant.id)
      ).rejects.toThrow("Cannot move tenant to its own descendant");
    });

    it("should throw error if new parent does not exist", async () => {
      const tenant = await tenantManager.createTenant({
        name: "Tenant",
        ownerId: "user-1",
      });

      await expect(
        tenantManager.moveToParent(tenant.tenant.id, "non-existent")
      ).rejects.toThrow("New parent tenant not found");
    });
  });

  describe("deep hierarchy", () => {
    it("should support unlimited depth hierarchy", async () => {
      let parentId: string | undefined;
      const tenants: AdapterTenant[] = [];

      // Create 10 levels deep hierarchy
      for (let i = 0; i < 10; i++) {
        const result = await tenantManager.createTenant({
          name: `Level ${i}`,
          ownerId: "user-1",
          parentId,
        });
        tenants.push(result.tenant);
        parentId = result.tenant.id;
      }

      // Verify depths
      for (let i = 0; i < 10; i++) {
        const tenant = await tenantManager.getTenantById(tenants[i].id);
        expect(tenant?.depth).toBe(i);
      }

      // Verify ancestors from deepest level
      const deepestTenant = tenants[9];
      const ancestors = await tenantManager.getAncestors(deepestTenant.id);
      expect(ancestors).toHaveLength(9);

      // Verify descendants from root
      const rootTenant = tenants[0];
      const descendants = await tenantManager.getDescendants(rootTenant.id);
      expect(descendants).toHaveLength(9);

      // Verify root tenant from deepest
      const root = await tenantManager.getRootTenant(deepestTenant.id);
      expect(root?.id).toBe(rootTenant.id);
    });
  });
});
