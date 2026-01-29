/**
 * Pars Auth Engine
 * Main orchestrator for authentication
 */

import type { KVStorage } from '../storage/types.js';
import type {
  ParsAuthConfig,
  AuthAdapter,
  AdapterUser,
  AdapterSession,
  AdapterMembership,
  AdapterTenant,
  AuthCallbacks,
} from '../config.js';
import { mergeConfig, validateConfig } from '../config.js';
import { createStorage } from '../storage/index.js';
import { ProviderRegistry, type ProviderInfo } from '../providers/index.js';
import { OTPProvider, type RequestOTPInput, type RequestOTPResult } from '../providers/otp/index.js';
import { PasswordProvider } from '../providers/password/index.js';
import { MagicLinkProvider } from '../providers/magic-link/index.js';
import { TOTPProvider } from '../providers/totp/index.js';
import { WebAuthnProvider } from '../providers/webauthn/index.js';
import { OAuthManager, type OAuthConfig } from '../providers/oauth/index.js';
import {
  JwtManager,
  SessionBlocklist,
  type TokenPair,
  type JwtPayload,
} from '../session/index.js';
import { TenantManager, createTenantManager } from './tenant-manager.js';
import { TenantResolver, createTenantResolver, type TenantResolutionResult } from './tenant-resolver.js';
import { InvitationService, createInvitationService, type SendInvitationResult, type AcceptInvitationResult } from './invitation.js';

/**
 * Auth context passed to handlers
 */
export interface AuthContext {
  userId?: string;
  sessionId?: string;
  tenantId?: string;
  payload?: JwtPayload;
}

/**
 * Sign in input
 */
export interface SignInInput {
  /** Provider name (e.g., 'otp', 'password', 'google') */
  provider: string;
  /** Identifier (email, phone, etc.) */
  identifier: string;
  /** Credential (OTP code, password, etc.) */
  credential?: string;
  /** Provider-specific data */
  data?: Record<string, unknown>;
  /** Request metadata */
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    deviceType?: string;
    deviceName?: string;
    tenantId?: string;
  };
}

/**
 * Sign in result
 */
export interface SignInResult {
  success: boolean;
  user?: AdapterUser;
  session?: AdapterSession;
  tokens?: TokenPair;
  requiresTwoFactor?: boolean;
  twoFactorChallengeId?: string;
  // OAuth için yeni alanlar
  requiresRedirect?: boolean;
  redirectUrl?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Sign up input
 */
export interface SignUpInput {
  /** Email address */
  email?: string;
  /** Phone number */
  phone?: string;
  /** Display name */
  name?: string;
  /** Avatar URL */
  avatar?: string;
  /** Whether the auth method should be marked as verified (default: false) */
  verified?: boolean;
  /** Request metadata */
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    tenantId?: string;
  };
}

/**
 * Sign up result
 */
export interface SignUpResult {
  success: boolean;
  user?: AdapterUser;
  session?: AdapterSession;
  tokens?: TokenPair;
  requiresVerification?: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Verify token result
 */
export interface VerifyTokenResult {
  valid: boolean;
  payload?: JwtPayload;
  error?: string;
}

/**
 * Refresh token result
 */
export interface RefreshTokenResult {
  success: boolean;
  tokens?: TokenPair;
  error?: string;
}

/**
 * Session info
 */
export interface SessionInfo {
  id: string;
  userId: string;
  tenantId?: string;
  deviceType?: string;
  deviceName?: string;
  ipAddress?: string;
  createdAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

/**
 * Pars Auth Engine
 */
export class ParsAuthEngine {
  private config: Required<ParsAuthConfig>;
  private storage!: KVStorage;
  private providers: ProviderRegistry;
  private jwtManager: JwtManager;
  private sessionBlocklist!: SessionBlocklist;
  private adapter: AuthAdapter;
  private callbacks: AuthCallbacks;
  private initialized = false;

  // Multi-tenant components
  private tenantManager!: TenantManager;
  private tenantResolver?: TenantResolver;
  private invitationService?: InvitationService;

  // OAuth manager
  private oauthManager?: OAuthManager;

  constructor(config: ParsAuthConfig) {
    // Validate and merge config
    validateConfig(config);
    this.config = mergeConfig(config);

    this.adapter = config.adapter;
    this.callbacks = config.callbacks ?? {};

    // Initialize provider registry
    this.providers = new ProviderRegistry();

    // Initialize JWT manager
    const sessionConfig = this.config.session;
    const jwtIssuer = this.config.jwt.issuer;
    const issuer = Array.isArray(jwtIssuer) ? jwtIssuer[0] ?? 'pars-auth' : jwtIssuer ?? 'pars-auth';
    const jwtAudience = this.config.jwt.audience;
    const audience = Array.isArray(jwtAudience) ? jwtAudience[0] ?? 'pars-client' : jwtAudience ?? 'pars-client';
    this.jwtManager = new JwtManager({
      secret: this.config.secret,
      issuer,
      audience,
      accessTokenTTL: `${sessionConfig.accessTokenExpiry}s`,
      refreshTokenTTL: `${sessionConfig.refreshTokenExpiry}s`,
    });
  }

  /**
   * Initialize the auth engine (async operations)
   * Must be called before using the engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize storage
    this.storage = await createStorage(this.config.storage);

    // Initialize blocklist
    this.sessionBlocklist = new SessionBlocklist(this.storage);

    // Register OTP provider if enabled
    if (this.config.providers.otp?.enabled !== false) {
      const otpProvider = new OTPProvider(this.storage, this.config.providers.otp!);
      this.providers.register(otpProvider);
    }

    // === PASSWORD PROVIDER ===
    if (this.config.providers.password?.enabled) {
      const passwordProvider = new PasswordProvider(this.storage, this.config.providers.password);
      passwordProvider.enable();
      this.providers.register(passwordProvider);
    }

    // === MAGIC LINK PROVIDER ===
    if (this.config.providers.magicLink?.enabled !== false && this.config.providers.magicLink?.send) {
      const magicLinkProvider = new MagicLinkProvider(this.storage, {
        baseUrl: this.config.baseUrl,
        ...this.config.providers.magicLink,
      });
      this.providers.register(magicLinkProvider);
    }

    // === TOTP PROVIDER (2FA) ===
    if (this.config.providers.totp?.enabled && this.config.providers.totp?.issuer) {
      const totpProvider = new TOTPProvider(this.storage, {
        issuer: this.config.providers.totp.issuer,
        ...this.config.providers.totp,
      });
      this.providers.register(totpProvider);
    }

    // === WEBAUTHN PROVIDER ===
    const webauthnConfig = this.config.providers.webauthn;
    if (webauthnConfig?.enabled && webauthnConfig.rpName && webauthnConfig.rpId) {
      const webauthnProvider = new WebAuthnProvider(this.storage, {
        ...webauthnConfig,
        rpName: webauthnConfig.rpName,
        rpId: webauthnConfig.rpId,
        origin: this.config.baseUrl || `https://${webauthnConfig.rpId}`,
      });
      this.providers.register(webauthnProvider);
    }

    // === OAUTH MANAGER ===
    if (this.config.providers.oauth) {
      const hasAnyOAuth =
        this.config.providers.oauth.google?.clientId ||
        this.config.providers.oauth.github?.clientId ||
        this.config.providers.oauth.microsoft?.clientId ||
        this.config.providers.oauth.apple?.clientId;

      if (hasAnyOAuth) {
        // Convert config format: ParsAuthConfig uses callbackUrl, OAuth providers use redirectUri
        const oauthConfig: OAuthConfig = {};
        const configOAuth = this.config.providers.oauth;

        if (configOAuth.google?.clientId && configOAuth.google?.clientSecret) {
          oauthConfig.google = {
            clientId: configOAuth.google.clientId,
            clientSecret: configOAuth.google.clientSecret,
            redirectUri: configOAuth.google.callbackUrl ?? `${this.config.baseUrl}/auth/callback/google`,
            scopes: configOAuth.google.scopes,
          };
        }

        if (configOAuth.github?.clientId && configOAuth.github?.clientSecret) {
          oauthConfig.github = {
            clientId: configOAuth.github.clientId,
            clientSecret: configOAuth.github.clientSecret,
            redirectUri: configOAuth.github.callbackUrl ?? `${this.config.baseUrl}/auth/callback/github`,
            scopes: configOAuth.github.scopes,
          };
        }

        if (configOAuth.microsoft?.clientId && configOAuth.microsoft?.clientSecret) {
          oauthConfig.microsoft = {
            clientId: configOAuth.microsoft.clientId,
            clientSecret: configOAuth.microsoft.clientSecret,
            redirectUri: configOAuth.microsoft.callbackUrl ?? `${this.config.baseUrl}/auth/callback/microsoft`,
            scopes: configOAuth.microsoft.scopes,
          };
        }

        if (configOAuth.apple?.clientId && configOAuth.apple?.clientSecret) {
          // Apple OAuth requires additional properties, but we'll pass what we have
          // Users need to provide full Apple config if they want Apple Sign-In
          const appleConfig = configOAuth.apple as unknown as {
            clientId: string;
            clientSecret: string;
            callbackUrl?: string;
            scopes?: string[];
            teamId?: string;
            keyId?: string;
          };
          oauthConfig.apple = {
            clientId: appleConfig.clientId,
            teamId: appleConfig.teamId ?? '',
            keyId: appleConfig.keyId ?? '',
            privateKey: appleConfig.clientSecret,
            redirectUri: appleConfig.callbackUrl ?? `${this.config.baseUrl}/auth/callback/apple`,
            scopes: appleConfig.scopes,
          };
        }

        this.oauthManager = new OAuthManager(this.storage, oauthConfig);
      }
    }

    // Initialize multi-tenant components
    this.tenantManager = createTenantManager(this.adapter);

    // Initialize tenant resolver if tenant config is provided
    if (this.config.tenant?.enabled !== false) {
      this.tenantResolver = createTenantResolver({
        strategy: this.config.tenant.strategy ?? 'header',
        headerName: this.config.tenant.headerName ?? 'x-tenant-id',
      });
    }

    // Initialize invitation service if baseUrl is provided
    if (this.config.baseUrl) {
      this.invitationService = createInvitationService(
        this.storage,
        this.adapter,
        { baseUrl: this.config.baseUrl }
      );
    }

    this.initialized = true;
  }

  /**
   * Ensure engine is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('[Pars Auth] Engine not initialized. Call initialize() first.');
    }
  }

  /**
   * Get all registered providers
   */
  getProviders(): ProviderInfo[] {
    return this.providers.getEnabled().map((p) => p.getInfo());
  }

  /**
   * Check if a provider is enabled
   */
  isProviderEnabled(name: string): boolean {
    const provider = this.providers.get(name);
    return provider?.enabled ?? false;
  }

  /**
   * Request OTP (for OTP provider)
   */
  async requestOTP(input: RequestOTPInput): Promise<RequestOTPResult> {
    this.ensureInitialized();

    const otpProvider = this.providers.get('otp') as OTPProvider | undefined;
    if (!otpProvider) {
      return {
        success: false,
        error: 'OTP provider not enabled',
      };
    }

    return otpProvider.requestOTP(input);
  }

  /**
   * Sign in with any provider
   */
  async signIn(input: SignInInput): Promise<SignInResult> {
    this.ensureInitialized();

    const { provider: providerName, identifier, credential, data, metadata } = input;

    // Handle OAuth providers
    const oauthProviders = ['google', 'github', 'microsoft', 'apple'];
    if (oauthProviders.includes(providerName)) {
      if (!this.oauthManager?.hasProvider(providerName)) {
        return {
          success: false,
          error: `OAuth provider '${providerName}' not configured`,
          errorCode: 'PROVIDER_NOT_CONFIGURED',
        };
      }

      // Start OAuth flow - return redirect URL
      const flow = await this.oauthManager.startFlow(providerName as 'google' | 'github' | 'microsoft' | 'apple', {
        tenantId: metadata?.tenantId,
        redirectUrl: data?.['redirectUrl'] as string,
      });

      return {
        success: true,
        requiresRedirect: true,
        redirectUrl: flow.authorizationUrl,
      };
    }

    // Get provider
    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        success: false,
        error: `Provider '${providerName}' not found`,
        errorCode: 'PROVIDER_NOT_FOUND',
      };
    }

    if (!provider.enabled) {
      return {
        success: false,
        error: `Provider '${providerName}' is not enabled`,
        errorCode: 'PROVIDER_DISABLED',
      };
    }

    // Authenticate with provider
    const authResult = await provider.authenticate({
      identifier,
      credential: credential ?? '',
      data,
    });

    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
        errorCode: authResult.errorCode,
      };
    }

    // Find or create user
    let user = await this.findUserByIdentifier(identifier, providerName);

    if (!user) {
      // Auto-create user if verified via OTP
      // OTP verification counts as identity verification, so mark auth method as verified
      if (providerName === 'otp') {
        const otpType = data?.['type'] as 'email' | 'sms' | undefined;
        const createResult = await this.signUp({
          email: otpType === 'email' || !otpType ? identifier : undefined,
          phone: otpType === 'sms' ? identifier : undefined,
          verified: true, // OTP verification proves identity ownership
          metadata,
        });

        if (!createResult.success) {
          return {
            success: false,
            error: createResult.error,
            errorCode: createResult.errorCode,
          };
        }

        user = createResult.user!;
      } else {
        return {
          success: false,
          error: 'User not found',
          errorCode: 'USER_NOT_FOUND',
        };
      }
    }

    // Validate sign in via callback
    if (this.callbacks.validateSignIn) {
      const allowed = await this.callbacks.validateSignIn(user);
      if (!allowed) {
        return {
          success: false,
          error: 'Sign in not allowed',
          errorCode: 'SIGN_IN_REJECTED',
        };
      }
    }

    // Check if 2FA is required
    if (user.twoFactorEnabled && providerName !== 'totp') {
      // TODO: Implement 2FA challenge flow
      return {
        success: true,
        user,
        requiresTwoFactor: true,
        twoFactorChallengeId: '', // Generate challenge ID
      };
    }

    // Create session
    const session = await this.createSession(user.id, metadata);
    if (!session) {
      return {
        success: false,
        error: 'Failed to create session',
        errorCode: 'SESSION_CREATE_FAILED',
      };
    }

    // Generate tokens
    const tokens = await this.jwtManager.generateTokenPair({
      userId: user.id,
      tenantId: metadata?.tenantId,
      sessionId: session.id,
    });

    // Call callback
    if (this.callbacks.onSignIn) {
      await this.callbacks.onSignIn(user, session);
    }

    return {
      success: true,
      user,
      session,
      tokens,
    };
  }

  /**
   * Sign up a new user
   */
  async signUp(input: SignUpInput): Promise<SignUpResult> {
    this.ensureInitialized();

    const { email, phone, name, avatar, verified = false, metadata } = input;

    if (!email && !phone) {
      return {
        success: false,
        error: 'Email or phone is required',
        errorCode: 'INVALID_INPUT',
      };
    }

    // Check if user already exists
    if (email) {
      const existing = await this.adapter.findUserByEmail(email);
      if (existing) {
        return {
          success: false,
          error: 'User with this email already exists',
          errorCode: 'USER_EXISTS',
        };
      }
    }

    if (phone) {
      const existing = await this.adapter.findUserByPhone(phone);
      if (existing) {
        return {
          success: false,
          error: 'User with this phone already exists',
          errorCode: 'USER_EXISTS',
        };
      }
    }

    // Create user with auth method
    // Verification status is tracked on the auth method, not the user
    const user = await this.adapter.createUser({
      email,
      phone,
      name,
      avatar,
      verified, // Passed to auth method creation
    });

    // Create session
    const session = await this.createSession(user.id, metadata);

    // Generate tokens
    const tokens = session
      ? await this.jwtManager.generateTokenPair({
          userId: user.id,
          tenantId: metadata?.tenantId,
          sessionId: session.id,
        })
      : undefined;

    // Call callback
    if (this.callbacks.onSignUp) {
      await this.callbacks.onSignUp(user);
    }

    return {
      success: true,
      user,
      session: session ?? undefined,
      tokens,
    };
  }

  /**
   * Sign out (revoke session)
   */
  async signOut(
    sessionId: string,
    options?: { revokeAll?: boolean; userId?: string }
  ): Promise<void> {
    this.ensureInitialized();

    if (options?.revokeAll && options?.userId) {
      // Revoke all sessions for user
      const sessions = await this.adapter.findSessionsByUserId(options.userId);
      await this.adapter.deleteSessionsByUserId(options.userId);

      // Add all to blocklist
      const tokenExpiry = new Date(
        Date.now() + this.config.session.refreshTokenExpiry! * 1000
      );
      await this.sessionBlocklist.blockAllUserSessions(
        options.userId,
        sessions.map((s) => s.id),
        tokenExpiry,
        'Sign out all'
      );

      // Call callback for each
      if (this.callbacks.onSignOut) {
        for (const session of sessions) {
          await this.callbacks.onSignOut(options.userId, session.id);
        }
      }
    } else {
      // Revoke single session
      const session = await this.adapter.findSessionById(sessionId);
      if (session) {
        await this.adapter.deleteSession(sessionId);

        // Add to blocklist until refresh token expires
        const tokenExpiry = new Date(
          Date.now() + this.config.session.refreshTokenExpiry! * 1000
        );
        await this.sessionBlocklist.blockSession(sessionId, tokenExpiry, {
          reason: 'Sign out',
          userId: session.userId,
        });

        // Call callback
        if (this.callbacks.onSignOut) {
          await this.callbacks.onSignOut(session.userId, sessionId);
        }
      }
    }
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token: string): Promise<VerifyTokenResult> {
    this.ensureInitialized();

    try {
      const payload = await this.jwtManager.verifyAccessToken(token);

      // Check if session is blocked
      if (payload.sid) {
        const isBlocked = await this.sessionBlocklist.isBlocked(payload.sid);
        if (isBlocked) {
          return {
            valid: false,
            error: 'Session has been revoked',
          };
        }
      }

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid token',
      };
    }
  }

  /**
   * Refresh tokens
   */
  async refreshTokens(refreshToken: string): Promise<RefreshTokenResult> {
    this.ensureInitialized();

    try {
      // Verify refresh token
      const { userId, sessionId, tenantId } =
        await this.jwtManager.verifyRefreshToken(refreshToken);

      // Check if session is blocked
      if (sessionId) {
        const isBlocked = await this.sessionBlocklist.isBlocked(sessionId);
        if (isBlocked) {
          return {
            success: false,
            error: 'Session has been revoked',
          };
        }
      }

      // Check if session exists and is active
      if (sessionId) {
        const session = await this.adapter.findSessionById(sessionId);
        if (!session || session.status !== 'active') {
          return {
            success: false,
            error: 'Session not found or inactive',
          };
        }

        // Update session if sliding window is enabled
        if (this.config.session.slidingWindow) {
          const newExpiresAt = new Date(
            Date.now() + this.config.session.refreshTokenExpiry! * 1000
          );
          await this.adapter.updateSession(sessionId, {
            expiresAt: newExpiresAt,
          });
        }
      }

      // Generate new token pair
      const tokens = await this.jwtManager.generateTokenPair({
        userId,
        tenantId,
        sessionId,
      });

      return {
        success: true,
        tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid refresh token',
      };
    }
  }

  /**
   * Get user sessions
   */
  async getSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<SessionInfo[]> {
    this.ensureInitialized();

    const sessions = await this.adapter.findSessionsByUserId(userId);

    return sessions
      .filter((s) => s.status === 'active')
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        tenantId: s.tenantId ?? undefined,
        deviceType: s.deviceType ?? undefined,
        deviceName: s.deviceName ?? undefined,
        ipAddress: s.ipAddress ?? undefined,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: s.id === currentSessionId,
      }));
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.signOut(sessionId);
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.signOut('', { revokeAll: true, userId });
  }

  /**
   * Get the underlying storage instance
   */
  getStorage(): KVStorage {
    this.ensureInitialized();
    return this.storage;
  }

  /**
   * Get the JWT manager
   */
  getJwtManager(): JwtManager {
    return this.jwtManager;
  }

  /**
   * Get the database adapter
   */
  getAdapter(): AuthAdapter {
    return this.adapter;
  }

  /**
   * Get configuration
   */
  getConfig(): Required<ParsAuthConfig> {
    return this.config;
  }

  /**
   * Find user by identifier based on provider
   */
  private async findUserByIdentifier(
    identifier: string,
    provider: string
  ): Promise<AdapterUser | null> {
    switch (provider) {
      case 'otp':
        // Could be email or phone, try both
        const userByEmail = await this.adapter.findUserByEmail(identifier);
        if (userByEmail) return userByEmail;
        return this.adapter.findUserByPhone(identifier);

      case 'password':
        return this.adapter.findUserByEmail(identifier);

      default:
        // For OAuth and others, look up by auth method
        const authMethod = await this.adapter.findAuthMethod(provider, identifier);
        if (authMethod) {
          return this.adapter.findUserById(authMethod.userId);
        }
        return null;
    }
  }

  /**
   * Create a new session
   */
  private async createSession(
    userId: string,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      deviceType?: string;
      deviceName?: string;
      tenantId?: string;
    }
  ): Promise<AdapterSession | null> {
    // Check max sessions limit
    const existingSessions = await this.adapter.findSessionsByUserId(userId);
    const activeSessions = existingSessions.filter((s) => s.status === 'active');

    if (activeSessions.length >= this.config.session.maxSessions!) {
      // Remove oldest session
      const oldest = activeSessions.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
      if (oldest) {
        await this.adapter.deleteSession(oldest.id);
        // Block the old session
        await this.sessionBlocklist.blockSession(
          oldest.id,
          new Date(Date.now() + this.config.session.refreshTokenExpiry! * 1000),
          { reason: 'Session limit reached', userId }
        );
      }
    }

    const expiresAt = new Date(
      Date.now() + this.config.session.accessTokenExpiry! * 1000
    );
    const refreshExpiresAt = new Date(
      Date.now() + this.config.session.refreshTokenExpiry! * 1000
    );

    const session = await this.adapter.createSession({
      userId,
      tenantId: metadata?.tenantId,
      expiresAt,
      refreshExpiresAt,
      deviceType: metadata?.deviceType,
      deviceName: metadata?.deviceName,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });

    // Call callback
    if (this.callbacks.onSessionCreated) {
      await this.callbacks.onSessionCreated({ id: session.id, userId });
    }

    return session;
  }

  // ============================================
  // MULTI-TENANT OPERATIONS
  // ============================================

  /**
   * Resolve tenant from request
   */
  async resolveTenant(request: Request): Promise<TenantResolutionResult> {
    this.ensureInitialized();

    if (!this.tenantResolver) {
      return { tenantId: null, resolvedFrom: null };
    }

    return this.tenantResolver.resolve(request);
  }

  /**
   * Switch current session to a different tenant
   */
  async switchTenant(
    sessionId: string,
    targetTenantId: string
  ): Promise<{ success: boolean; tokens?: TokenPair; error?: string }> {
    this.ensureInitialized();

    // Get current session
    const session = await this.adapter.findSessionById(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Validate tenant switch
    try {
      await this.tenantManager.validateTenantSwitch(session.userId, targetTenantId);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tenant switch not allowed',
      };
    }

    // Update session with new tenant
    await this.adapter.updateSession(sessionId, {
      tenantId: targetTenantId,
    });

    // Generate new tokens with new tenant context
    const tokens = await this.jwtManager.generateTokenPair({
      userId: session.userId,
      tenantId: targetTenantId,
      sessionId: session.id,
    });

    return { success: true, tokens };
  }

  /**
   * Get all tenants for current user
   */
  async getUserTenants(userId: string): Promise<Array<{
    tenant: AdapterTenant;
    membership: AdapterMembership;
  }>> {
    this.ensureInitialized();

    const memberships = await this.tenantManager.getUserTenants(userId);

    return memberships
      .filter((m) => m.tenant && m.status === 'active')
      .map((m) => ({
        tenant: m.tenant!,
        membership: m,
      }));
  }

  /**
   * Check if user is member of tenant
   */
  async isTenantMember(userId: string, tenantId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.tenantManager.isMember(userId, tenantId);
  }

  /**
   * Check if user has role in tenant
   */
  async hasRoleInTenant(
    userId: string,
    tenantId: string,
    role: string
  ): Promise<boolean> {
    this.ensureInitialized();
    return this.tenantManager.hasRole(userId, tenantId, role);
  }

  /**
   * Get user's membership in a tenant
   */
  async getTenantMembership(
    userId: string,
    tenantId: string
  ): Promise<AdapterMembership | null> {
    this.ensureInitialized();
    return this.tenantManager.getMembership(userId, tenantId);
  }

  /**
   * Add member to tenant
   */
  async addTenantMember(input: {
    userId: string;
    tenantId: string;
    role: string;
    permissions?: string[];
  }): Promise<AdapterMembership> {
    this.ensureInitialized();
    return this.tenantManager.addMember(input);
  }

  /**
   * Update member's role/permissions in tenant
   */
  async updateTenantMember(
    userId: string,
    tenantId: string,
    updates: { role?: string; permissions?: string[]; status?: 'active' | 'inactive' }
  ): Promise<AdapterMembership> {
    this.ensureInitialized();
    return this.tenantManager.updateMember(userId, tenantId, updates);
  }

  /**
   * Remove member from tenant
   */
  async removeTenantMember(userId: string, tenantId: string): Promise<void> {
    this.ensureInitialized();
    return this.tenantManager.removeMember(userId, tenantId);
  }

  /**
   * Send invitation to join tenant
   */
  async inviteToTenant(input: {
    email: string;
    tenantId: string;
    role: string;
    permissions?: string[];
    invitedBy: string;
    message?: string;
  }): Promise<SendInvitationResult> {
    this.ensureInitialized();

    if (!this.invitationService) {
      return { success: false, error: 'Invitation service not configured. Set baseUrl in config.' };
    }

    return this.invitationService.sendInvitation(input);
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(
    token: string,
    userId: string
  ): Promise<AcceptInvitationResult> {
    this.ensureInitialized();

    if (!this.invitationService) {
      return { success: false, error: 'Invitation service not configured' };
    }

    return this.invitationService.acceptInvitation({ token, userId });
  }

  /**
   * Check invitation status
   */
  async checkInvitation(token: string): Promise<{
    valid: boolean;
    tenantName?: string;
    role?: string;
    email?: string;
    error?: string;
  }> {
    this.ensureInitialized();

    if (!this.invitationService) {
      return { valid: false, error: 'Invitation service not configured' };
    }

    const result = await this.invitationService.checkInvitation(token);

    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    return {
      valid: true,
      tenantName: result.tenant?.name,
      role: result.invitation?.role,
      email: result.invitation?.email,
    };
  }

  /**
   * Get tenant manager instance
   */
  getTenantManager(): TenantManager {
    this.ensureInitialized();
    return this.tenantManager;
  }

  /**
   * Get invitation service instance
   */
  getInvitationService(): InvitationService | undefined {
    this.ensureInitialized();
    return this.invitationService;
  }

  /**
   * Get tenant resolver instance
   */
  getTenantResolver(): TenantResolver | undefined {
    return this.tenantResolver;
  }

  // ============================================
  // OAUTH OPERATIONS
  // ============================================

  /**
   * Handle OAuth callback after user authorization
   */
  async handleOAuthCallback(
    provider: 'google' | 'github' | 'microsoft' | 'apple',
    code: string,
    state: string,
    metadata?: SignInInput['metadata']
  ): Promise<SignInResult> {
    this.ensureInitialized();

    if (!this.oauthManager) {
      return {
        success: false,
        error: 'OAuth not configured',
        errorCode: 'OAUTH_NOT_CONFIGURED',
      };
    }

    try {
      const result = await this.oauthManager.handleCallback(provider, code, state);
      const { userInfo, tokens: oauthTokens } = result;

      // Find or create user by OAuth provider
      let user = await this.findUserByIdentifier(userInfo.id, provider);

      if (!user) {
        // Create new user from OAuth info
        const createResult = await this.signUp({
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.avatarUrl,
          verified: userInfo.emailVerified ?? false,
          metadata: { ...metadata, tenantId: result.tenantId },
        });

        if (!createResult.success) {
          return createResult;
        }
        user = createResult.user!;

        // Create auth method for OAuth
        await this.adapter.createAuthMethod({
          userId: user.id,
          provider,
          providerId: userInfo.id,
          verified: userInfo.emailVerified ?? false,
          metadata: {
            email: userInfo.email,
            accessToken: oauthTokens.accessToken,
            refreshToken: oauthTokens.refreshToken,
          },
        });
      }

      // Create session
      const session = await this.createSession(user.id, {
        ...metadata,
        tenantId: result.tenantId,
      });

      if (!session) {
        return {
          success: false,
          error: 'Failed to create session',
          errorCode: 'SESSION_CREATE_FAILED',
        };
      }

      const tokens = await this.jwtManager.generateTokenPair({
        userId: user.id,
        tenantId: result.tenantId,
        sessionId: session.id,
      });

      if (this.callbacks.onSignIn) {
        await this.callbacks.onSignIn(user, session);
      }

      return {
        success: true,
        user,
        session,
        tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth callback failed',
        errorCode: 'OAUTH_CALLBACK_FAILED',
      };
    }
  }

  // ============================================
  // PROVIDER GETTERS
  // ============================================

  /**
   * Get the OAuth manager
   */
  getOAuthManager(): OAuthManager | undefined {
    return this.oauthManager;
  }

  /**
   * Get TOTP provider for 2FA setup
   */
  getTOTPProvider(): TOTPProvider | undefined {
    return this.providers.get('totp') as TOTPProvider | undefined;
  }

  /**
   * Get WebAuthn provider for passkey management
   */
  getWebAuthnProvider(): WebAuthnProvider | undefined {
    return this.providers.get('webauthn') as WebAuthnProvider | undefined;
  }

  /**
   * Get Password provider
   */
  getPasswordProvider(): PasswordProvider | undefined {
    return this.providers.get('password') as PasswordProvider | undefined;
  }

  /**
   * Get Magic Link provider
   */
  getMagicLinkProvider(): MagicLinkProvider | undefined {
    return this.providers.get('magic-link') as MagicLinkProvider | undefined;
  }
}

/**
 * Create a Pars Auth Engine instance
 */
export function createAuthEngine(config: ParsAuthConfig): ParsAuthEngine {
  return new ParsAuthEngine(config);
}
