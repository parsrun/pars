/**
 * GitHub OAuth Provider
 */

import type { OAuthProvider, OAuthUserInfo, OAuthTokens, GitHubConfig } from './types.js';

export class GitHubProvider implements OAuthProvider {
  readonly name = 'github';
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
  }

  async getAuthorizationUrl(state: string, _codeChallenge?: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes?.join(' ') ?? 'read:user user:email',
      state,
    });

    return `https://github.com/login/oauth/authorize?${params}`;
  }

  async exchangeCode(code: string, _codeVerifier?: string): Promise<OAuthTokens> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub token exchange failed: ${error}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (data['error']) {
      throw new Error(`GitHub OAuth error: ${data['error_description'] ?? data['error']}`);
    }

    return {
      accessToken: data['access_token'] as string,
      tokenType: data['token_type'] as string | undefined,
      scope: data['scope'] as string | undefined,
    };
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    // Get user profile
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch GitHub user info');
    }

    const userData = (await userResponse.json()) as Record<string, unknown>;

    // Get user emails (may need user:email scope)
    let email = userData['email'] as string | null;
    let emailVerified = false;

    if (!email) {
      try {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (emailsResponse.ok) {
          const emails = (await emailsResponse.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;

          const primaryEmail = emails.find((e) => e.primary && e.verified);
          if (primaryEmail) {
            email = primaryEmail.email;
            emailVerified = primaryEmail.verified;
          }
        }
      } catch {
        // Email fetch failed, continue without
      }
    }

    return {
      id: String(userData['id']),
      email: email ?? '',
      name: (userData['name'] as string) ?? (userData['login'] as string),
      avatarUrl: userData['avatar_url'] as string | undefined,
      emailVerified,
      raw: userData,
    };
  }
}
