/**
 * OAuth Types
 */

export interface OAuthUserInfo {
  /** Provider-specific user ID */
  id: string;
  /** User email */
  email: string;
  /** Display name */
  name?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Whether email is verified */
  emailVerified: boolean;
  /** Raw provider response */
  raw: Record<string, unknown>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  idToken?: string;
  tokenType?: string;
  scope?: string;
}

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export interface GoogleConfig extends OAuthProviderConfig {}

export interface GitHubConfig extends OAuthProviderConfig {}

export interface MicrosoftConfig extends OAuthProviderConfig {
  tenantId?: string;
}

export interface AppleConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  redirectUri: string;
  scopes?: string[];
}

export interface OAuthProvider {
  readonly name: string;
  getAuthorizationUrl(state: string, codeChallenge?: string): Promise<string>;
  exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
  /**
   * Refresh access token using refresh token
   * Not all providers support refresh tokens
   */
  refreshToken?(refreshToken: string): Promise<OAuthTokens>;
}

export type OAuthProviderName = 'google' | 'github' | 'microsoft' | 'apple';

export interface OAuthState {
  state: string;
  provider: OAuthProviderName;
  codeVerifier?: string;
  tenantId?: string;
  redirectUrl?: string;
  expiresAt: Date;
}
