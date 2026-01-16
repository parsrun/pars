/**
 * Tenant Resolution
 * Extracts tenant from incoming requests using configurable strategies
 */

import type { TenantResolutionStrategy } from '../config.js';

/**
 * Tenant resolver configuration
 */
export interface TenantResolverConfig {
  /** Resolution strategy */
  strategy: TenantResolutionStrategy;
  /** Header name for 'header' strategy (default: 'x-tenant-id') */
  headerName?: string;
  /** Path prefix for 'path' strategy (default: '/t/') */
  pathPrefix?: string;
  /** Query parameter name for 'query' strategy (default: 'tenant') */
  queryParam?: string;
  /** Custom resolver function for 'custom' strategy */
  resolver?: (request: Request) => Promise<string | null>;
  /** Fallback tenant ID when none is resolved */
  fallbackTenantId?: string;
  /** Whether tenant is required (default: false) */
  required?: boolean;
}

/**
 * Tenant resolution result
 */
export interface TenantResolutionResult {
  /** Resolved tenant ID */
  tenantId: string | null;
  /** Resolution method used */
  resolvedFrom: 'subdomain' | 'header' | 'path' | 'query' | 'custom' | 'fallback' | null;
  /** Original value before resolution */
  originalValue?: string;
}

/**
 * Tenant Resolver
 * Extracts tenant identifier from requests using various strategies
 */
export class TenantResolver {
  private config: Required<Omit<TenantResolverConfig, 'resolver' | 'fallbackTenantId'>> &
    Pick<TenantResolverConfig, 'resolver' | 'fallbackTenantId'>;

  constructor(config: TenantResolverConfig) {
    this.config = {
      headerName: 'x-tenant-id',
      pathPrefix: '/t/',
      queryParam: 'tenant',
      required: false,
      ...config,
    };
  }

  /**
   * Resolve tenant from request
   */
  async resolve(request: Request): Promise<TenantResolutionResult> {
    const { strategy } = this.config;

    let result: TenantResolutionResult = {
      tenantId: null,
      resolvedFrom: null,
    };

    switch (strategy) {
      case 'subdomain':
        result = this.resolveFromSubdomain(request);
        break;
      case 'header':
        result = this.resolveFromHeader(request);
        break;
      case 'path':
        result = this.resolveFromPath(request);
        break;
      case 'query':
        result = this.resolveFromQuery(request);
        break;
      case 'custom':
        result = await this.resolveFromCustom(request);
        break;
    }

    // Apply fallback if no tenant found
    if (!result.tenantId && this.config.fallbackTenantId) {
      result = {
        tenantId: this.config.fallbackTenantId,
        resolvedFrom: 'fallback',
      };
    }

    return result;
  }

  /**
   * Resolve tenant from subdomain
   * e.g., acme.example.com -> 'acme'
   */
  private resolveFromSubdomain(request: Request): TenantResolutionResult {
    const url = new URL(request.url);
    const host = url.hostname;

    // Split by dots and get first part
    const parts = host.split('.');

    // Need at least 3 parts for subdomain (tenant.example.com)
    // Or 2 parts for localhost (tenant.localhost)
    if (parts.length >= 3 || (parts.length === 2 && parts[1] === 'localhost')) {
      const subdomain = parts[0]!;

      // Skip common non-tenant subdomains
      const skipSubdomains = ['www', 'api', 'app', 'admin', 'mail', 'ftp'];
      if (!skipSubdomains.includes(subdomain.toLowerCase())) {
        return {
          tenantId: subdomain,
          resolvedFrom: 'subdomain',
          originalValue: subdomain,
        };
      }
    }

    return { tenantId: null, resolvedFrom: null };
  }

  /**
   * Resolve tenant from header
   * e.g., X-Tenant-ID: acme
   */
  private resolveFromHeader(request: Request): TenantResolutionResult {
    const headerValue = request.headers.get(this.config.headerName);

    if (headerValue) {
      return {
        tenantId: headerValue,
        resolvedFrom: 'header',
        originalValue: headerValue,
      };
    }

    return { tenantId: null, resolvedFrom: null };
  }

  /**
   * Resolve tenant from URL path
   * e.g., /t/acme/api/users -> 'acme'
   */
  private resolveFromPath(request: Request): TenantResolutionResult {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const prefix = this.config.pathPrefix;

    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      const slashIndex = rest.indexOf('/');
      const tenantSlug = slashIndex > 0 ? rest.slice(0, slashIndex) : rest;

      if (tenantSlug) {
        return {
          tenantId: tenantSlug,
          resolvedFrom: 'path',
          originalValue: tenantSlug,
        };
      }
    }

    return { tenantId: null, resolvedFrom: null };
  }

  /**
   * Resolve tenant from query parameter
   * e.g., /api/users?tenant=acme -> 'acme'
   */
  private resolveFromQuery(request: Request): TenantResolutionResult {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get(this.config.queryParam);

    if (tenantId) {
      return {
        tenantId,
        resolvedFrom: 'query',
        originalValue: tenantId,
      };
    }

    return { tenantId: null, resolvedFrom: null };
  }

  /**
   * Resolve tenant using custom resolver
   */
  private async resolveFromCustom(request: Request): Promise<TenantResolutionResult> {
    if (!this.config.resolver) {
      return { tenantId: null, resolvedFrom: null };
    }

    const tenantId = await this.config.resolver(request);

    if (tenantId) {
      return {
        tenantId,
        resolvedFrom: 'custom',
        originalValue: tenantId,
      };
    }

    return { tenantId: null, resolvedFrom: null };
  }

  /**
   * Check if tenant is required but not found
   */
  isRequired(): boolean {
    return this.config.required;
  }

  /**
   * Get the path without tenant prefix (for path strategy)
   */
  stripTenantFromPath(pathname: string): string {
    if (this.config.strategy !== 'path') {
      return pathname;
    }

    const prefix = this.config.pathPrefix;
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      const slashIndex = rest.indexOf('/');
      if (slashIndex > 0) {
        return rest.slice(slashIndex);
      }
      return '/';
    }

    return pathname;
  }
}

/**
 * Create a tenant resolver
 */
export function createTenantResolver(config: TenantResolverConfig): TenantResolver {
  return new TenantResolver(config);
}

/**
 * Multi-strategy tenant resolver
 * Tries multiple strategies in order until one succeeds
 */
export class MultiStrategyTenantResolver {
  private resolvers: TenantResolver[];
  private fallbackTenantId?: string;

  constructor(
    strategies: TenantResolverConfig[],
    options?: { fallbackTenantId?: string }
  ) {
    this.resolvers = strategies.map(s => new TenantResolver(s));
    this.fallbackTenantId = options?.fallbackTenantId;
  }

  /**
   * Resolve tenant trying each strategy in order
   */
  async resolve(request: Request): Promise<TenantResolutionResult> {
    for (const resolver of this.resolvers) {
      const result = await resolver.resolve(request);
      if (result.tenantId) {
        return result;
      }
    }

    // Apply fallback if no tenant found
    if (this.fallbackTenantId) {
      return {
        tenantId: this.fallbackTenantId,
        resolvedFrom: 'fallback',
      };
    }

    return { tenantId: null, resolvedFrom: null };
  }
}

/**
 * Create a multi-strategy tenant resolver
 */
export function createMultiStrategyResolver(
  strategies: TenantResolverConfig[],
  options?: { fallbackTenantId?: string }
): MultiStrategyTenantResolver {
  return new MultiStrategyTenantResolver(strategies, options);
}
