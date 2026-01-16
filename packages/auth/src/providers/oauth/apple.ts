/**
 * Apple OAuth Provider
 * Uses Sign in with Apple
 */

import type { OAuthProvider, OAuthUserInfo, OAuthTokens, AppleConfig } from './types.js';

export class AppleProvider implements OAuthProvider {
  readonly name = 'apple';
  private config: AppleConfig;

  constructor(config: AppleConfig) {
    this.config = config;
  }

  async getAuthorizationUrl(state: string, _codeChallenge?: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code id_token',
      response_mode: 'form_post',
      scope: this.config.scopes?.join(' ') ?? 'name email',
      state,
    });

    return `https://appleid.apple.com/auth/authorize?${params}`;
  }

  async exchangeCode(code: string, _codeVerifier?: string): Promise<OAuthTokens> {
    const clientSecret = await this.generateClientSecret();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.redirectUri,
    });

    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Apple token exchange failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      accessToken: data['access_token'] as string,
      refreshToken: data['refresh_token'] as string | undefined,
      expiresIn: data['expires_in'] as number | undefined,
      idToken: data['id_token'] as string | undefined,
      tokenType: data['token_type'] as string | undefined,
    };
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    // Apple doesn't have a userinfo endpoint
    // User info is in the id_token which should be decoded
    // For now, we'll just return a minimal response
    // In practice, the id_token should be passed and decoded

    // This is a placeholder - real implementation should decode the id_token
    return {
      id: '',
      email: '',
      emailVerified: false,
      raw: { accessToken },
    };
  }

  /**
   * Parse user info from id_token and form post data
   * Apple sends user info only on first authorization
   */
  parseUserFromCallback(
    idToken: string,
    userData?: { name?: { firstName?: string; lastName?: string }; email?: string }
  ): OAuthUserInfo {
    // Decode JWT payload (without verification - should be done server-side)
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid id_token format');
    }

    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf-8')
    ) as Record<string, unknown>;

    const name = userData?.name
      ? [userData.name.firstName, userData.name.lastName].filter(Boolean).join(' ')
      : undefined;

    return {
      id: payload['sub'] as string,
      email: (userData?.email ?? payload['email']) as string,
      name,
      emailVerified: payload['email_verified'] === 'true' || payload['email_verified'] === true,
      raw: payload,
    };
  }

  /**
   * Generate client secret JWT for Apple
   * Apple requires a JWT signed with your private key
   */
  private async generateClientSecret(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 86400 * 180; // 180 days

    const header = {
      alg: 'ES256',
      kid: this.config.keyId,
      typ: 'JWT',
    };

    const payload = {
      iss: this.config.teamId,
      iat: now,
      exp: expiry,
      aud: 'https://appleid.apple.com',
      sub: this.config.clientId,
    };

    // Import the private key
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      this.pemToArrayBuffer(this.config.privateKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    // Create JWT
    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(signingInput)
    );

    const signatureB64 = this.base64UrlEncode(
      String.fromCharCode(...new Uint8Array(signature))
    );

    return `${signingInput}.${signatureB64}`;
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const pemContents = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');

    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private base64UrlEncode(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
