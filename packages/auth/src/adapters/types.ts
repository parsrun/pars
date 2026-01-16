/**
 * Adapter Types
 * Common interfaces for framework adapters
 */

import type { JwtPayload, TokenPair } from '../session/index.js';

/**
 * Auth context attached to requests
 */
export interface AuthContext {
  /** Authenticated user ID */
  userId: string;
  /** Session ID */
  sessionId?: string;
  /** Tenant ID (for multi-tenant) */
  tenantId?: string;
  /** User roles */
  roles?: string[];
  /** User permissions */
  permissions?: string[];
  /** Full JWT payload */
  payload: JwtPayload;
}

/**
 * Cookie options
 */
export interface CookieOptions {
  /** Cookie name */
  name: string;
  /** Cookie value */
  value: string;
  /** Max age in seconds */
  maxAge?: number;
  /** Expiration date */
  expires?: Date;
  /** Path */
  path?: string;
  /** Domain */
  domain?: string;
  /** Secure flag */
  secure?: boolean;
  /** HttpOnly flag */
  httpOnly?: boolean;
  /** SameSite attribute */
  sameSite?: 'strict' | 'lax' | 'none';
}

/**
 * Auth response with cookies
 */
export interface AuthResponse {
  success: boolean;
  tokens?: TokenPair;
  cookies?: CookieOptions[];
  error?: string;
  errorCode?: string;
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
}

/**
 * Request OTP input
 */
export interface RequestOtpBody {
  identifier: string;
  type: 'email' | 'sms';
}

/**
 * Verify OTP input
 */
export interface VerifyOtpBody {
  identifier: string;
  code: string;
  type?: 'email' | 'sms';
}

/**
 * Sign in input
 */
export interface SignInBody {
  provider: string;
  identifier: string;
  credential?: string;
  data?: Record<string, unknown>;
}

/**
 * Refresh token input
 */
export interface RefreshBody {
  refreshToken?: string;
}

/**
 * Create auth cookies from token pair
 */
export function createAuthCookies(
  tokens: TokenPair,
  config: {
    prefix?: string;
    path?: string;
    domain?: string;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    httpOnly?: boolean;
  }
): CookieOptions[] {
  const prefix = config.prefix ?? 'pars';

  return [
    {
      name: `${prefix}.access_token`,
      value: tokens.accessToken,
      expires: tokens.accessExpiresAt,
      path: config.path ?? '/',
      domain: config.domain,
      secure: config.secure ?? true,
      sameSite: config.sameSite ?? 'lax',
      httpOnly: false, // Access token may be needed by JS
    },
    {
      name: `${prefix}.refresh_token`,
      value: tokens.refreshToken,
      expires: tokens.refreshExpiresAt,
      path: config.path ?? '/',
      domain: config.domain,
      secure: config.secure ?? true,
      sameSite: config.sameSite ?? 'lax',
      httpOnly: config.httpOnly ?? true, // Refresh token should be HttpOnly
    },
  ];
}

/**
 * Create logout cookies (clear auth cookies)
 */
export function createLogoutCookies(
  config: {
    prefix?: string;
    path?: string;
    domain?: string;
  }
): CookieOptions[] {
  const prefix = config.prefix ?? 'pars';
  const past = new Date(0);

  return [
    {
      name: `${prefix}.access_token`,
      value: '',
      expires: past,
      path: config.path ?? '/',
      domain: config.domain,
    },
    {
      name: `${prefix}.refresh_token`,
      value: '',
      expires: past,
      path: config.path ?? '/',
      domain: config.domain,
    },
  ];
}
