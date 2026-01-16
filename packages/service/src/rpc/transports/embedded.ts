/**
 * @parsrun/service - Embedded RPC Transport
 * Direct function call transport for monolithic/embedded mode
 */

import type { RpcRequest, RpcResponse, RpcTransport } from "../../types.js";
import type { RpcServer } from "../server.js";

// ============================================================================
// EMBEDDED TRANSPORT
// ============================================================================

/**
 * Embedded transport that calls handlers directly
 * Used when services are in the same process
 */
export class EmbeddedTransport implements RpcTransport {
  readonly name = "embedded";
  private readonly server: RpcServer;

  constructor(server: RpcServer) {
    this.server = server;
  }

  async call<TInput, TOutput>(request: RpcRequest<TInput>): Promise<RpcResponse<TOutput>> {
    // Direct call to server - no serialization needed
    return this.server.handle<TInput, TOutput>(request);
  }

  async close(): Promise<void> {
    // No cleanup needed for embedded transport
  }
}

/**
 * Create an embedded transport for direct function calls.
 * Used when the service is in the same process.
 *
 * @param server - The RPC server to call directly
 * @returns A new embedded transport instance
 *
 * @example
 * ```typescript
 * const transport = createEmbeddedTransport(rpcServer);
 * const client = createRpcClient({ service: 'payments', transport });
 * ```
 */
export function createEmbeddedTransport(server: RpcServer): EmbeddedTransport {
  return new EmbeddedTransport(server);
}

// ============================================================================
// EMBEDDED TRANSPORT REGISTRY
// ============================================================================

/**
 * Registry for embedded services
 * Allows services to find each other in embedded mode
 */
export class EmbeddedRegistry {
  private static instance: EmbeddedRegistry | null = null;
  private readonly servers: Map<string, RpcServer> = new Map();

  private constructor() {}

  static getInstance(): EmbeddedRegistry {
    if (!EmbeddedRegistry.instance) {
      EmbeddedRegistry.instance = new EmbeddedRegistry();
    }
    return EmbeddedRegistry.instance;
  }

  /**
   * Register a service
   */
  register(name: string, server: RpcServer): void {
    if (this.servers.has(name)) {
      throw new Error(`Service already registered: ${name}`);
    }
    this.servers.set(name, server);
  }

  /**
   * Unregister a service
   */
  unregister(name: string): boolean {
    return this.servers.delete(name);
  }

  /**
   * Get a service by name
   */
  get(name: string): RpcServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Create a transport for a registered service
   */
  createTransport(name: string): EmbeddedTransport {
    const server = this.servers.get(name);
    if (!server) {
      throw new Error(`Service not found: ${name}`);
    }
    return new EmbeddedTransport(server);
  }

  /**
   * Clear all registered services
   */
  clear(): void {
    this.servers.clear();
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static reset(): void {
    EmbeddedRegistry.instance = null;
  }
}

/**
 * Get the global embedded registry singleton.
 * Provides access to the shared registry for service discovery.
 *
 * @returns The global embedded registry instance
 *
 * @example
 * ```typescript
 * const registry = getEmbeddedRegistry();
 * registry.register('payments', paymentsServer);
 * const transport = registry.createTransport('payments');
 * ```
 */
export function getEmbeddedRegistry(): EmbeddedRegistry {
  return EmbeddedRegistry.getInstance();
}
