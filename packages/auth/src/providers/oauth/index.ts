/**
 * OAuth Provider
 * Manages OAuth2 authentication flows with PKCE support
 */

import type { KVStorage } from '../../storage/types.js';
import type {
  OAuthProvider,
  OAuthProviderName,
  OAuthUserInfo,
  OAuthTokens,
  OAuthState,
  GoogleConfig,
  GitHubConfig,
  MicrosoftConfig,
  AppleConfig,
} from './types.js';
import { GoogleProvider } from './google.js';
import { GitHubProvider } from './github.js';
import { MicrosoftProvider } from './microsoft.js';
import { AppleProvider } from './apple.js';

// Re-export types and providers
export * from './types.js';
export { GoogleProvider } from './google.js';
export { GitHubProvider } from './github.js';
export { MicrosoftProvider } from './microsoft.js';
export { AppleProvider } from './apple.js';

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  google?: GoogleConfig;
  github?: GitHubConfig;
  microsoft?: MicrosoftConfig;
  apple?: AppleConfig;
}

/**
 * OAuth flow result
 */
export interface OAuthFlowResult {
  authorizationUrl: string;
  state: string;
}

/**
 * OAuth callback result
 */
export interface OAuthCallbackResult {
  userInfo: OAuthUserInfo;
  tokens: OAuthTokens;
  tenantId?: string;
  redirectUrl?: string;
}

/**
 * Generate PKCE code verifier and challenge
 */
export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { codeVerifier, codeChallenge };
}

/**
 * Generate secure random state
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * OAuth Manager
 * Handles OAuth flows with state management via KVStorage
 */
export class OAuthManager {
  private storage: KVStorage;
  private providers: Map<string, OAuthProvider> = new Map();
  private stateExpirySeconds: number;

  constructor(
    storage: KVStorage,
    config: OAuthConfig,
    options?: { stateExpirySeconds?: number }
  ) {
    this.storage = storage;
    this.stateExpirySeconds = options?.stateExpirySeconds ?? 600; // 10 minutes

    // Initialize configured providers
    if (config.google) {
      this.providers.set('google', new GoogleProvider(config.google));
    }
    if (config.github) {
      this.providers.set('github', new GitHubProvider(config.github));
    }
    if (config.microsoft) {
      this.providers.set('microsoft', new MicrosoftProvider(config.microsoft));
    }
    if (config.apple) {
      this.providers.set('apple', new AppleProvider(config.apple));
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): OAuthProviderName[] {
    return Array.from(this.providers.keys()) as OAuthProviderName[];
  }

  /**
   * Check if a provider is configured
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get a provider by name
   */
  getProvider(name: string): OAuthProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Start OAuth flow - returns authorization URL
   */
  async startFlow(
    providerName: OAuthProviderName,
    options?: { tenantId?: string; redirectUrl?: string }
  ): Promise<OAuthFlowResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`OAuth provider '${providerName}' not configured`);
    }

    const state = generateState();
    const { codeVerifier, codeChallenge } = await generatePKCE();

    // Store state
    const stateData: OAuthState = {
      state,
      provider: providerName,
      codeVerifier,
      tenantId: options?.tenantId,
      redirectUrl: options?.redirectUrl,
      expiresAt: new Date(Date.now() + this.stateExpirySeconds * 1000),
    };

    await this.storage.set(
      `oauth:state:${state}`,
      stateData,
      this.stateExpirySeconds
    );

    const authorizationUrl = await provider.getAuthorizationUrl(state, codeChallenge);

    return { authorizationUrl, state };
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(
    providerName: OAuthProviderName,
    code: string,
    state: string
  ): Promise<OAuthCallbackResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`OAuth provider '${providerName}' not configured`);
    }

    // Retrieve and validate state
    const storedState = await this.storage.get<OAuthState>(`oauth:state:${state}`);

    if (!storedState) {
      throw new Error('Invalid OAuth state');
    }

    if (storedState.expiresAt < new Date()) {
      await this.storage.delete(`oauth:state:${state}`);
      throw new Error('OAuth state expired');
    }

    if (storedState.provider !== providerName) {
      throw new Error('Provider mismatch');
    }

    // Exchange code for tokens
    const tokens = await provider.exchangeCode(code, storedState.codeVerifier);

    // Get user info
    const userInfo = await provider.getUserInfo(tokens.accessToken);

    // Clean up used state
    await this.storage.delete(`oauth:state:${state}`);

    return {
      userInfo,
      tokens,
      tenantId: storedState.tenantId,
      redirectUrl: storedState.redirectUrl,
    };
  }

  /**
   * Refresh OAuth tokens (if supported by provider)
   */
  async refreshTokens(
    providerName: OAuthProviderName,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`OAuth provider '${providerName}' not configured`);
    }

    // Check if provider supports token refresh
    if (!provider.refreshToken) {
      throw new Error(`Token refresh not supported for ${providerName}`);
    }

    return provider.refreshToken(refreshToken);
  }

  /**
   * Check if provider supports token refresh
   */
  supportsRefresh(providerName: OAuthProviderName): boolean {
    const provider = this.providers.get(providerName);
    return provider ? typeof provider.refreshToken === 'function' : false;
  }
}

/**
 * Create OAuth manager
 */
export function createOAuthManager(
  storage: KVStorage,
  config: OAuthConfig,
  options?: { stateExpirySeconds?: number }
): OAuthManager {
  return new OAuthManager(storage, config, options);
}
