/**
 * Pars Auth Configuration
 * Passwordless-first, provider-based authentication
 */

import type { StorageConfig } from './storage/types.js';

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Access token expiry in seconds (default: 900 = 15 minutes) */
  accessTokenExpiry?: number;
  /** Refresh token expiry in seconds (default: 604800 = 7 days) */
  refreshTokenExpiry?: number;
  /** Enable sliding window for refresh tokens (default: true) */
  slidingWindow?: boolean;
  /** Maximum concurrent sessions per user (default: 5) */
  maxSessions?: number;
  /** Invalidate all sessions on password change (default: true) */
  invalidateOnPasswordChange?: boolean;
}

/**
 * JWT configuration
 */
export interface JwtConfig {
  /** JWT signing algorithm (default: HS256) */
  algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
  /** JWT issuer claim */
  issuer?: string;
  /** JWT audience claim */
  audience?: string | string[];
}

/**
 * Cookie configuration
 */
export interface CookieConfig {
  /** Cookie name prefix (default: 'pars') */
  prefix?: string;
  /** Cookie domain */
  domain?: string;
  /** Cookie path (default: '/') */
  path?: string;
  /** Use secure cookies (default: true in production) */
  secure?: boolean;
  /** SameSite attribute (default: 'lax') */
  sameSite?: 'strict' | 'lax' | 'none';
  /** HttpOnly for refresh token (default: true) */
  httpOnly?: boolean;
}

/**
 * CSRF configuration
 */
export interface CsrfConfig {
  /** Enable CSRF protection (default: true) */
  enabled?: boolean;
  /** CSRF header name (default: 'x-csrf-token') */
  headerName?: string;
  /** CSRF cookie name (default: 'csrf') */
  cookieName?: string;
}

/**
 * Tenant resolution strategy
 */
export type TenantResolutionStrategy =
  | 'subdomain'  // tenant.example.com
  | 'header'     // X-Tenant-ID header
  | 'path'       // /tenant/api/...
  | 'query'      // ?tenant=...
  | 'custom';    // Custom resolver function

/**
 * Multi-tenant configuration
 */
export interface TenantConfig {
  /** Enable multi-tenancy (default: true) */
  enabled?: boolean;
  /** Tenant resolution strategy (default: 'header') */
  strategy?: TenantResolutionStrategy;
  /** Header name for tenant ID (default: 'x-tenant-id') */
  headerName?: string;
  /** Custom tenant resolver */
  resolver?: (request: Request) => Promise<string | null>;
}

/**
 * OAuth provider configuration
 */
export interface OAuthProviderConfig {
  /** Enable this provider */
  enabled?: boolean;
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** OAuth scopes */
  scopes?: string[];
  /** Callback URL (default: baseUrl + /auth/callback/:provider) */
  callbackUrl?: string;
}

/**
 * OTP (One-Time Password) configuration
 */
export interface OtpConfig {
  /** Enable OTP authentication (default: true) */
  enabled?: boolean;

  /** Email OTP configuration */
  email?: {
    /** Enable email OTP (default: true) */
    enabled?: boolean;
    /** OTP expiry in seconds (default: 600 = 10 minutes) */
    expiresIn?: number;
    /** OTP code length (default: 6) */
    length?: number;
    /** Maximum verification attempts (default: 3) */
    maxAttempts?: number;
    /** Rate limit: max requests per window (default: 5) */
    rateLimit?: number;
    /** Rate limit window in seconds (default: 900 = 15 minutes) */
    rateLimitWindow?: number;
    /** Email sending function */
    send: (to: string, code: string) => Promise<void>;
  };

  /** SMS OTP configuration */
  sms?: {
    /** Enable SMS OTP (default: false) */
    enabled?: boolean;
    /** OTP expiry in seconds (default: 300 = 5 minutes) */
    expiresIn?: number;
    /** OTP code length (default: 6) */
    length?: number;
    /** Maximum verification attempts (default: 3) */
    maxAttempts?: number;
    /** Rate limit: max requests per window (default: 3) */
    rateLimit?: number;
    /** Rate limit window in seconds (default: 900 = 15 minutes) */
    rateLimitWindow?: number;
    /** SMS sending function */
    send: (to: string, code: string) => Promise<void>;
  };
}

/**
 * Magic Link configuration
 */
export interface MagicLinkConfig {
  /** Enable magic link authentication (default: false) */
  enabled?: boolean;
  /** Link expiry in seconds (default: 900 = 15 minutes) */
  expiresIn?: number;
  /** Email sending function */
  send: (to: string, url: string) => Promise<void>;
}

/**
 * TOTP (Time-based One-Time Password) configuration for 2FA
 */
export interface TotpConfig {
  /** Enable TOTP 2FA (default: false) */
  enabled?: boolean;
  /** TOTP issuer name (shown in authenticator apps) */
  issuer?: string;
  /** Number of backup codes to generate (default: 10) */
  backupCodesCount?: number;
}

/**
 * WebAuthn/Passkey configuration
 */
export interface WebAuthnConfig {
  /** Enable WebAuthn (default: false) */
  enabled?: boolean;
  /** Relying party name (your app name) */
  rpName: string;
  /** Relying party ID (your domain) */
  rpId: string;
  /** Allowed origins */
  origins?: string[];
}

/**
 * Password configuration (DISABLED BY DEFAULT)
 */
export interface PasswordConfig {
  /**
   * Enable password authentication
   * @default false - Passwordless is recommended
   */
  enabled?: boolean;
  /** Minimum password length (default: 8) */
  minLength?: number;
  /** Require uppercase letters (default: false) */
  requireUppercase?: boolean;
  /** Require lowercase letters (default: false) */
  requireLowercase?: boolean;
  /** Require numbers (default: false) */
  requireNumbers?: boolean;
  /** Require special characters (default: false) */
  requireSymbols?: boolean;
  /** Check against common passwords (default: true) */
  checkCommonPasswords?: boolean;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  /** Rate limiting configuration */
  rateLimit?: {
    /** Enable rate limiting (default: true) */
    enabled?: boolean;
    /** Login attempts per window (default: 5) */
    loginAttempts?: number;
    /** Window size in seconds (default: 900 = 15 minutes) */
    windowSize?: number;
  };
  /** Account lockout configuration */
  lockout?: {
    /** Enable account lockout (default: true) */
    enabled?: boolean;
    /** Failed attempts before lockout (default: 5) */
    maxAttempts?: number;
    /** Lockout duration in seconds (default: 900 = 15 minutes) */
    duration?: number;
  };
  /** CSRF configuration */
  csrf?: CsrfConfig;
}

/**
 * Auth callbacks for extensibility
 */
export interface AuthCallbacks {
  /** Called after successful sign up */
  onSignUp?: (user: { id: string; email?: string | null }) => Promise<void>;
  /** Called after successful sign in */
  onSignIn?: (user: { id: string; email?: string | null }, session: { id: string }) => Promise<void>;
  /** Called after sign out */
  onSignOut?: (userId: string, sessionId: string) => Promise<void>;
  /** Called when a new session is created */
  onSessionCreated?: (session: { id: string; userId: string }) => Promise<void>;
  /** Validate sign in (return false to reject) */
  validateSignIn?: (user: { id: string; email?: string | null }) => Promise<boolean>;
}

/**
 * Database adapter interface
 * Implement this to connect Pars Auth to your database
 */
export interface AuthAdapter {
  // User operations
  findUserById(id: string): Promise<AdapterUser | null>;
  findUserByEmail(email: string): Promise<AdapterUser | null>;
  findUserByPhone(phone: string): Promise<AdapterUser | null>;
  createUser(data: CreateUserInput): Promise<AdapterUser>;
  updateUser(id: string, data: Partial<AdapterUser>): Promise<AdapterUser>;
  deleteUser(id: string): Promise<void>;

  // Session operations
  findSessionById(id: string): Promise<AdapterSession | null>;
  findSessionsByUserId(userId: string): Promise<AdapterSession[]>;
  createSession(data: CreateSessionInput): Promise<AdapterSession>;
  updateSession(id: string, data: Partial<AdapterSession>): Promise<AdapterSession>;
  deleteSession(id: string): Promise<void>;
  deleteSessionsByUserId(userId: string): Promise<void>;

  // Auth method operations (for OAuth, etc.)
  findAuthMethod(provider: string, providerId: string): Promise<AdapterAuthMethod | null>;
  findAuthMethodsByUserId(userId: string): Promise<AdapterAuthMethod[]>;
  createAuthMethod(data: CreateAuthMethodInput): Promise<AdapterAuthMethod>;
  updateAuthMethod(id: string, data: Partial<AdapterAuthMethod>): Promise<AdapterAuthMethod>;
  deleteAuthMethod(id: string): Promise<void>;

  // Tenant operations (optional for multi-tenant)
  findTenantById?(id: string): Promise<AdapterTenant | null>;
  findTenantBySlug?(slug: string): Promise<AdapterTenant | null>;
  createTenant?(data: CreateTenantInput): Promise<AdapterTenant>;
  updateTenant?(id: string, data: Partial<AdapterTenant>): Promise<AdapterTenant>;
  deleteTenant?(id: string): Promise<void>;

  // Tenant hierarchy operations (optional)
  findTenantsByParentId?(parentId: string | null): Promise<AdapterTenant[]>;
  findTenantsByPath?(pathPrefix: string): Promise<AdapterTenant[]>;
  updateTenantPath?(tenantId: string, path: string, depth: number): Promise<void>;

  // Membership operations (optional for multi-tenant)
  findMembership?(userId: string, tenantId: string): Promise<AdapterMembership | null>;
  findMembershipsByUserId?(userId: string): Promise<AdapterMembership[]>;
  createMembership?(data: CreateMembershipInput): Promise<AdapterMembership>;
  updateMembership?(id: string, data: Partial<AdapterMembership>): Promise<AdapterMembership>;
  deleteMembership?(id: string): Promise<void>;
}

// Adapter types
export interface AdapterUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  avatar?: string | null;
  twoFactorEnabled?: boolean;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
}

export interface AdapterSession {
  id: string;
  userId: string;
  tenantId?: string | null;
  expiresAt: Date;
  refreshExpiresAt?: Date | null;
  deviceType?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  status: 'active' | 'expired' | 'revoked';
  createdAt: Date;
  updatedAt: Date;
}

export interface AdapterAuthMethod {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  verified: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdapterTenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'inactive';
  /** Parent tenant ID for hierarchical tenants */
  parentId?: string | null;
  /** Materialized path for efficient ancestor/descendant queries (e.g., "/root-id/parent-id/id/") */
  path?: string | null;
  /** Hierarchy depth (0 = root tenant) */
  depth?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdapterMembership {
  id: string;
  userId: string;
  tenantId: string;
  role: string;
  permissions?: string[];
  status: 'active' | 'inactive' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email?: string;
  phone?: string;
  name?: string;
  avatar?: string;
  /** Whether the auth method should be marked as verified (default: false) */
  verified?: boolean;
}

export interface CreateSessionInput {
  userId: string;
  tenantId?: string;
  expiresAt: Date;
  refreshExpiresAt?: Date;
  deviceType?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface CreateAuthMethodInput {
  userId: string;
  provider: string;
  providerId: string;
  verified?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateMembershipInput {
  userId: string;
  tenantId: string;
  role: string;
  permissions?: string[];
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  status?: 'active' | 'suspended' | 'inactive';
  parentId?: string | null;
  path?: string | null;
  depth?: number | null;
}

/**
 * Main Pars Auth Configuration
 */
export interface ParsAuthConfig {
  /**
   * Secret key for signing tokens (required)
   * Use a strong, random string of at least 32 characters
   */
  secret: string;

  /**
   * Base URL of your application
   * Used for OAuth callbacks, magic links, etc.
   */
  baseUrl?: string;

  /**
   * Storage configuration for OTP, rate limiting, etc.
   * Auto-detects runtime if not specified
   */
  storage?: StorageConfig;

  /**
   * Authentication providers
   */
  providers?: {
    /** OTP configuration (enabled by default) */
    otp?: OtpConfig;
    /** Magic Link configuration */
    magicLink?: MagicLinkConfig;
    /** OAuth providers */
    oauth?: {
      google?: OAuthProviderConfig;
      github?: OAuthProviderConfig;
      microsoft?: OAuthProviderConfig;
      apple?: OAuthProviderConfig;
      /** Custom OAuth providers */
      custom?: Record<string, OAuthProviderConfig>;
    };
    /** TOTP 2FA configuration */
    totp?: TotpConfig;
    /** WebAuthn/Passkey configuration */
    webauthn?: WebAuthnConfig;
    /**
     * Password configuration
     * @default { enabled: false }
     */
    password?: PasswordConfig;
  };

  /** Session configuration */
  session?: SessionConfig;

  /** JWT configuration */
  jwt?: JwtConfig;

  /** Cookie configuration */
  cookies?: CookieConfig;

  /** Security configuration */
  security?: SecurityConfig;

  /** Multi-tenant configuration */
  tenant?: TenantConfig;

  /** Database adapter (required) */
  adapter: AuthAdapter;

  /** Lifecycle callbacks */
  callbacks?: AuthCallbacks;
}

/**
 * Default configuration (passwordless-first)
 */
export const defaultConfig: Partial<ParsAuthConfig> = {
  providers: {
    otp: {
      enabled: true,
      email: {
        enabled: true,
        expiresIn: 600,
        length: 6,
        maxAttempts: 3,
        rateLimit: 5,
        rateLimitWindow: 900,
        // send function must be provided by user
        send: async () => {
          throw new Error('[Pars Auth] Email OTP send function not configured');
        },
      },
      sms: {
        enabled: false,
        expiresIn: 300,
        length: 6,
        maxAttempts: 3,
        rateLimit: 3,
        rateLimitWindow: 900,
        send: async () => {
          throw new Error('[Pars Auth] SMS OTP send function not configured');
        },
      },
    },
    password: {
      enabled: false, // EXPLICITLY DISABLED BY DEFAULT
    },
  },
  session: {
    accessTokenExpiry: 900, // 15 minutes
    refreshTokenExpiry: 604800, // 7 days
    slidingWindow: true,
    maxSessions: 5,
    invalidateOnPasswordChange: true,
  },
  jwt: {
    algorithm: 'HS256',
  },
  cookies: {
    prefix: 'pars',
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  },
  security: {
    rateLimit: {
      enabled: true,
      loginAttempts: 5,
      windowSize: 900,
    },
    lockout: {
      enabled: true,
      maxAttempts: 5,
      duration: 900,
    },
    csrf: {
      enabled: true,
      headerName: 'x-csrf-token',
      cookieName: 'csrf',
    },
  },
  tenant: {
    enabled: true,
    strategy: 'header',
    headerName: 'x-tenant-id',
  },
};

/**
 * Merge user config with defaults
 */
export function mergeConfig(config: ParsAuthConfig): Required<ParsAuthConfig> {
  return {
    secret: config.secret,
    baseUrl: config.baseUrl ?? '',
    storage: config.storage ?? {},
    providers: {
      ...defaultConfig.providers,
      ...config.providers,
      otp: {
        ...defaultConfig.providers?.otp,
        ...config.providers?.otp,
        email: {
          ...defaultConfig.providers?.otp?.email,
          ...config.providers?.otp?.email,
        },
        sms: {
          ...defaultConfig.providers?.otp?.sms,
          ...config.providers?.otp?.sms,
        },
      },
      password: {
        ...defaultConfig.providers?.password,
        ...config.providers?.password,
      },
    },
    session: { ...defaultConfig.session, ...config.session } as Required<SessionConfig>,
    jwt: { ...defaultConfig.jwt, ...config.jwt } as Required<JwtConfig>,
    cookies: { ...defaultConfig.cookies, ...config.cookies } as Required<CookieConfig>,
    security: {
      ...defaultConfig.security,
      ...config.security,
      rateLimit: { ...defaultConfig.security?.rateLimit, ...config.security?.rateLimit },
      lockout: { ...defaultConfig.security?.lockout, ...config.security?.lockout },
      csrf: { ...defaultConfig.security?.csrf, ...config.security?.csrf },
    } as Required<SecurityConfig>,
    tenant: { ...defaultConfig.tenant, ...config.tenant } as Required<TenantConfig>,
    adapter: config.adapter,
    callbacks: config.callbacks ?? {},
  } as Required<ParsAuthConfig>;
}

/**
 * Validate configuration
 */
export function validateConfig(config: ParsAuthConfig): void {
  if (!config.secret) {
    throw new Error('[Pars Auth] Secret is required');
  }

  if (config.secret.length < 32) {
    console.warn(
      '[Pars Auth] Secret should be at least 32 characters for security'
    );
  }

  if (!config.adapter) {
    throw new Error('[Pars Auth] Database adapter is required');
  }

  // Warn if password is enabled
  if (config.providers?.password?.enabled) {
    console.warn(
      '[Pars Auth] Password authentication is enabled. Consider using passwordless authentication (OTP, Magic Link, WebAuthn) for better security.'
    );
  }

  // Check OTP send function
  if (
    config.providers?.otp?.email?.enabled !== false &&
    !config.providers?.otp?.email?.send
  ) {
    console.warn(
      '[Pars Auth] Email OTP is enabled but send function is not configured'
    );
  }
}
