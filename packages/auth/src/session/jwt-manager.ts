/**
 * JWT Manager with Key Rotation Support
 * Uses jose library for multi-runtime compatibility (Node, Deno, CF Workers, Bun)
 */

import * as jose from 'jose';

/**
 * JWT configuration
 */
export interface JwtConfig {
  /** Secret key for signing tokens */
  secret: string;
  /** Token issuer */
  issuer: string;
  /** Token audience */
  audience: string;
  /** Access token TTL (e.g., '15m', '1h') */
  accessTokenTTL?: string;
  /** Refresh token TTL (e.g., '7d', '12h') */
  refreshTokenTTL?: string;
  /** Previous secrets for key rotation */
  previousSecrets?: string[];
  /** Current key version */
  keyVersion?: number;
}

/**
 * JWT payload structure
 */
export interface JwtPayload {
  /** User ID */
  sub: string;
  /** Tenant ID */
  tid?: string;
  /** Session ID */
  sid?: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** Issuer */
  iss: string;
  /** Audience */
  aud: string | string[];
  /** User roles */
  roles?: string[];
  /** User permissions */
  permissions?: string[];
  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Token pair (access + refresh)
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

/**
 * Key rotation result
 */
export interface KeyRotationResult {
  previousSecret: string;
  newSecret: string;
  keyVersion: number;
  rotatedAt: Date;
}

/**
 * Parse duration string to seconds
 * Supports: s (seconds), m (minutes), h (hours), d (days), w (weeks)
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like '15m', '1h', '7d'`);
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    case 'w':
      return value * 60 * 60 * 24 * 7;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Default JWT configuration
 */
const DEFAULT_CONFIG = {
  accessTokenTTL: '15m',
  refreshTokenTTL: '7d',
  keyVersion: 1,
};

/**
 * JWT Manager
 * Handles token generation, verification, and key rotation
 */
export class JwtManager {
  private secret: Uint8Array;
  private previousSecrets: Uint8Array[];
  private config: Required<JwtConfig>;
  private keyVersion: number;

  constructor(config: JwtConfig) {
    this.config = {
      accessTokenTTL: DEFAULT_CONFIG.accessTokenTTL,
      refreshTokenTTL: DEFAULT_CONFIG.refreshTokenTTL,
      previousSecrets: [],
      keyVersion: DEFAULT_CONFIG.keyVersion,
      ...config,
    } as Required<JwtConfig>;

    this.secret = new TextEncoder().encode(config.secret);
    this.keyVersion = this.config.keyVersion;
    this.previousSecrets = (this.config.previousSecrets).map(
      (s) => new TextEncoder().encode(s)
    );
  }

  /**
   * Get current key version
   */
  getKeyVersion(): number {
    return this.keyVersion;
  }

  /**
   * Rotate the signing key
   * Moves current secret to previousSecrets and sets new secret
   */
  rotateKey(
    newSecret: string,
    options?: { maxPreviousSecrets?: number }
  ): KeyRotationResult {
    const maxPrevious = options?.maxPreviousSecrets ?? 2;
    const previousSecret = this.config.secret;

    // Move current secret to previous secrets
    this.previousSecrets.unshift(this.secret);

    // Limit the number of previous secrets
    if (this.previousSecrets.length > maxPrevious) {
      this.previousSecrets = this.previousSecrets.slice(0, maxPrevious);
    }

    // Set new secret
    this.secret = new TextEncoder().encode(newSecret);
    this.config.secret = newSecret;
    this.keyVersion++;

    // Update config's previous secrets
    this.config.previousSecrets = [
      previousSecret,
      ...this.config.previousSecrets.slice(0, maxPrevious - 1),
    ];
    this.config.keyVersion = this.keyVersion;

    return {
      previousSecret,
      newSecret,
      keyVersion: this.keyVersion,
      rotatedAt: new Date(),
    };
  }

  /**
   * Get current configuration (for persistence)
   */
  getConfig(): JwtConfig {
    return { ...this.config };
  }

  /**
   * Generate access token
   */
  async generateAccessToken(payload: {
    userId: string;
    tenantId?: string;
    sessionId?: string;
    roles?: string[];
    permissions?: string[];
    claims?: Record<string, unknown>;
  }): Promise<{ token: string; expiresAt: Date }> {
    const ttlSeconds = parseDuration(this.config.accessTokenTTL);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const jwt = new jose.SignJWT({
      sub: payload.userId,
      ...(payload.tenantId && { tid: payload.tenantId }),
      ...(payload.sessionId && { sid: payload.sessionId }),
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      ...payload.claims,
    })
      .setProtectedHeader({ alg: 'HS256', kid: `v${this.keyVersion}` })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience);

    const token = await jwt.sign(this.secret);

    return { token, expiresAt };
  }

  /**
   * Generate refresh token
   */
  async generateRefreshToken(payload: {
    userId: string;
    tenantId?: string;
    sessionId?: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const ttlSeconds = parseDuration(this.config.refreshTokenTTL);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const jwt = new jose.SignJWT({
      sub: payload.userId,
      ...(payload.tenantId && { tid: payload.tenantId }),
      ...(payload.sessionId && { sid: payload.sessionId }),
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256', kid: `v${this.keyVersion}` })
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience);

    const token = await jwt.sign(this.secret);

    return { token, expiresAt };
  }

  /**
   * Generate token pair (access + refresh)
   */
  async generateTokenPair(payload: {
    userId: string;
    tenantId?: string;
    sessionId?: string;
    roles?: string[];
    permissions?: string[];
    claims?: Record<string, unknown>;
  }): Promise<TokenPair> {
    const [access, refresh] = await Promise.all([
      this.generateAccessToken(payload),
      this.generateRefreshToken(payload),
    ]);

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessExpiresAt: access.expiresAt,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  /**
   * Verify access token
   * Tries current secret first, then falls back to previous secrets for graceful rotation
   */
  async verifyAccessToken(token: string): Promise<JwtPayload> {
    const secrets = [this.secret, ...this.previousSecrets];

    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i];
      if (!secret) continue;

      try {
        const { payload } = await jose.jwtVerify(token, secret, {
          issuer: this.config.issuer,
          audience: this.config.audience,
        });

        // Return all claims including custom ones
        return {
          ...payload,
          sub: payload.sub as string,
          tid: payload['tid'] as string | undefined,
          sid: payload['sid'] as string | undefined,
          iat: payload.iat as number,
          exp: payload.exp as number,
          iss: payload.iss as string,
          aud: payload.aud as string | string[],
          roles: (payload['roles'] as string[]) ?? [],
          permissions: (payload['permissions'] as string[]) ?? [],
        };
      } catch (error) {
        // If it's an expiration error, don't try other secrets
        if (error instanceof jose.errors.JWTExpired) {
          throw new JwtError('Access token expired', 'TOKEN_EXPIRED');
        }
        // Try next secret on signature mismatch
        if (i === secrets.length - 1) {
          if (error instanceof jose.errors.JWTInvalid) {
            throw new JwtError('Invalid access token', 'INVALID_TOKEN');
          }
          throw new JwtError('Token verification failed', 'VERIFICATION_FAILED');
        }
      }
    }

    throw new JwtError('Token verification failed', 'VERIFICATION_FAILED');
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<{
    userId: string;
    tenantId?: string;
    sessionId?: string;
  }> {
    const secrets = [this.secret, ...this.previousSecrets];

    for (let i = 0; i < secrets.length; i++) {
      const secret = secrets[i];
      if (!secret) continue;

      try {
        const { payload } = await jose.jwtVerify(token, secret, {
          issuer: this.config.issuer,
          audience: this.config.audience,
        });

        if (payload['type'] !== 'refresh') {
          throw new JwtError('Invalid token type', 'INVALID_TOKEN_TYPE');
        }

        return {
          userId: payload.sub as string,
          tenantId: payload['tid'] as string | undefined,
          sessionId: payload['sid'] as string | undefined,
        };
      } catch (error) {
        if (error instanceof jose.errors.JWTExpired) {
          throw new JwtError('Refresh token expired', 'TOKEN_EXPIRED');
        }
        if (error instanceof JwtError) {
          throw error;
        }
        if (i === secrets.length - 1) {
          if (error instanceof jose.errors.JWTInvalid) {
            throw new JwtError('Invalid refresh token', 'INVALID_TOKEN');
          }
          throw new JwtError('Token verification failed', 'VERIFICATION_FAILED');
        }
      }
    }

    throw new JwtError('Token verification failed', 'VERIFICATION_FAILED');
  }

  /**
   * Decode token without verification (for inspection)
   */
  decodeToken(token: string): jose.JWTPayload | null {
    try {
      return jose.decodeJwt(token);
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired (without signature verification)
   */
  isTokenExpired(token: string): boolean {
    const payload = this.decodeToken(token);
    if (!payload?.exp) return true;
    return payload.exp * 1000 < Date.now();
  }

  /**
   * Get token expiration date (without signature verification)
   */
  getTokenExpiration(token: string): Date | null {
    const payload = this.decodeToken(token);
    if (!payload?.exp) return null;
    return new Date(payload.exp * 1000);
  }

  /**
   * Get time until token expires in seconds
   */
  getTokenTTL(token: string): number {
    const exp = this.getTokenExpiration(token);
    if (!exp) return 0;
    return Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
  }
}

/**
 * JWT Error class
 */
export class JwtError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TOKEN_EXPIRED'
      | 'INVALID_TOKEN'
      | 'INVALID_TOKEN_TYPE'
      | 'VERIFICATION_FAILED'
  ) {
    super(message);
    this.name = 'JwtError';
  }
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(
  authHeader: string | null | undefined
): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] ?? null;
}

/**
 * Create a JwtManager instance
 */
export function createJwtManager(config: JwtConfig): JwtManager {
  return new JwtManager(config);
}
