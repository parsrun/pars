import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryRBAC,
  RBACService,
  createInMemoryRBAC,
  createRBACService,
  parsePermission,
  createPermission,
  crudPermissions,
  StandardRoles,
} from "./rbac.js";

describe("@parsrun/server - RBAC", () => {
  describe("InMemoryRBAC", () => {
    let checker: InMemoryRBAC;

    beforeEach(() => {
      checker = new InMemoryRBAC();
    });

    describe("grantPermission / revokePermission", () => {
      it("should grant permission to user", async () => {
        checker.grantPermission("user-1", "items:read");

        const permissions = await checker.getUserPermissions("user-1");
        expect(permissions).toContain("items:read");
      });

      it("should grant multiple permissions", async () => {
        checker.grantPermission("user-1", "items:read");
        checker.grantPermission("user-1", "items:create");
        checker.grantPermission("user-1", "users:read");

        const permissions = await checker.getUserPermissions("user-1");
        expect(permissions).toContain("items:read");
        expect(permissions).toContain("items:create");
        expect(permissions).toContain("users:read");
      });

      it("should revoke permission from user", async () => {
        checker.grantPermission("user-1", "items:read");
        checker.grantPermission("user-1", "items:create");

        checker.revokePermission("user-1", "items:read");

        const permissions = await checker.getUserPermissions("user-1");
        expect(permissions).not.toContain("items:read");
        expect(permissions).toContain("items:create");
      });
    });

    describe("assignRole / removeRole", () => {
      it("should assign role to user", async () => {
        checker.assignRole("user-1", "admin");

        const roles = await checker.getUserRoles("user-1");
        expect(roles).toContain("admin");
      });

      it("should remove role from user", async () => {
        checker.assignRole("user-1", "admin");
        checker.assignRole("user-1", "editor");

        checker.removeRole("user-1", "admin");

        const roles = await checker.getUserRoles("user-1");
        expect(roles).not.toContain("admin");
        expect(roles).toContain("editor");
      });
    });

    describe("defineRole", () => {
      it("should define role with permissions", async () => {
        checker.defineRole("editor", ["items:read", "items:create", "items:update"]);
        checker.assignRole("user-1", "editor");

        const permissions = await checker.getUserPermissions("user-1");
        expect(permissions).toContain("items:read");
        expect(permissions).toContain("items:create");
        expect(permissions).toContain("items:update");
      });

      it("should combine direct and role permissions", async () => {
        checker.defineRole("viewer", ["items:read"]);
        checker.assignRole("user-1", "viewer");
        checker.grantPermission("user-1", "items:create");

        const permissions = await checker.getUserPermissions("user-1");
        expect(permissions).toContain("items:read");
        expect(permissions).toContain("items:create");
      });
    });

    describe("hasPermission", () => {
      it("should check exact permission", async () => {
        checker.grantPermission("user-1", "items:read");

        expect(
          await checker.hasPermission("user-1", { resource: "items", action: "read" })
        ).toBe(true);
        expect(
          await checker.hasPermission("user-1", { resource: "items", action: "create" })
        ).toBe(false);
      });

      it("should support wildcard permissions (*)", async () => {
        checker.grantPermission("user-1", "*");

        expect(
          await checker.hasPermission("user-1", { resource: "items", action: "read" })
        ).toBe(true);
        expect(
          await checker.hasPermission("user-1", { resource: "users", action: "delete" })
        ).toBe(true);
      });

      it("should support resource wildcard (resource:*)", async () => {
        checker.grantPermission("user-1", "items:*");

        expect(
          await checker.hasPermission("user-1", { resource: "items", action: "read" })
        ).toBe(true);
        expect(
          await checker.hasPermission("user-1", { resource: "items", action: "delete" })
        ).toBe(true);
        expect(
          await checker.hasPermission("user-1", { resource: "users", action: "read" })
        ).toBe(false);
      });

      it("should support action wildcard (*:action)", async () => {
        checker.grantPermission("user-1", "*:read");

        expect(
          await checker.hasPermission("user-1", { resource: "items", action: "read" })
        ).toBe(true);
        expect(
          await checker.hasPermission("user-1", { resource: "users", action: "read" })
        ).toBe(true);
        expect(
          await checker.hasPermission("user-1", { resource: "items", action: "create" })
        ).toBe(false);
      });
    });

    describe("tenant membership", () => {
      it("should add user to tenant", async () => {
        checker.addTenantMember("tenant-1", "user-1");

        expect(await checker.isTenantMember("user-1", "tenant-1")).toBe(true);
        expect(await checker.isTenantMember("user-2", "tenant-1")).toBe(false);
      });

      it("should remove user from tenant", async () => {
        checker.addTenantMember("tenant-1", "user-1");
        checker.removeTenantMember("tenant-1", "user-1");

        expect(await checker.isTenantMember("user-1", "tenant-1")).toBe(false);
      });
    });
  });

  describe("RBACService", () => {
    let rbac: RBACService;
    let checker: InMemoryRBAC;

    beforeEach(() => {
      const result = createInMemoryRBAC();
      rbac = result.rbac;
      checker = result.checker;
    });

    describe("hasPermission", () => {
      it("should check user permission", async () => {
        checker.grantPermission("user-1", "items:read");

        expect(
          await rbac.hasPermission("user-1", { resource: "items", action: "read" })
        ).toBe(true);
      });
    });

    describe("hasAnyPermission", () => {
      it("should return true if user has any permission", async () => {
        checker.grantPermission("user-1", "items:create");

        expect(
          await rbac.hasAnyPermission("user-1", [
            { resource: "items", action: "read" },
            { resource: "items", action: "create" },
          ])
        ).toBe(true);
      });

      it("should return false if user has none of permissions", async () => {
        checker.grantPermission("user-1", "items:delete");

        expect(
          await rbac.hasAnyPermission("user-1", [
            { resource: "items", action: "read" },
            { resource: "items", action: "create" },
          ])
        ).toBe(false);
      });
    });

    describe("hasAllPermissions", () => {
      it("should return true if user has all permissions", async () => {
        checker.grantPermission("user-1", "items:read");
        checker.grantPermission("user-1", "items:create");

        expect(
          await rbac.hasAllPermissions("user-1", [
            { resource: "items", action: "read" },
            { resource: "items", action: "create" },
          ])
        ).toBe(true);
      });

      it("should return false if user is missing any permission", async () => {
        checker.grantPermission("user-1", "items:read");

        expect(
          await rbac.hasAllPermissions("user-1", [
            { resource: "items", action: "read" },
            { resource: "items", action: "create" },
          ])
        ).toBe(false);
      });
    });

    describe("hasRole", () => {
      it("should check if user has role", async () => {
        checker.assignRole("user-1", "admin");

        expect(await rbac.hasRole("user-1", "admin")).toBe(true);
        expect(await rbac.hasRole("user-1", "editor")).toBe(false);
      });
    });

    describe("hasAnyRole", () => {
      it("should check if user has any of roles", async () => {
        checker.assignRole("user-1", "editor");

        expect(await rbac.hasAnyRole("user-1", ["admin", "editor"])).toBe(true);
        expect(await rbac.hasAnyRole("user-1", ["admin", "owner"])).toBe(false);
      });
    });
  });

  describe("utility functions", () => {
    describe("parsePermission", () => {
      it("should parse permission string", () => {
        const result = parsePermission("items:read");

        expect(result.resource).toBe("items");
        expect(result.action).toBe("read");
      });

      it("should throw for invalid format", () => {
        expect(() => parsePermission("invalid")).toThrow("Invalid permission format");
        expect(() => parsePermission("items")).toThrow("Invalid permission format");
      });
    });

    describe("createPermission", () => {
      it("should create permission string", () => {
        expect(createPermission("items", "read")).toBe("items:read");
        expect(createPermission("users", "delete")).toBe("users:delete");
      });
    });

    describe("crudPermissions", () => {
      it("should generate CRUD permissions for resource", () => {
        const permissions = crudPermissions("items");

        expect(permissions).toHaveLength(5);
        expect(permissions.map((p) => p.name)).toEqual([
          "items:create",
          "items:read",
          "items:update",
          "items:delete",
          "items:list",
        ]);
      });

      it("should include resource and action in each permission", () => {
        const permissions = crudPermissions("users");

        for (const perm of permissions) {
          expect(perm.resource).toBe("users");
          expect(perm.action).toBeDefined();
        }
      });
    });
  });

  describe("StandardRoles", () => {
    it("should have OWNER role", () => {
      expect(StandardRoles.OWNER).toBeDefined();
      expect(StandardRoles.OWNER.name).toBe("owner");
      expect(StandardRoles.OWNER.permissions).toContain("*");
      expect(StandardRoles.OWNER.isSystem).toBe(true);
    });

    it("should have ADMIN role", () => {
      expect(StandardRoles.ADMIN).toBeDefined();
      expect(StandardRoles.ADMIN.name).toBe("admin");
      expect(StandardRoles.ADMIN.isSystem).toBe(true);
    });

    it("should have MEMBER role", () => {
      expect(StandardRoles.MEMBER).toBeDefined();
      expect(StandardRoles.MEMBER.name).toBe("member");
    });

    it("should have VIEWER role", () => {
      expect(StandardRoles.VIEWER).toBeDefined();
      expect(StandardRoles.VIEWER.name).toBe("viewer");
      expect(StandardRoles.VIEWER.permissions).toContain("*:read");
    });
  });

  describe("factory functions", () => {
    it("createInMemoryRBAC should return rbac and checker", () => {
      const result = createInMemoryRBAC();

      expect(result.rbac).toBeInstanceOf(RBACService);
      expect(result.checker).toBeInstanceOf(InMemoryRBAC);
    });

    it("createRBACService should create service with custom checker", () => {
      const checker = new InMemoryRBAC();
      const rbac = createRBACService(checker);

      expect(rbac).toBeInstanceOf(RBACService);
    });
  });
});
