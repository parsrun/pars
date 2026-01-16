/**
 * Microsoft OAuth Provider
 */

import type { OAuthProvider, OAuthUserInfo, OAuthTokens, MicrosoftConfig } from './types.js';

export class MicrosoftProvider implements OAuthProvider {
  readonly name = 'microsoft';
  private config: MicrosoftConfig;
  private baseUrl: string;

  constructor(config: MicrosoftConfig) {
    this.config = config;
    // Use tenant-specific or common endpoint
    const tenant = config.tenantId ?? 'common';
    this.baseUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
  }

  async getAuthorizationUrl(state: string, codeChallenge?: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes?.join(' ') ?? 'openid email profile User.Read',
      state,
      response_mode: 'query',
    });

    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${this.baseUrl}/authorize?${params}`;
  }

  async exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    const params: Record<string, string> = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    };

    if (codeVerifier) {
      params['code_verifier'] = codeVerifier;
    }

    const response = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft token exchange failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data['access_token'] as string,
      refreshToken: data['refresh_token'] as string | undefined,
      expiresIn: data['expires_in'] as number | undefined,
      idToken: data['id_token'] as string | undefined,
      tokenType: data['token_type'] as string | undefined,
      scope: data['scope'] as string | undefined,
    };
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Microsoft user info');
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      id: data['id'] as string,
      email: (data['mail'] as string) ?? (data['userPrincipalName'] as string),
      name: data['displayName'] as string | undefined,
      avatarUrl: undefined, // Would need separate call to get photo
      emailVerified: true, // Microsoft accounts are verified
      raw: data,
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: this.config.scopes?.join(' ') ?? 'openid email profile User.Read',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Microsoft token refresh failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data['access_token'] as string,
      refreshToken: (data['refresh_token'] as string | undefined) ?? refreshToken,
      expiresIn: data['expires_in'] as number | undefined,
      idToken: data['id_token'] as string | undefined,
      tokenType: data['token_type'] as string | undefined,
      scope: data['scope'] as string | undefined,
    };
  }
}
