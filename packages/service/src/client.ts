/**
 * @parsrun/service - Service Client
 * High-level client API for consuming services
 */

import type { Logger } from "@parsrun/core";
import { generateId } from "@parsrun/core";
import type {
  ServiceDefinition,
  ServiceClient,
  ServiceClientOptions,
  ServiceConfig,
  RpcTransport,
  EventTransport,
  EventHandler,
  EventHandlerOptions,
  Unsubscribe,
  ParsEvent,
  QueryInput,
  QueryOutput,
  MutationInput,
  MutationOutput,
  EventData,
} from "./types.js";
import { mergeConfig } from "./config.js";
import { RpcClient } from "./rpc/client.js";
import { getEmbeddedRegistry } from "./rpc/transports/embedded.js";
import { createHttpTransport } from "./rpc/transports/http.js";
import { createMemoryEventTransport, getGlobalEventBus } from "./events/transports/memory.js";
import { Tracer, getGlobalTracer } from "./tracing/tracer.js";

// ============================================================================
// SERVICE CLIENT IMPLEMENTATION
// ============================================================================

/**
 * Full service client with RPC and Events
 */
class ServiceClientImpl<TDef extends ServiceDefinition> implements ServiceClient<TDef> {
  readonly name: string;
  private readonly rpcClient: RpcClient;
  private readonly eventTransport: EventTransport;
  private readonly config: Required<ServiceConfig>;
  private readonly tracer: Tracer | null;

  constructor(
    definition: TDef,
    rpcTransport: RpcTransport,
    eventTransport: EventTransport,
    config: ServiceConfig,
    _logger?: Logger
  ) {
    this.name = definition.name;
    this.config = mergeConfig(config);
    this.tracer = getGlobalTracer();

    this.rpcClient = new RpcClient({
      service: definition.name,
      transport: rpcTransport,
      config: this.config,
    });

    this.eventTransport = eventTransport;
  }

  /**
   * Execute a query
   */
  async query<K extends keyof TDef["queries"]>(
    method: K,
    input: QueryInput<TDef["queries"], K>
  ): Promise<QueryOutput<TDef["queries"], K>> {
    const methodName = String(method);
    const traceContext = this.tracer?.currentContext();

    // Trace if available
    if (this.tracer && traceContext) {
      return this.tracer.trace(
        `rpc.${this.name}.${methodName}`,
        async () => {
          return this.rpcClient.query(methodName, input, {
            traceContext,
          }) as Promise<QueryOutput<TDef["queries"], K>>;
        },
        { kind: "client" }
      ) as Promise<QueryOutput<TDef["queries"], K>>;
    }

    return this.rpcClient.query(methodName, input) as Promise<QueryOutput<TDef["queries"], K>>;
  }

  /**
   * Execute a mutation
   */
  async mutate<K extends keyof TDef["mutations"]>(
    method: K,
    input: MutationInput<TDef["mutations"], K>
  ): Promise<MutationOutput<TDef["mutations"], K>> {
    const methodName = String(method);
    const traceContext = this.tracer?.currentContext();

    // Trace if available
    if (this.tracer && traceContext) {
      return this.tracer.trace(
        `rpc.${this.name}.${methodName}`,
        async () => {
          return this.rpcClient.mutate(methodName, input, {
            traceContext,
          }) as Promise<MutationOutput<TDef["mutations"], K>>;
        },
        { kind: "client" }
      ) as Promise<MutationOutput<TDef["mutations"], K>>;
    }

    return this.rpcClient.mutate(methodName, input) as Promise<MutationOutput<TDef["mutations"], K>>;
  }

  /**
   * Emit an event
   */
  async emit<K extends keyof NonNullable<TDef["events"]>["emits"]>(
    eventType: K,
    data: EventData<NonNullable<TDef["events"]>["emits"], K>
  ): Promise<void> {
    const type = String(eventType);
    const traceContext = this.tracer?.currentContext();

    const event: ParsEvent = {
      specversion: "1.0",
      type,
      source: this.name,
      id: generateId(),
      time: new Date().toISOString(),
      data,
    };

    // Add trace context if available
    if (traceContext) {
      event.parstracecontext = `00-${traceContext.traceId}-${traceContext.spanId}-01`;
    }

    await this.eventTransport.emit(event);
  }

  /**
   * Subscribe to events
   */
  on<T = unknown>(
    eventType: string,
    handler: EventHandler<T>,
    options?: EventHandlerOptions
  ): Unsubscribe {
    return this.eventTransport.subscribe(eventType, handler as EventHandler, options);
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): "closed" | "open" | "half-open" | null {
    return this.rpcClient.getCircuitState();
  }

  /**
   * Close the client
   */
  async close(): Promise<void> {
    await this.rpcClient.close();
    await this.eventTransport.close?.();
  }
}

// ============================================================================
// USE SERVICE FACTORY
// ============================================================================

/**
 * Create a service client
 *
 * @example
 * ```typescript
 * // Embedded mode (same process)
 * const payments = useService('payments');
 *
 * // HTTP mode (remote service)
 * const payments = useService('payments', {
 *   mode: 'http',
 *   baseUrl: 'https://payments.example.com',
 * });
 *
 * // Cloudflare binding mode
 * const payments = useService('payments', {
 *   mode: 'binding',
 *   binding: env.PAYMENTS,
 * });
 * ```
 */
export function useService<TDef extends ServiceDefinition = ServiceDefinition>(
  serviceName: string,
  options: ServiceClientOptions = {}
): ServiceClient<TDef> {
  const mode = options.mode ?? "embedded";
  const config = options.config ?? {};

  let rpcTransport: RpcTransport;
  let eventTransport: EventTransport;

  switch (mode) {
    case "embedded": {
      // Use embedded registry
      const registry = getEmbeddedRegistry();
      if (!registry.has(serviceName)) {
        throw new Error(
          `Service not found in embedded registry: ${serviceName}. ` +
            `Make sure the service is registered before using it.`
        );
      }
      rpcTransport = registry.createTransport(serviceName);

      // Use global event bus
      const eventBus = getGlobalEventBus();
      const services = eventBus.getServices();
      if (services.includes(serviceName)) {
        // Get existing transport from bus
        eventTransport = createMemoryEventTransport();
      } else {
        eventTransport = createMemoryEventTransport();
      }
      break;
    }

    case "http": {
      if (!options.baseUrl) {
        throw new Error("baseUrl is required for HTTP mode");
      }
      rpcTransport = createHttpTransport({
        baseUrl: options.baseUrl,
      });
      // Events over HTTP would need webhook or polling - use memory for now
      eventTransport = createMemoryEventTransport();
      break;
    }

    case "binding": {
      if (!options.binding) {
        throw new Error("binding is required for binding mode");
      }
      // Cloudflare service binding transport
      rpcTransport = createBindingTransport(serviceName, options.binding);
      eventTransport = createMemoryEventTransport();
      break;
    }

    default:
      throw new Error(`Unknown service client mode: ${mode}`);
  }

  // Use custom transports if provided
  if (options.rpcTransport) {
    rpcTransport = options.rpcTransport;
  }
  if (options.eventTransport) {
    eventTransport = options.eventTransport;
  }

  // Create a minimal definition for the client
  const definition: ServiceDefinition = {
    name: serviceName,
    version: "1.x",
  };

  return new ServiceClientImpl<TDef>(
    definition as TDef,
    rpcTransport,
    eventTransport,
    config
  );
}

/**
 * Create a typed service client from a definition
 */
export function useTypedService<TDef extends ServiceDefinition>(
  definition: TDef,
  options: ServiceClientOptions = {}
): ServiceClient<TDef> {
  return useService<TDef>(definition.name, options);
}

// ============================================================================
// BINDING TRANSPORT HELPER
// ============================================================================

import type { Fetcher, RpcRequest, RpcResponse } from "./types.js";

/**
 * Create RPC transport for Cloudflare service binding
 */
function createBindingTransport(_serviceName: string, binding: Fetcher): RpcTransport {
  return {
    name: "binding",
    async call<TInput, TOutput>(request: RpcRequest<TInput>) {
      const response = await binding.fetch("http://internal/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": request.id,
          "X-Service": request.service,
          "X-Method": request.method,
        },
        body: JSON.stringify(request),
      });

      return response.json() as Promise<RpcResponse<TOutput>>;
    },
    async close() {
      // No cleanup needed for bindings
    },
  };
}

// ============================================================================
// SERVICE REGISTRY CLIENT
// ============================================================================

/**
 * Service registry for managing multiple service clients
 */
export class ServiceRegistry {
  private readonly clients: Map<string, ServiceClient> = new Map();
  private readonly config: ServiceConfig;

  constructor(config?: ServiceConfig) {
    this.config = config ?? {};
  }

  /**
   * Get or create a service client
   */
  get<TDef extends ServiceDefinition = ServiceDefinition>(
    serviceName: string,
    options?: ServiceClientOptions
  ): ServiceClient<TDef> {
    let client = this.clients.get(serviceName);
    if (!client) {
      client = useService<TDef>(serviceName, {
        ...options,
        config: { ...this.config, ...options?.config },
      });
      this.clients.set(serviceName, client);
    }
    return client as ServiceClient<TDef>;
  }

  /**
   * Close all clients
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.clients.values()).map((client) => {
      if ("close" in client && typeof client.close === "function") {
        return (client as { close: () => Promise<void> }).close();
      }
      return Promise.resolve();
    });
    await Promise.all(closePromises);
    this.clients.clear();
  }
}

/**
 * Create a service registry
 */
export function createServiceRegistry(config?: ServiceConfig): ServiceRegistry {
  return new ServiceRegistry(config);
}
