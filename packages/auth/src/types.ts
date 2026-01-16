/**
 * @parsrun/auth - Type Definitions
 *
 * NOTE: This file contains legacy type definitions.
 * Main types are now exported from config.ts and index.ts
 */

// Define core types locally until @parsrun/core is ready
export interface User {
  id: string;
  email?: string | null;
  name?: string | null;
  emailVerified?: boolean | null;
  twoFactorEnabled?: boolean | null;
  avatar?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface TenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  role?: string;
  createdAt: Date;
}

// Re-export provider types
export type {
  ProviderType,
  ProviderInfo,
  AuthProvider,
  AuthInput,
  AuthResult,
  VerifyInput,
  VerifyResult,
  TwoFactorProvider,
  TwoFactorSetupResult,
  OAuthProvider,
  OAuthUserInfo,
} from "./providers/base.js";

// Re-export storage types
export type {
  KVStorage,
  StorageType,
  StorageConfig,
  RedisConfig,
  CloudflareKVConfig,
  DenoKVConfig,
  MemoryConfig,
} from "./storage/types.js";

// Re-export session types
export type {
  JwtConfig as JwtManagerConfig,
  TokenPair,
  KeyRotationResult,
  BlocklistConfig,
} from "./session/index.js";

export {
  JwtManager,
  JwtError,
  SessionBlocklist,
  TokenBlocklist,
  extractBearerToken,
  parseDuration,
} from "./session/index.js";

// ============================================
// AUTH CONFIG
// ============================================

export interface ParsAuthConfig {
  /**
   * Secret key for JWT signing (required)
   */
  secret: string;

  /**
   * Base URL for auth callbacks (e.g., https://app.example.com)
   */
  baseUrl: string;

  /**
   * Session configuration
   */
  session?: SessionConfig;

  /**
   * JWT configuration
   */
  jwt?: JwtConfig;

  /**
   * Cookie configuration
   */
  cookies?: CookieConfig;

  /**
   * CSRF protection configuration
   */
  csrf?: CsrfConfig;

  /**
   * Multi-tenancy configuration
   */
  tenant?: TenantConfig;

  /**
   * OAuth providers configuration
   */
  oauth?: OAuthProvidersConfig;

  /**
   * Email configuration for magic links, verification, etc.
   */
  email?: EmailConfig;

  /**
   * SMS configuration for OTP
   */
  sms?: SmsConfig;

  /**
   * Callbacks for customizing auth behavior
   */
  callbacks?: AuthCallbacks;

  /**
   * Database adapter
   */
  adapter: AuthAdapter;
}

export interface SessionConfig {
  /**
   * Session expiration in seconds (default: 7 days)
   */
  expiresIn?: number;

  /**
   * Whether to extend session on activity (default: true)
   */
  sliding?: boolean;

  /**
   * Maximum sessions per user (default: unlimited)
   */
  maxSessions?: number;

  /**
   * Whether to invalidate other sessions on password change (default: true)
   */
  invalidateOnPasswordChange?: boolean;
}

export interface JwtConfig {
  /**
   * Access token expiration in seconds (default: 15 minutes)
   */
  accessTokenExpiresIn?: number;

  /**
   * Refresh token expiration in seconds (default: 7 days)
   */
  refreshTokenExpiresIn?: number;

  /**
   * JWT issuer
   */
  issuer?: string;

  /**
   * JWT audience
   */
  audience?: string;

  /**
   * Algorithm for signing (default: HS256)
   */
  algorithm?: "HS256" | "HS384" | "HS512" | "RS256" | "RS384" | "RS512" | "ES256" | "ES384" | "ES512";
}

export interface CookieConfig {
  /**
   * Cookie name prefix (default: "pars")
   */
  prefix?: string;

  /**
   * Cookie domain
   */
  domain?: string;

  /**
   * Cookie path (default: "/")
   */
  path?: string;

  /**
   * Secure flag (default: true in production)
   */
  secure?: boolean;

  /**
   * SameSite attribute (default: "lax")
   */
  sameSite?: "strict" | "lax" | "none";

  /**
   * HttpOnly flag (default: true)
   */
  httpOnly?: boolean;
}

export interface CsrfConfig {
  /**
   * Enable CSRF protection (default: true)
   */
  enabled?: boolean;

  /**
   * CSRF token header name (default: "x-csrf-token")
   */
  headerName?: string;

  /**
   * CSRF cookie name (default: "csrf_token")
   */
  cookieName?: string;
}

export interface TenantConfig {
  /**
   * How to resolve tenant from request
   */
  resolve?: TenantResolver;

  /**
   * Whether to allow users without tenant membership (default: false)
   */
  allowNoTenant?: boolean;

  /**
   * Default tenant ID for new users
   */
  defaultTenantId?: string;

  /**
   * Whether to auto-create tenant on first user (default: false)
   */
  autoCreateTenant?: boolean;
}

export type TenantResolver =
  | { type: "subdomain" }
  | { type: "header"; headerName: string }
  | { type: "path"; paramName: string }
  | { type: "query"; paramName: string }
  | { type: "custom"; resolver: (request: Request) => Promise<string | null> };

export interface OAuthProvidersConfig {
  google?: OAuthProviderConfig;
  github?: OAuthProviderConfig;
  microsoft?: OAuthProviderConfig;
  apple?: OAuthProviderConfig;
  [key: string]: OAuthProviderConfig | undefined;
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  allowDangerousEmailAccountLinking?: boolean;
}

export interface EmailConfig {
  /**
   * Email sender function
   */
  send: (options: SendEmailOptions) => Promise<void>;

  /**
   * From email address
   */
  from: string;

  /**
   * Custom email templates
   */
  templates?: EmailTemplates;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplates {
  verifyEmail?: (params: { url: string; user: User }) => { subject: string; html: string };
  resetPassword?: (params: { url: string; user: User }) => { subject: string; html: string };
  magicLink?: (params: { url: string; expiresIn: number }) => { subject: string; html: string };
}

export interface SmsConfig {
  /**
   * SMS sender function
   */
  send: (options: SendSmsOptions) => Promise<void>;

  /**
   * OTP length (default: 6)
   */
  otpLength?: number;

  /**
   * OTP expiration in seconds (default: 300)
   */
  otpExpiresIn?: number;
}

export interface SendSmsOptions {
  to: string;
  message: string;
}

// ============================================
// AUTH CALLBACKS
// ============================================

export interface AuthCallbacks {
  /**
   * Called when a user signs up
   */
  onSignUp?: (user: User, tenant?: Tenant) => Promise<void>;

  /**
   * Called when a user signs in
   */
  onSignIn?: (user: User, session: Session) => Promise<void>;

  /**
   * Called when a user signs out
   */
  onSignOut?: (user: User, session: Session) => Promise<void>;

  /**
   * Called when a session is created
   */
  onSessionCreated?: (session: Session) => Promise<void>;

  /**
   * Called to validate if a user can sign in
   */
  validateSignIn?: (user: User, tenant?: Tenant) => Promise<boolean>;

  /**
   * Called to customize JWT claims
   */
  jwt?: (params: { token: JwtPayload; user: User; trigger: "signIn" | "signUp" | "update" }) => Promise<JwtPayload>;

  /**
   * Called to customize session data
   */
  session?: (params: { session: Session; user: User; token: JwtPayload }) => Promise<Session>;
}

// ============================================
// JWT TYPES
// ============================================

export interface JwtPayload {
  sub: string; // User ID
  tid?: string; // Tenant ID
  sid?: string; // Session ID
  email?: string;
  name?: string;
  role?: string;
  permissions?: string[];
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
  [key: string]: unknown;
}

// ============================================
// AUTH ADAPTER
// ============================================

export interface AuthAdapter {
  // User operations
  createUser(data: CreateUserInput): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, data: UpdateUserInput): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // Session operations
  createSession(data: CreateSessionInput): Promise<Session>;
  getSessionById(id: string): Promise<Session | null>;
  getSessionsByUserId(userId: string): Promise<Session[]>;
  updateSession(id: string, data: UpdateSessionInput): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  deleteSessionsByUserId(userId: string): Promise<void>;

  // Auth method operations
  createAuthMethod(data: CreateAuthMethodInput): Promise<AuthMethod>;
  getAuthMethod(provider: string, providerId: string): Promise<AuthMethod | null>;
  getAuthMethodsByUserId(userId: string): Promise<AuthMethod[]>;
  updateAuthMethod(id: string, data: UpdateAuthMethodInput): Promise<AuthMethod>;
  deleteAuthMethod(id: string): Promise<void>;

  // Tenant operations
  getTenantById(id: string): Promise<Tenant | null>;
  getTenantBySlug(slug: string): Promise<Tenant | null>;

  // Membership operations
  getMembership(userId: string, tenantId: string): Promise<TenantMembership | null>;
  getMembershipsByUserId(userId: string): Promise<TenantMembership[]>;
  createMembership(data: CreateMembershipInput): Promise<TenantMembership>;
  updateMembership(id: string, data: UpdateMembershipInput): Promise<TenantMembership>;

  // Verification token operations
  createVerificationToken(data: CreateVerificationTokenInput): Promise<VerificationToken>;
  getVerificationToken(identifier: string, token: string): Promise<VerificationToken | null>;
  deleteVerificationToken(identifier: string, token: string): Promise<void>;
}

// ============================================
// ADAPTER INPUT TYPES
// ============================================

export interface CreateUserInput {
  email: string;
  emailVerified?: boolean;
  name?: string;
  avatarUrl?: string;
  passwordHash?: string;
}

export interface UpdateUserInput {
  email?: string;
  emailVerified?: boolean;
  name?: string;
  avatarUrl?: string;
  passwordHash?: string;
  twoFactorEnabled?: boolean;
}

export interface CreateSessionInput {
  userId: string;
  tenantId?: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface UpdateSessionInput {
  expiresAt?: Date;
  lastActiveAt?: Date;
}

export interface AuthMethod {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  providerAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAuthMethodInput {
  userId: string;
  provider: string;
  providerId: string;
  providerAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface UpdateAuthMethodInput {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface CreateMembershipInput {
  userId: string;
  tenantId: string;
  roleId?: string;
  permissions?: Record<string, string[]>;
  accessLevel?: string;
  invitedBy?: string;
}

export interface UpdateMembershipInput {
  roleId?: string;
  permissions?: Record<string, string[]>;
  accessLevel?: string;
  status?: string;
}

export interface VerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}

export interface CreateVerificationTokenInput {
  identifier: string;
  token: string;
  expires: Date;
}

// ============================================
// AUTH RESULT TYPES
// ============================================

export interface SignUpResult {
  user: User;
  session?: Session;
  accessToken?: string;
  refreshToken?: string;
  requiresVerification?: boolean;
}

export interface SignInResult {
  user: User;
  session: Session;
  accessToken: string;
  refreshToken: string;
  requiresTwoFactor?: boolean;
  twoFactorChallengeId?: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}
