/**
 * TOTP Provider (Time-based One-Time Password)
 * RFC 6238 compliant, Google Authenticator compatible
 */

import type { KVStorage } from '../../storage/types.js';
import type { TwoFactorProvider, TwoFactorSetupResult, ProviderInfo, AuthInput, AuthResult } from '../base.js';
import { generateRandomHex } from '../../utils/crypto.js';

/**
 * TOTP Configuration
 */
export interface TOTPConfig {
  /** Issuer name (your app name) */
  issuer: string;
  /** Hash algorithm (default: SHA1 for compatibility) */
  algorithm?: 'SHA1' | 'SHA256' | 'SHA512';
  /** Number of digits (default: 6) */
  digits?: 6 | 8;
  /** Time period in seconds (default: 30) */
  period?: number;
  /** Time window for drift tolerance (default: 1) */
  window?: number;
  /** Number of backup codes (default: 10) */
  backupCodeCount?: number;
  /** Encryption key for storing secrets */
  encryptionKey?: string;
}

/**
 * TOTP secret record
 */
interface TOTPSecret {
  userId: string;
  encryptedSecret: string;
  backupCodes: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * TOTP setup result
 */
export interface TOTPSetupData {
  /** Base32 encoded secret */
  secret: string;
  /** QR code URL */
  qrCodeUrl: string;
  /** Backup codes */
  backupCodes: string[];
  /** otpauth:// URI */
  otpauthUri: string;
}

/**
 * TOTP verify result
 */
export interface TOTPVerifyResult {
  valid: boolean;
  usedBackupCode?: boolean;
}

const DEFAULT_CONFIG = {
  algorithm: 'SHA1' as const,
  digits: 6 as const,
  period: 30,
  window: 1,
  backupCodeCount: 10,
};

/**
 * Convert bytes to base32
 */
function bytesToBase32(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  return result;
}

/**
 * Convert base32 to bytes
 */
function base32ToBytes(base32: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * HMAC-based One-Time Password
 */
async function hotp(
  secret: Uint8Array,
  counter: bigint,
  algorithm: string,
  digits: number
): Promise<string> {
  // Convert counter to 8-byte big-endian
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setBigUint64(0, counter, false);

  // Map algorithm names
  const hashName = algorithm === 'SHA1' ? 'SHA-1' : `SHA-${algorithm.slice(3)}`;

  // Import key for HMAC
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: hashName },
    false,
    ['sign']
  );

  // Generate HMAC
  const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
  const hmac = new Uint8Array(signature);

  // Dynamic truncation
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  // Generate OTP
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Generate TOTP for current time
 */
async function generateTOTP(
  secret: Uint8Array,
  algorithm: string,
  digits: number,
  period: number
): Promise<string> {
  const counter = BigInt(Math.floor(Date.now() / 1000 / period));
  return hotp(secret, counter, algorithm, digits);
}

/**
 * Verify TOTP with time window
 */
async function verifyTOTP(
  token: string,
  secret: Uint8Array,
  algorithm: string,
  digits: number,
  period: number,
  window: number
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000 / period);

  for (let i = -window; i <= window; i++) {
    const counter = BigInt(now + i);
    const expected = await hotp(secret, counter, algorithm, digits);
    if (token === expected) {
      return true;
    }
  }

  return false;
}

/**
 * Generate backup codes
 */
async function generateBackupCodes(count: number): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const hex = await generateRandomHex(4);
    // Format as XXXX-XXXX
    codes.push(`${hex.slice(0, 4).toUpperCase()}-${hex.slice(4, 8).toUpperCase()}`);
  }
  return codes;
}

/**
 * Simple AES-GCM encryption for secrets
 */
async function encryptSecret(secret: string, keyString: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const keyData = encoder.encode(keyString.padEnd(32, '0').slice(0, 32));

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypt secret
 */
async function decryptSecret(encrypted: string, keyString: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString.padEnd(32, '0').slice(0, 32));

  const data = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  return new TextDecoder().decode(decrypted);
}

/**
 * TOTP Provider
 */
export class TOTPProvider implements TwoFactorProvider {
  readonly name = 'totp';
  readonly type = 'totp' as const;

  private storage: KVStorage;
  private config: Required<TOTPConfig>;
  private _enabled: boolean = true;

  constructor(storage: KVStorage, config: TOTPConfig) {
    this.storage = storage;
    this.config = {
      ...DEFAULT_CONFIG,
      encryptionKey: 'change-me-in-production',
      ...config,
    };
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Setup TOTP for a user
   * Note: Use setupWithEmail for full setup including QR code URL
   */
  async setup(userId: string): Promise<TwoFactorSetupResult> {
    return this.setupWithEmail(userId, userId);
  }

  /**
   * Setup TOTP for a user with email for QR code label
   */
  async setupWithEmail(userId: string, userEmail: string): Promise<TwoFactorSetupResult & { qrCodeUrl: string; otpauthUri: string }> {
    // Generate secret (160 bits = 20 bytes for SHA1)
    const secretBytes = crypto.getRandomValues(new Uint8Array(20));
    const secret = bytesToBase32(secretBytes);

    // Generate backup codes
    const backupCodes = await generateBackupCodes(this.config.backupCodeCount);

    // Create otpauth URI
    const otpauthUri = this.createOtpauthUri(secret, userEmail);

    // Create QR code URL (using Google Charts API)
    const qrCodeUrl = `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauthUri)}`;

    // Encrypt and store
    const encryptedSecret = await encryptSecret(secret, this.config.encryptionKey);
    const encryptedBackupCodes = await encryptSecret(
      JSON.stringify(backupCodes),
      this.config.encryptionKey
    );

    const totpData: TOTPSecret = {
      userId,
      encryptedSecret,
      backupCodes: encryptedBackupCodes,
      verified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.storage.set(`totp:user:${userId}`, totpData);

    return {
      secret,
      qrCode: qrCodeUrl,
      backupCodes,
      qrCodeUrl,
      otpauthUri,
    };
  }

  /**
   * Verify TOTP and activate 2FA (for TwoFactorProvider interface)
   */
  async verifySetup(userId: string, token: string): Promise<boolean> {
    const totpData = await this.storage.get<TOTPSecret>(`totp:user:${userId}`);

    if (!totpData) {
      throw new Error('TOTP not set up for this user');
    }

    const secret = await decryptSecret(totpData.encryptedSecret, this.config.encryptionKey);
    const secretBytes = base32ToBytes(secret);

    const valid = await verifyTOTP(
      token,
      secretBytes,
      this.config.algorithm,
      this.config.digits,
      this.config.period,
      this.config.window
    );

    if (valid) {
      totpData.verified = true;
      totpData.updatedAt = new Date().toISOString();
      await this.storage.set(`totp:user:${userId}`, totpData);
      return true;
    }

    return false;
  }

  /**
   * Verify TOTP during login (for TwoFactorProvider interface)
   */
  async verifyLogin(userId: string, code: string): Promise<boolean> {
    const result = await this.verifyCode(userId, code);
    return result.valid;
  }

  /**
   * Authenticate (for AuthProvider interface)
   */
  async authenticate(_input: AuthInput): Promise<AuthResult> {
    // TOTP is used as 2FA, not primary authentication
    return {
      success: false,
      error: 'TOTP is used for two-factor authentication, not primary auth',
      errorCode: 'USE_TWO_FACTOR_METHODS',
    };
  }

  /**
   * Verify TOTP token
   */
  async verifyCode(userId: string, token: string): Promise<TOTPVerifyResult> {
    const totpData = await this.storage.get<TOTPSecret>(`totp:user:${userId}`);

    if (!totpData || !totpData.verified) {
      throw new Error('TOTP not enabled for this user');
    }

    // Try TOTP first
    const secret = await decryptSecret(totpData.encryptedSecret, this.config.encryptionKey);
    const secretBytes = base32ToBytes(secret);

    const validTOTP = await verifyTOTP(
      token,
      secretBytes,
      this.config.algorithm,
      this.config.digits,
      this.config.period,
      this.config.window
    );

    if (validTOTP) {
      return { valid: true, usedBackupCode: false };
    }

    // Try backup codes
    const backupCodesJson = await decryptSecret(
      totpData.backupCodes,
      this.config.encryptionKey
    );
    const backupCodes: string[] = JSON.parse(backupCodesJson);

    const normalizedToken = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const backupIndex = backupCodes.findIndex(
      (code) => code.replace('-', '') === normalizedToken
    );

    if (backupIndex !== -1) {
      // Remove used backup code
      backupCodes.splice(backupIndex, 1);
      const encryptedBackupCodes = await encryptSecret(
        JSON.stringify(backupCodes),
        this.config.encryptionKey
      );

      totpData.backupCodes = encryptedBackupCodes;
      totpData.updatedAt = new Date().toISOString();
      await this.storage.set(`totp:user:${userId}`, totpData);

      return { valid: true, usedBackupCode: true };
    }

    return { valid: false };
  }

  /**
   * Disable TOTP for user
   */
  async disable(userId: string): Promise<void> {
    await this.storage.delete(`totp:user:${userId}`);
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const totpData = await this.storage.get<TOTPSecret>(`totp:user:${userId}`);

    if (!totpData || !totpData.verified) {
      throw new Error('TOTP not enabled for this user');
    }

    const backupCodes = await generateBackupCodes(this.config.backupCodeCount);
    const encryptedBackupCodes = await encryptSecret(
      JSON.stringify(backupCodes),
      this.config.encryptionKey
    );

    totpData.backupCodes = encryptedBackupCodes;
    totpData.updatedAt = new Date().toISOString();
    await this.storage.set(`totp:user:${userId}`, totpData);

    return backupCodes;
  }

  /**
   * Get remaining backup codes count
   */
  async getBackupCodesCount(userId: string): Promise<number> {
    const totpData = await this.storage.get<TOTPSecret>(`totp:user:${userId}`);

    if (!totpData) {
      return 0;
    }

    const backupCodesJson = await decryptSecret(
      totpData.backupCodes,
      this.config.encryptionKey
    );
    const backupCodes: string[] = JSON.parse(backupCodesJson);

    return backupCodes.length;
  }

  /**
   * Check if TOTP is enabled for user
   */
  async isEnabled(userId: string): Promise<boolean> {
    const totpData = await this.storage.get<TOTPSecret>(`totp:user:${userId}`);
    return !!totpData?.verified;
  }

  /**
   * Generate current TOTP (for testing)
   */
  async generateCurrent(userId: string): Promise<string> {
    const totpData = await this.storage.get<TOTPSecret>(`totp:user:${userId}`);

    if (!totpData) {
      throw new Error('TOTP not set up for this user');
    }

    const secret = await decryptSecret(totpData.encryptedSecret, this.config.encryptionKey);
    const secretBytes = base32ToBytes(secret);

    return generateTOTP(
      secretBytes,
      this.config.algorithm,
      this.config.digits,
      this.config.period
    );
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      displayName: 'Authenticator App',
    };
  }

  /**
   * Create otpauth URI for QR code
   */
  private createOtpauthUri(secret: string, userEmail: string): string {
    const params = new URLSearchParams({
      secret,
      issuer: this.config.issuer,
      algorithm: this.config.algorithm,
      digits: String(this.config.digits),
      period: String(this.config.period),
    });

    const label = encodeURIComponent(`${this.config.issuer}:${userEmail}`);
    return `otpauth://totp/${label}?${params}`;
  }
}

/**
 * Create TOTP provider
 */
export function createTOTPProvider(storage: KVStorage, config: TOTPConfig): TOTPProvider {
  return new TOTPProvider(storage, config);
}
