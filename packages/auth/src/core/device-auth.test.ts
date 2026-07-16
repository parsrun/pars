import { describe, it, expect, beforeEach } from "vitest";
import {
  DeviceAuthManager,
  createDeviceAuthManager,
} from "./device-auth.js";
import type {
  AuthAdapter,
  AdapterDevice,
  CreateDeviceInput,
  UpdateDeviceInput,
} from "../config.js";
import { createMemoryStorage } from "../storage/index.js";
import type { KVStorage } from "../storage/types.js";

/**
 * Create a mock adapter for testing device auth
 */
function createMockAdapter(): AuthAdapter & {
  devices: Map<string, AdapterDevice>;
  tokenHashIndex: Map<string, string>; // tokenHash -> deviceId
} {
  const devices = new Map<string, AdapterDevice>();
  const tokenHashIndex = new Map<string, string>();

  return {
    devices,
    tokenHashIndex,

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
    async updateAuthMethod() { throw new Error("Not implemented"); },
    async deleteAuthMethod() {},

    // Device operations
    async findDeviceById(id: string) {
      return devices.get(id) ?? null;
    },

    async findDeviceByTokenHash(tokenHash: string, tenantId: string) {
      const deviceId = tokenHashIndex.get(`${tenantId}:${tokenHash}`);
      if (!deviceId) return null;
      const device = devices.get(deviceId);
      if (!device || device.tenantId !== tenantId) return null;
      return device;
    },

    async findDevicesByTenantId(tenantId: string) {
      const result: AdapterDevice[] = [];
      for (const device of devices.values()) {
        if (device.tenantId === tenantId) {
          result.push(device);
        }
      }
      return result;
    },

    async createDevice(input: CreateDeviceInput) {
      const id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const device: AdapterDevice = {
        id,
        tenantId: input.tenantId,
        name: input.name,
        deviceTokenHash: input.deviceTokenHash,
        status: input.status ?? 'active',
        deviceType: input.deviceType ?? null,
        deviceModel: input.deviceModel ?? null,
        osVersion: input.osVersion ?? null,
        appVersion: input.appVersion ?? null,
        lastSeenAt: null,
        lastIpAddress: input.lastIpAddress ?? null,
        metadata: input.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: null,
        revokedReason: null,
      };
      devices.set(id, device);
      tokenHashIndex.set(`${input.tenantId}:${input.deviceTokenHash}`, id);
      return device;
    },

    async updateDevice(id: string, data: UpdateDeviceInput) {
      const device = devices.get(id);
      if (!device) {
        throw new Error("Device not found");
      }

      // Handle token hash update (need to update index)
      if (data.deviceTokenHash && data.deviceTokenHash !== device.deviceTokenHash) {
        tokenHashIndex.delete(`${device.tenantId}:${device.deviceTokenHash}`);
        tokenHashIndex.set(`${device.tenantId}:${data.deviceTokenHash}`, id);
      }

      const updated: AdapterDevice = {
        ...device,
        ...data,
        updatedAt: new Date(),
      };
      devices.set(id, updated);
      return updated;
    },

    async deleteDevice(id: string) {
      const device = devices.get(id);
      if (device) {
        tokenHashIndex.delete(`${device.tenantId}:${device.deviceTokenHash}`);
        devices.delete(id);
      }
    },
  };
}

describe("@parsrun/auth - DeviceAuthManager", () => {
  let storage: KVStorage;
  let adapter: ReturnType<typeof createMockAdapter>;
  let deviceAuthManager: DeviceAuthManager;

  beforeEach(async () => {
    storage = createMemoryStorage();
    adapter = createMockAdapter();
    deviceAuthManager = createDeviceAuthManager(storage, adapter, {
      enabled: true,
      pairingExpiryMinutes: 30,
    });
  });

  describe("isEnabled", () => {
    it("should return true when enabled", () => {
      expect(deviceAuthManager.isEnabled()).toBe(true);
    });

    it("should return false when disabled", () => {
      const disabledManager = createDeviceAuthManager(storage, adapter, {
        enabled: false,
      });
      expect(disabledManager.isEnabled()).toBe(false);
    });
  });

  describe("getHeaderName", () => {
    it("should return default header name", () => {
      expect(deviceAuthManager.getHeaderName()).toBe("X-Device-Token");
    });

    it("should return custom header name", () => {
      const customManager = createDeviceAuthManager(storage, adapter, {
        enabled: true,
        headerName: "X-Custom-Device-Token",
      });
      expect(customManager.getHeaderName()).toBe("X-Custom-Device-Token");
    });
  });

  describe("createPairingCode", () => {
    it("should create a pairing code successfully", async () => {
      const result = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Entrance Tablet",
        deviceType: "tablet",
      });

      expect(result.success).toBe(true);
      expect(result.pairingCode).toBeDefined();
      expect(result.pairingCode).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{5}$/);
      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("should fail when device auth is disabled", async () => {
      const disabledManager = createDeviceAuthManager(storage, adapter, {
        enabled: false,
      });

      const result = await disabledManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test Device",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Device authentication is not enabled");
    });

    it("should generate numeric pairing code when configured", async () => {
      const numericManager = createDeviceAuthManager(storage, adapter, {
        enabled: true,
        pairingCodeFormat: "numeric",
        pairingCodeLength: 8,
      });

      const result = await numericManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test Device",
      });

      expect(result.success).toBe(true);
      expect(result.pairingCode).toMatch(/^[0-9]{3}-[0-9]{5}$/);
    });
  });

  describe("registerDevice", () => {
    it("should register a device with valid pairing code", async () => {
      // Create pairing code
      const pairingResult = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Entrance Tablet",
        deviceType: "tablet",
        metadata: { location: "lobby" },
      });

      expect(pairingResult.success).toBe(true);

      // Register device
      const registerResult = await deviceAuthManager.registerDevice({
        pairingCode: pairingResult.pairingCode!,
        osVersion: "iOS 17.2",
        appVersion: "1.0.0",
        deviceModel: "iPad Pro 11",
        ipAddress: "192.168.1.100",
      });

      expect(registerResult.success).toBe(true);
      expect(registerResult.deviceToken).toBeDefined();
      expect(registerResult.deviceToken).toMatch(/^dvc_[a-f0-9]{64}$/);
      expect(registerResult.device).toBeDefined();
      expect(registerResult.device!.name).toBe("Entrance Tablet");
      expect(registerResult.device!.tenantId).toBe("tenant-1");
      expect(registerResult.device!.status).toBe("active");
      expect(registerResult.device!.osVersion).toBe("iOS 17.2");
      expect(registerResult.device!.deviceModel).toBe("iPad Pro 11");
      expect(registerResult.device!.metadata).toEqual({ location: "lobby" });
    });

    it("should fail with invalid pairing code", async () => {
      const result = await deviceAuthManager.registerDevice({
        pairingCode: "INVALID-CODE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired pairing code");
    });

    it("should fail when device auth is disabled", async () => {
      const disabledManager = createDeviceAuthManager(storage, adapter, {
        enabled: false,
      });

      const result = await disabledManager.registerDevice({
        pairingCode: "ABC-12345",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Device authentication is not enabled");
    });

    it("should consume pairing code after use", async () => {
      // Create pairing code
      const pairingResult = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Entrance Tablet",
      });

      // Register device first time
      const registerResult1 = await deviceAuthManager.registerDevice({
        pairingCode: pairingResult.pairingCode!,
      });

      expect(registerResult1.success).toBe(true);

      // Try to register again with same code
      const registerResult2 = await deviceAuthManager.registerDevice({
        pairingCode: pairingResult.pairingCode!,
      });

      expect(registerResult2.success).toBe(false);
      expect(registerResult2.error).toBe("Invalid or expired pairing code");
    });

    it("should normalize pairing code (case insensitive)", async () => {
      const pairingResult = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test Device",
      });

      // Use lowercase version
      const lowerCaseCode = pairingResult.pairingCode!.toLowerCase();
      const result = await deviceAuthManager.registerDevice({
        pairingCode: lowerCaseCode,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("verifyDeviceToken", () => {
    let deviceToken: string;
    let device: AdapterDevice;

    beforeEach(async () => {
      // Create and register a device
      const pairingResult = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test Device",
      });

      const registerResult = await deviceAuthManager.registerDevice({
        pairingCode: pairingResult.pairingCode!,
      });

      deviceToken = registerResult.deviceToken!;
      device = registerResult.device!;
    });

    it("should verify valid device token", async () => {
      const result = await deviceAuthManager.verifyDeviceToken(deviceToken, "tenant-1");

      expect(result.valid).toBe(true);
      expect(result.device).toBeDefined();
      expect(result.device!.id).toBe(device.id);
      expect(result.device!.name).toBe("Test Device");
    });

    it("should fail with invalid token format", async () => {
      const result = await deviceAuthManager.verifyDeviceToken("invalid-token", "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid token format");
    });

    it("should fail with wrong tenant", async () => {
      const result = await deviceAuthManager.verifyDeviceToken(deviceToken, "wrong-tenant");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device not found");
    });

    it("should fail with non-existent token", async () => {
      const fakeToken = "dvc_" + "0".repeat(64);
      const result = await deviceAuthManager.verifyDeviceToken(fakeToken, "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device not found");
    });

    it("should fail for revoked device", async () => {
      // Revoke the device
      await deviceAuthManager.revokeDevice(device.id, "Test revoke");

      const result = await deviceAuthManager.verifyDeviceToken(deviceToken, "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device is revoked");
    });

    it("should fail for inactive device", async () => {
      // Set device to inactive
      await deviceAuthManager.updateDevice(device.id, { status: "inactive" });

      const result = await deviceAuthManager.verifyDeviceToken(deviceToken, "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device is inactive");
    });

    it("should fail when device auth is disabled", async () => {
      const disabledManager = createDeviceAuthManager(storage, adapter, {
        enabled: false,
      });

      const result = await disabledManager.verifyDeviceToken(deviceToken, "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Device authentication is not enabled");
    });
  });

  describe("getDevices", () => {
    it("should return all devices for a tenant", async () => {
      // Create multiple devices
      const pairingResult1 = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Device 1",
      });
      await deviceAuthManager.registerDevice({
        pairingCode: pairingResult1.pairingCode!,
      });

      const pairingResult2 = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Device 2",
      });
      await deviceAuthManager.registerDevice({
        pairingCode: pairingResult2.pairingCode!,
      });

      // Device for different tenant
      const pairingResult3 = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-2",
        name: "Device 3",
      });
      await deviceAuthManager.registerDevice({
        pairingCode: pairingResult3.pairingCode!,
      });

      const result = await deviceAuthManager.getDevices("tenant-1");

      expect(result.success).toBe(true);
      expect(result.devices).toHaveLength(2);
      expect(result.devices.map(d => d.name).sort()).toEqual(["Device 1", "Device 2"]);
    });

    it("should return empty array for tenant with no devices", async () => {
      const result = await deviceAuthManager.getDevices("empty-tenant");

      expect(result.success).toBe(true);
      expect(result.devices).toHaveLength(0);
    });
  });

  describe("updateDevice", () => {
    let device: AdapterDevice;

    beforeEach(async () => {
      const pairingResult = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test Device",
      });

      const registerResult = await deviceAuthManager.registerDevice({
        pairingCode: pairingResult.pairingCode!,
      });

      device = registerResult.device!;
    });

    it("should update device name", async () => {
      const updated = await deviceAuthManager.updateDevice(device.id, {
        name: "Updated Device Name",
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe("Updated Device Name");
    });

    it("should update device status", async () => {
      const updated = await deviceAuthManager.updateDevice(device.id, {
        status: "inactive",
      });

      expect(updated).toBeDefined();
      expect(updated!.status).toBe("inactive");
    });

    it("should update device metadata", async () => {
      const updated = await deviceAuthManager.updateDevice(device.id, {
        metadata: { location: "reception", floor: 1 },
      });

      expect(updated).toBeDefined();
      expect(updated!.metadata).toEqual({ location: "reception", floor: 1 });
    });
  });

  describe("revokeDevice", () => {
    let device: AdapterDevice;
    let deviceToken: string;

    beforeEach(async () => {
      const pairingResult = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test Device",
      });

      const registerResult = await deviceAuthManager.registerDevice({
        pairingCode: pairingResult.pairingCode!,
      });

      device = registerResult.device!;
      deviceToken = registerResult.deviceToken!;
    });

    it("should revoke a device", async () => {
      const result = await deviceAuthManager.revokeDevice(device.id, "Security concern");

      expect(result.success).toBe(true);

      // Verify device is revoked
      const verifyResult = await deviceAuthManager.verifyDeviceToken(deviceToken, "tenant-1");
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toBe("Device is revoked");
    });

    it("should revoke without reason", async () => {
      const result = await deviceAuthManager.revokeDevice(device.id);

      expect(result.success).toBe(true);
    });
  });

  describe("regenerateDeviceToken", () => {
    let device: AdapterDevice;
    let originalToken: string;

    beforeEach(async () => {
      const pairingResult = await deviceAuthManager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test Device",
      });

      const registerResult = await deviceAuthManager.registerDevice({
        pairingCode: pairingResult.pairingCode!,
      });

      device = registerResult.device!;
      originalToken = registerResult.deviceToken!;
    });

    it("should regenerate device token", async () => {
      const result = await deviceAuthManager.regenerateDeviceToken(device.id);

      expect(result.success).toBe(true);
      expect(result.deviceToken).toBeDefined();
      expect(result.deviceToken).toMatch(/^dvc_[a-f0-9]{64}$/);
      expect(result.deviceToken).not.toBe(originalToken);
    });

    it("should invalidate old token after regeneration", async () => {
      const result = await deviceAuthManager.regenerateDeviceToken(device.id);

      // Old token should not work
      const verifyOld = await deviceAuthManager.verifyDeviceToken(originalToken, "tenant-1");
      expect(verifyOld.valid).toBe(false);

      // New token should work
      const verifyNew = await deviceAuthManager.verifyDeviceToken(result.deviceToken!, "tenant-1");
      expect(verifyNew.valid).toBe(true);
    });

    it("should fail for non-existent device", async () => {
      const result = await deviceAuthManager.regenerateDeviceToken("non-existent-id");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Device not found");
    });
  });

  describe("disabled adapter", () => {
    it("should fail gracefully when adapter has no device operations", async () => {
      // Create adapter without device operations
      const basicAdapter: AuthAdapter = {
        async findUserById() { return null; },
        async findUserByEmail() { return null; },
        async findUserByPhone() { return null; },
        async createUser() { throw new Error("Not implemented"); },
        async updateUser() { throw new Error("Not implemented"); },
        async deleteUser() {},
        async findSessionById() { return null; },
        async findSessionsByUserId() { return []; },
        async createSession() { throw new Error("Not implemented"); },
        async updateSession() { throw new Error("Not implemented"); },
        async deleteSession() {},
        async deleteSessionsByUserId() {},
        async findAuthMethod() { return null; },
        async findAuthMethodsByUserId() { return []; },
        async createAuthMethod() { throw new Error("Not implemented"); },
        async updateAuthMethod() { throw new Error("Not implemented"); },
        async deleteAuthMethod() {},
        // No device operations defined
      };

      const manager = createDeviceAuthManager(storage, basicAdapter, { enabled: true });

      const pairingResult = await manager.createPairingCode({
        tenantId: "tenant-1",
        name: "Test",
      });

      expect(pairingResult.success).toBe(false);
      expect(pairingResult.error).toBe("Device operations not supported by adapter");
    });
  });
});
