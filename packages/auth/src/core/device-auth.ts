/**
 * Device Authentication Manager
 * Handles kiosk/tablet device authentication without user login
 */

import type { KVStorage } from '../storage/types.js';
import type {
  AuthAdapter,
  AdapterDevice,
  DeviceConfig,
  UpdateDeviceInput,
} from '../config.js';
import { generateRandomHex, sha256Hex } from '../utils/crypto.js';

// ============================================
// TYPES
// ============================================

/**
 * Input for creating a pairing code
 */
export interface CreatePairingCodeInput {
  /** Tenant ID the device will be associated with */
  tenantId: string;
  /** Device name (e.g., "Entrance Tablet") */
  name: string;
  /** Device type (e.g., "tablet", "kiosk") */
  deviceType?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of creating a pairing code
 */
export interface CreatePairingCodeResult {
  success: boolean;
  /** The pairing code (e.g., "ABC-12345") */
  pairingCode?: string;
  /** When the pairing code expires */
  expiresAt?: Date;
  error?: string;
}

/**
 * Input for registering a device
 */
export interface RegisterDeviceInput {
  /** The pairing code received from admin */
  pairingCode: string;
  /** OS version (e.g., "iOS 17.2") */
  osVersion?: string;
  /** App version (e.g., "1.0.0") */
  appVersion?: string;
  /** Device model (e.g., "iPad Pro 11") */
  deviceModel?: string;
  /** IP address of the device */
  ipAddress?: string;
}

/**
 * Result of registering a device
 */
export interface RegisterDeviceResult {
  success: boolean;
  /** The device token to be used for authentication */
  deviceToken?: string;
  /** The registered device */
  device?: AdapterDevice;
  error?: string;
}

/**
 * Result of verifying a device token
 */
export interface VerifyDeviceTokenResult {
  valid: boolean;
  /** The device if valid */
  device?: AdapterDevice;
  error?: string;
}

/**
 * Result of listing devices
 */
export interface DeviceListResult {
  success: boolean;
  devices: AdapterDevice[];
  error?: string;
}

/**
 * Result of revoking a device
 */
export interface RevokeDeviceResult {
  success: boolean;
  error?: string;
}

/**
 * Result of regenerating a device token
 */
export interface RegenerateDeviceTokenResult {
  success: boolean;
  /** The new device token */
  deviceToken?: string;
  device?: AdapterDevice;
  error?: string;
}

/**
 * Pairing data stored in KV storage
 */
interface PairingData {
  tenantId: string;
  name: string;
  deviceType?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

// ============================================
// CONSTANTS
// ============================================

const DEVICE_TOKEN_PREFIX = 'dvc_';
const PAIRING_KEY_PREFIX = 'device:pairing:';

const DEFAULT_CONFIG: Required<DeviceConfig> = {
  enabled: false,
  tokenLength: 32,
  pairingCodeFormat: 'alphanumeric',
  pairingCodeLength: 8,
  pairingExpiryMinutes: 30,
  headerName: 'X-Device-Token',
};

// ============================================
// DEVICE AUTH MANAGER
// ============================================

/**
 * Device Authentication Manager
 * Handles device pairing, registration, and token verification
 */
export class DeviceAuthManager {
  private storage: KVStorage;
  private adapter: AuthAdapter;
  private config: Required<DeviceConfig>;

  constructor(storage: KVStorage, adapter: AuthAdapter, config: DeviceConfig = {}) {
    this.storage = storage;
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if device auth is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the header name for device token
   */
  getHeaderName(): string {
    return this.config.headerName;
  }

  /**
   * Create a pairing code for device registration
   * Called by admin to generate a code that the kiosk will use
   */
  async createPairingCode(input: CreatePairingCodeInput): Promise<CreatePairingCodeResult> {
    if (!this.config.enabled) {
      return { success: false, error: 'Device authentication is not enabled' };
    }

    if (!this.adapter.createDevice) {
      return { success: false, error: 'Device operations not supported by adapter' };
    }

    try {
      // Generate pairing code
      const pairingCode = this.generatePairingCode();

      // Calculate expiry
      const expiresAt = new Date(Date.now() + this.config.pairingExpiryMinutes * 60 * 1000);

      // Store pairing data
      const pairingData: PairingData = {
        tenantId: input.tenantId,
        name: input.name,
        deviceType: input.deviceType,
        metadata: input.metadata,
        createdAt: Date.now(),
        expiresAt: expiresAt.getTime(),
      };

      const key = PAIRING_KEY_PREFIX + pairingCode.toUpperCase();
      await this.storage.set(key, JSON.stringify(pairingData), this.config.pairingExpiryMinutes * 60);

      return {
        success: true,
        pairingCode,
        expiresAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create pairing code',
      };
    }
  }

  /**
   * Register a device using a pairing code
   * Called by the kiosk/tablet to complete registration
   */
  async registerDevice(input: RegisterDeviceInput): Promise<RegisterDeviceResult> {
    if (!this.config.enabled) {
      return { success: false, error: 'Device authentication is not enabled' };
    }

    if (!this.adapter.createDevice) {
      return { success: false, error: 'Device operations not supported by adapter' };
    }

    try {
      // Normalize pairing code (uppercase, no spaces)
      const normalizedCode = input.pairingCode.toUpperCase().replace(/\s/g, '');

      // Get pairing data
      const key = PAIRING_KEY_PREFIX + normalizedCode;
      const pairingJson = await this.storage.get<string>(key);

      if (!pairingJson) {
        return { success: false, error: 'Invalid or expired pairing code' };
      }

      const pairingData: PairingData = JSON.parse(pairingJson as string);

      // Check if expired
      if (Date.now() > pairingData.expiresAt) {
        await this.storage.delete(key);
        return { success: false, error: 'Pairing code has expired' };
      }

      // Generate device token
      const deviceToken = await this.generateDeviceToken();
      const tokenHash = await sha256Hex(deviceToken);

      // Create device in database
      const device = await this.adapter.createDevice({
        tenantId: pairingData.tenantId,
        name: pairingData.name,
        deviceTokenHash: tokenHash,
        status: 'active',
        deviceType: pairingData.deviceType,
        deviceModel: input.deviceModel,
        osVersion: input.osVersion,
        appVersion: input.appVersion,
        lastIpAddress: input.ipAddress,
        metadata: pairingData.metadata,
      });

      // Delete pairing code (one-time use)
      await this.storage.delete(key);

      return {
        success: true,
        deviceToken,
        device,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to register device',
      };
    }
  }

  /**
   * Verify a device token
   * Called on each request to validate device access
   */
  async verifyDeviceToken(token: string, tenantId: string): Promise<VerifyDeviceTokenResult> {
    if (!this.config.enabled) {
      return { valid: false, error: 'Device authentication is not enabled' };
    }

    if (!this.adapter.findDeviceByTokenHash) {
      return { valid: false, error: 'Device operations not supported by adapter' };
    }

    try {
      // Validate token format
      if (!token.startsWith(DEVICE_TOKEN_PREFIX)) {
        return { valid: false, error: 'Invalid token format' };
      }

      // Hash the token
      const tokenHash = await sha256Hex(token);

      // Find device by token hash
      const device = await this.adapter.findDeviceByTokenHash(tokenHash, tenantId);

      if (!device) {
        return { valid: false, error: 'Device not found' };
      }

      // Check device status
      if (device.status !== 'active') {
        return { valid: false, error: `Device is ${device.status}` };
      }

      // Update last seen (fire and forget)
      if (this.adapter.updateDevice) {
        this.adapter.updateDevice(device.id, {
          lastSeenAt: new Date(),
        }).catch(() => {
          // Ignore errors for last seen updates
        });
      }

      return {
        valid: true,
        device,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to verify device token',
      };
    }
  }

  /**
   * Get all devices for a tenant
   */
  async getDevices(tenantId: string): Promise<DeviceListResult> {
    if (!this.config.enabled) {
      return { success: false, devices: [], error: 'Device authentication is not enabled' };
    }

    if (!this.adapter.findDevicesByTenantId) {
      return { success: false, devices: [], error: 'Device operations not supported by adapter' };
    }

    try {
      const devices = await this.adapter.findDevicesByTenantId(tenantId);
      return { success: true, devices };
    } catch (error) {
      return {
        success: false,
        devices: [],
        error: error instanceof Error ? error.message : 'Failed to get devices',
      };
    }
  }

  /**
   * Update a device
   */
  async updateDevice(
    deviceId: string,
    updates: Omit<UpdateDeviceInput, 'revokedAt' | 'revokedReason'>
  ): Promise<AdapterDevice | null> {
    if (!this.config.enabled) {
      return null;
    }

    if (!this.adapter.updateDevice) {
      return null;
    }

    try {
      return await this.adapter.updateDevice(deviceId, updates);
    } catch {
      return null;
    }
  }

  /**
   * Revoke a device
   */
  async revokeDevice(deviceId: string, reason?: string): Promise<RevokeDeviceResult> {
    if (!this.config.enabled) {
      return { success: false, error: 'Device authentication is not enabled' };
    }

    if (!this.adapter.updateDevice) {
      return { success: false, error: 'Device operations not supported by adapter' };
    }

    try {
      await this.adapter.updateDevice(deviceId, {
        status: 'revoked',
        revokedAt: new Date(),
        revokedReason: reason,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to revoke device',
      };
    }
  }

  /**
   * Regenerate a device token
   * Invalidates the old token and issues a new one
   */
  async regenerateDeviceToken(deviceId: string): Promise<RegenerateDeviceTokenResult> {
    if (!this.config.enabled) {
      return { success: false, error: 'Device authentication is not enabled' };
    }

    if (!this.adapter.findDeviceById || !this.adapter.updateDevice) {
      return { success: false, error: 'Device operations not supported by adapter' };
    }

    try {
      // Find the device
      const device = await this.adapter.findDeviceById(deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }

      // Generate new token
      const deviceToken = await this.generateDeviceToken();
      const tokenHash = await sha256Hex(deviceToken);

      // Update device with new token hash
      const updatedDevice = await this.adapter.updateDevice(deviceId, {
        deviceTokenHash: tokenHash,
      });

      return {
        success: true,
        deviceToken,
        device: updatedDevice,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to regenerate device token',
      };
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Generate a pairing code
   * Format: "ABC-12345" (alphanumeric) or "123-45678" (numeric)
   */
  private generatePairingCode(): string {
    const length = this.config.pairingCodeLength;
    const isNumeric = this.config.pairingCodeFormat === 'numeric';

    const chars = isNumeric
      ? '0123456789'
      : 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars: I, O, 0, 1

    let code = '';
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);

    for (let i = 0; i < length; i++) {
      code += chars[randomBytes[i]! % chars.length];
    }

    // Insert separator after first 3 characters for readability
    if (length >= 4) {
      const separatorPos = 3;
      code = code.slice(0, separatorPos) + '-' + code.slice(separatorPos);
    }

    return code;
  }

  /**
   * Generate a device token
   * Format: "dvc_" + 64 hex characters (32 bytes)
   */
  private async generateDeviceToken(): Promise<string> {
    const tokenHex = await generateRandomHex(this.config.tokenLength);
    return DEVICE_TOKEN_PREFIX + tokenHex;
  }
}

/**
 * Create a DeviceAuthManager instance
 */
export function createDeviceAuthManager(
  storage: KVStorage,
  adapter: AuthAdapter,
  config: DeviceConfig = {}
): DeviceAuthManager {
  return new DeviceAuthManager(storage, adapter, config);
}
