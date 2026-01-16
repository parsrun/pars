/**
 * @parsrun/service - Durable Object Transport
 * RPC/Event transport using Cloudflare Durable Objects
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type {
  RpcRequest,
  RpcResponse,
  RpcTransport,
  ParsEvent,
  EventTransport,
  EventHandler,
  EventHandlerOptions,
  Unsubscribe,
} from "../../types.js";
import { type Serializer, jsonSerializer } from "../../serialization/index.js";
import { TransportError } from "../../rpc/errors.js";
import { EventHandlerRegistry } from "../../events/handler.js";

// ============================================================================
// DURABLE OBJECT TYPES
// ============================================================================

/**
 * Durable Object namespace binding
 */
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

/**
 * Durable Object ID
 */
export interface DurableObjectId {
  toString(): string;
}

/**
 * Durable Object stub for making requests
 */
export interface DurableObjectStub {
  fetch(input: string | Request | URL, init?: RequestInit): Promise<Response>;
}

// ============================================================================
// DURABLE OBJECT TRANSPORT
// ============================================================================

export interface DurableObjectTransportOptions {
  /** Durable Object namespace */
  namespace: DurableObjectNamespace;
  /** Object ID or name resolver */
  objectId: string | ((request: RpcRequest) => string);
  /** Serializer (default: JSON) */
  serializer?: Serializer;
  /** Logger */
  logger?: Logger;
}

/**
 * RPC transport using Durable Objects
 *
 * Routes requests to specific Durable Object instances,
 * enabling stateful, single-threaded execution.
 */
export class DurableObjectTransport implements RpcTransport {
  readonly name = "durable-object";
  private readonly namespace: DurableObjectNamespace;
  private readonly objectIdResolver: (request: RpcRequest) => string;
  private readonly serializer: Serializer;
  private readonly logger: Logger;

  constructor(options: DurableObjectTransportOptions) {
    this.namespace = options.namespace;
    this.objectIdResolver =
      typeof options.objectId === "function"
        ? options.objectId
        : () => options.objectId as string;
    this.serializer = options.serializer ?? jsonSerializer;
    this.logger = options.logger ?? createLogger({ name: "durable-object" });
  }

  async call<TInput, TOutput>(request: RpcRequest<TInput>): Promise<RpcResponse<TOutput>> {
    try {
      // Resolve object ID
      const objectIdName = this.objectIdResolver(request);
      const id = this.namespace.idFromName(objectIdName);
      const stub = this.namespace.get(id);

      // Make request to Durable Object
      const body = this.serializer.encode(request);
      const response = await stub.fetch("http://internal/rpc", {
        method: "POST",
        headers: {
          "Content-Type": this.serializer.contentType,
        },
        body: typeof body === "string" ? body : body,
      });

      // Parse response
      const text = await response.text();
      return this.serializer.decode(text) as RpcResponse<TOutput>;
    } catch (error) {
      this.logger.error("Durable Object call failed", error as Error);
      throw new TransportError(
        `Durable Object call failed: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  async close(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Create a Durable Object transport
 */
export function createDurableObjectTransport(
  options: DurableObjectTransportOptions
): DurableObjectTransport {
  return new DurableObjectTransport(options);
}

// ============================================================================
// DURABLE OBJECT EVENT TRANSPORT
// ============================================================================

export interface DurableObjectEventTransportOptions {
  /** Durable Object namespace */
  namespace: DurableObjectNamespace;
  /** Object ID resolver (e.g., by tenant ID) */
  objectIdResolver: (event: ParsEvent) => string;
  /** Logger */
  logger?: Logger;
}

/**
 * Event transport using Durable Objects
 *
 * Routes events to specific Durable Object instances,
 * useful for tenant-specific event processing.
 */
export class DurableObjectEventTransport implements EventTransport {
  readonly name = "durable-object-events";
  private readonly namespace: DurableObjectNamespace;
  private readonly objectIdResolver: (event: ParsEvent) => string;
  private readonly logger: Logger;
  private readonly registry: EventHandlerRegistry;

  constructor(options: DurableObjectEventTransportOptions) {
    this.namespace = options.namespace;
    this.objectIdResolver = options.objectIdResolver;
    this.logger = options.logger ?? createLogger({ name: "do-events" });
    this.registry = new EventHandlerRegistry({ logger: this.logger });
  }

  async emit<T>(event: ParsEvent<T>): Promise<void> {
    try {
      const objectIdName = this.objectIdResolver(event);
      const id = this.namespace.idFromName(objectIdName);
      const stub = this.namespace.get(id);

      await stub.fetch("http://internal/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (error) {
      this.logger.error("Failed to emit event to Durable Object", error as Error);
      throw error;
    }
  }

  subscribe(
    eventType: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): Unsubscribe {
    return this.registry.register(eventType, handler, options);
  }

  async close(): Promise<void> {
    this.registry.clear();
  }
}

// ============================================================================
// DURABLE OBJECT BASE CLASS
// ============================================================================

import type { RpcServer } from "../../rpc/server.js";

/**
 * Base class for service Durable Objects
 *
 * @example
 * ```typescript
 * export class PaymentsDO extends ServiceDurableObject {
 *   constructor(state: DurableObjectState, env: Env) {
 *     super(state, env, createPaymentsServer());
 *   }
 * }
 * ```
 */
export abstract class ServiceDurableObject {
  protected readonly state: DurableObjectState;
  protected readonly rpcServer: RpcServer;
  protected readonly eventRegistry: EventHandlerRegistry;
  protected readonly logger: Logger;

  constructor(
    state: DurableObjectState,
    _env: unknown,
    rpcServer: RpcServer
  ) {
    this.state = state;
    this.rpcServer = rpcServer;
    this.eventRegistry = new EventHandlerRegistry();
    this.logger = createLogger({ name: `do:${rpcServer.getDefinition().name}` });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/rpc") {
      return this.handleRpc(request);
    }

    if (request.method === "POST" && url.pathname === "/event") {
      return this.handleEvent(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleRpc(request: Request): Promise<Response> {
    try {
      const body = await request.json() as RpcRequest;
      const response = await this.rpcServer.handle(body);

      return new Response(JSON.stringify(response), {
        status: response.success ? 200 : 500,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      this.logger.error("RPC handler error", error as Error);
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "INTERNAL_ERROR", message: (error as Error).message },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  private async handleEvent(request: Request): Promise<Response> {
    try {
      const event = await request.json() as ParsEvent;
      await this.eventRegistry.handle(event);
      return new Response("OK", { status: 200 });
    } catch (error) {
      this.logger.error("Event handler error", error as Error);
      return new Response("Error", { status: 500 });
    }
  }

  /**
   * Register an event handler
   */
  protected on(
    eventType: string,
    handler: EventHandler,
    options?: EventHandlerOptions
  ): Unsubscribe {
    return this.eventRegistry.register(eventType, handler, options);
  }
}

/**
 * Durable Object state interface
 */
interface DurableObjectState {
  id: DurableObjectId;
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  get<T>(keys: string[]): Promise<Map<string, T>>;
  put<T>(key: string, value: T): Promise<void>;
  put<T>(entries: Record<string, T>): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
}
