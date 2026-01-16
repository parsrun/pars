/**
 * Google OAuth Provider
 */

import type { OAuthProvider, OAuthUserInfo, OAuthTokens, GoogleConfig } from './types.js';

export class GoogleProvider implements OAuthProvider {
  readonly name = 'google';
  private config: GoogleConfig;

  constructor(config: GoogleConfig) {
    this.config = config;
  }

  async getAuthorizationUrl(state: string, codeChallenge?: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes?.join(' ') ?? 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
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

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token exchange failed: ${error}`);
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
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Google user info');
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      id: data['sub'] as string,
      email: data['email'] as string,
      name: data['name'] as string | undefined,
      avatarUrl: data['picture'] as string | undefined,
      emailVerified: (data['email_verified'] as boolean) ?? false,
      raw: data,
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google token refresh failed: ${error}`);
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
