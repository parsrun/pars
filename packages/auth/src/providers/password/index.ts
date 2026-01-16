/**
 * Password Provider
 * Traditional password-based authentication
 * DISABLED BY DEFAULT - use passwordless methods when possible
 */

import type { KVStorage } from '../../storage/types.js';
import type { AuthProvider, AuthInput, AuthResult, ProviderInfo } from '../base.js';

/**
 * Password configuration
 */
export interface PasswordConfig {
  /** Minimum password length (default: 8) */
  minLength?: number;
  /** Maximum password length (default: 128) */
  maxLength?: number;
  /** Require uppercase letter (default: true) */
  requireUppercase?: boolean;
  /** Require lowercase letter (default: true) */
  requireLowercase?: boolean;
  /** Require number (default: true) */
  requireNumber?: boolean;
  /** Require special character (default: false) */
  requireSpecial?: boolean;
  /** Bcrypt cost factor (default: 12) */
  bcryptCost?: number;
  /** Password hash function (for custom implementations) */
  hashPassword?: (password: string) => Promise<string>;
  /** Password verify function (for custom implementations) */
  verifyPassword?: (password: string, hash: string) => Promise<boolean>;
}

/**
 * Password validation result
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Password strength levels
 */
export type PasswordStrength = 'weak' | 'fair' | 'strong' | 'very-strong';

const DEFAULT_CONFIG: Required<Omit<PasswordConfig, 'hashPassword' | 'verifyPassword'>> = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: false,
  bcryptCost: 12,
};

/**
 * Password Provider
 * WARNING: This provider is disabled by default.
 * Consider using passwordless authentication (OTP, Magic Link, OAuth) for better security.
 */
export class PasswordProvider implements AuthProvider {
  readonly name = 'password';
  readonly type = 'password' as const;

  private storage: KVStorage;
  private config: Required<Omit<PasswordConfig, 'hashPassword' | 'verifyPassword'>> & {
    hashPassword?: PasswordConfig['hashPassword'];
    verifyPassword?: PasswordConfig['verifyPassword'];
  };
  private _enabled: boolean;

  constructor(storage: KVStorage, config?: PasswordConfig) {
    this.storage = storage;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    // DISABLED BY DEFAULT - must be explicitly enabled
    this._enabled = false;

    // Warn about password usage
    console.warn(
      '[Pars Auth] Password provider initialized. ' +
        'Consider using passwordless authentication for better security.'
    );
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Enable the password provider
   * Must be explicitly called to enable password authentication
   */
  enable(): void {
    this._enabled = true;
    console.warn(
      '[Pars Auth] Password provider enabled. ' +
        'Ensure you have proper security measures in place (rate limiting, account lockout, etc.)'
    );
  }

  /**
   * Disable the password provider
   */
  disable(): void {
    this._enabled = false;
  }

  /**
   * Validate password against policy
   */
  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (password.length < this.config.minLength) {
      errors.push(`Password must be at least ${this.config.minLength} characters`);
    }

    if (password.length > this.config.maxLength) {
      errors.push(`Password must be at most ${this.config.maxLength} characters`);
    }

    if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (this.config.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (this.config.requireNumber && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (this.config.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check password strength
   */
  checkStrength(password: string): PasswordStrength {
    let score = 0;

    // Length score
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;

    // Character variety score
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

    // Bonus for mixed characters
    if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) score++;

    if (score <= 3) return 'weak';
    if (score <= 5) return 'fair';
    if (score <= 7) return 'strong';
    return 'very-strong';
  }

  /**
   * Hash a password
   * Uses Web Crypto API for PBKDF2 (bcrypt alternative for edge runtime)
   */
  async hashPassword(password: string): Promise<string> {
    // Use custom hash function if provided
    if (this.config.hashPassword) {
      return this.config.hashPassword(password);
    }

    // Use PBKDF2 with Web Crypto API (edge-compatible)
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const iterations = 100000 * (this.config.bcryptCost / 10);
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const hashArray = new Uint8Array(derivedBits);

    // Format: $pbkdf2-sha256$iterations$salt$hash
    const saltB64 = btoa(String.fromCharCode(...salt));
    const hashB64 = btoa(String.fromCharCode(...hashArray));

    return `$pbkdf2-sha256$${iterations}$${saltB64}$${hashB64}`;
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    // Use custom verify function if provided
    if (this.config.verifyPassword) {
      return this.config.verifyPassword(password, hash);
    }

    // Parse PBKDF2 hash
    const parts = hash.split('$');
    if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha256') {
      return false;
    }

    const iterations = parseInt(parts[2]!, 10);
    const salt = Uint8Array.from(atob(parts[3]!), (c) => c.charCodeAt(0));
    const storedHash = Uint8Array.from(atob(parts[4]!), (c) => c.charCodeAt(0));

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const computedHash = new Uint8Array(derivedBits);

    // Constant-time comparison
    return this.constantTimeEquals(storedHash, computedHash);
  }

  /**
   * Authenticate with password (implements AuthProvider)
   */
  async authenticate(input: AuthInput): Promise<AuthResult> {
    if (!this._enabled) {
      return {
        success: false,
        error: 'Password authentication is disabled',
        errorCode: 'PROVIDER_DISABLED',
      };
    }

    const { identifier, credential } = input;

    if (!identifier || !credential) {
      return {
        success: false,
        error: 'Email and password are required',
        errorCode: 'INVALID_INPUT',
      };
    }

    // Password verification should be done by the auth engine
    // which has access to the user's stored password hash
    // This provider just validates the input format

    const validation = this.validatePassword(credential);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
        errorCode: 'INVALID_PASSWORD',
      };
    }

    return {
      success: true,
      // Auth engine will handle user lookup and password verification
    };
  }

  /**
   * Store password hash for a user
   */
  async setPassword(userId: string, password: string): Promise<{ success: boolean; errors?: string[] }> {
    const validation = this.validatePassword(password);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const hash = await this.hashPassword(password);
    await this.storage.set(`password:user:${userId}`, {
      hash,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Verify password for a user
   */
  async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    const data = await this.storage.get<{ hash: string }>(`password:user:${userId}`);
    if (!data) {
      return false;
    }

    return this.verifyPassword(password, data.hash);
  }

  /**
   * Check if user has password set
   */
  async hasPassword(userId: string): Promise<boolean> {
    return this.storage.has(`password:user:${userId}`);
  }

  /**
   * Remove password for a user (switch to passwordless)
   */
  async removePassword(userId: string): Promise<void> {
    await this.storage.delete(`password:user:${userId}`);
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      displayName: 'Password',
    };
  }

  /**
   * Constant-time comparison to prevent timing attacks
   */
  private constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i]! ^ b[i]!;
    }

    return result === 0;
  }
}

/**
 * Create Password provider
 */
export function createPasswordProvider(storage: KVStorage, config?: PasswordConfig): PasswordProvider {
  return new PasswordProvider(storage, config);
}
