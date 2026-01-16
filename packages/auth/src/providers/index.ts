/**
 * Provider Registry
 * Manages authentication providers
 */

import type {
  AuthProvider,
  ProviderType,
  ProviderInfo,
  OAuthProvider,
  TwoFactorProvider,
} from './base.js';

// Re-export base types
export * from './base.js';

/**
 * Provider registry for managing auth providers
 */
export class ProviderRegistry {
  private providers: Map<string, AuthProvider> = new Map();

  /**
   * Register a provider
   */
  register(provider: AuthProvider): void {
    if (this.providers.has(provider.name)) {
      console.warn(
        `[Pars Auth] Provider "${provider.name}" is already registered. Overwriting.`
      );
    }
    this.providers.set(provider.name, provider);
  }

  /**
   * Unregister a provider
   */
  unregister(name: string): boolean {
    return this.providers.delete(name);
  }

  /**
   * Get a provider by name
   */
  get(name: string): AuthProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get a provider by name (throws if not found)
   */
  getOrThrow(name: string): AuthProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`[Pars Auth] Provider "${name}" not found`);
    }
    return provider;
  }

  /**
   * Check if a provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get all providers of a specific type
   */
  getByType(type: ProviderType): AuthProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.type === type);
  }

  /**
   * Get all enabled providers
   */
  getEnabled(): AuthProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.enabled);
  }

  /**
   * Get all enabled providers of a specific type
   */
  getEnabledByType(type: ProviderType): AuthProvider[] {
    return this.getEnabled().filter((p) => p.type === type);
  }

  /**
   * Get all registered providers
   */
  getAll(): AuthProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider names
   */
  getNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider info for all providers
   */
  getInfo(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => p.getInfo());
  }

  /**
   * Get OAuth providers
   */
  getOAuthProviders(): OAuthProvider[] {
    return this.getByType('oauth') as OAuthProvider[];
  }

  /**
   * Get 2FA providers
   */
  getTwoFactorProviders(): TwoFactorProvider[] {
    return [
      ...this.getByType('totp'),
      ...this.getByType('webauthn'),
    ] as TwoFactorProvider[];
  }

  /**
   * Check if a provider type is enabled
   */
  isTypeEnabled(type: ProviderType): boolean {
    return this.getEnabledByType(type).length > 0;
  }

  /**
   * Get the primary authentication provider
   * Returns the first enabled provider in order: otp > magic-link > oauth > password
   */
  getPrimary(): AuthProvider | undefined {
    const priority: ProviderType[] = ['otp', 'magic-link', 'oauth', 'password'];

    for (const type of priority) {
      const enabled = this.getEnabledByType(type);
      if (enabled.length > 0) {
        return enabled[0];
      }
    }

    return undefined;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Get provider count
   */
  get size(): number {
    return this.providers.size;
  }
}

/**
 * Create a new provider registry
 */
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}
