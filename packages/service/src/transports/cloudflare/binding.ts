/**
 * @parsrun/service - Cloudflare Service Binding Transport
 * RPC transport using Cloudflare Workers Service Bindings
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type {
  RpcRequest,
  RpcResponse,
  RpcTransport,
  Fetcher,
} from "../../types.js";
import { type Serializer, jsonSerializer } from "../../serialization/index.js";
import { TransportError, SerializationError } from "../../rpc/errors.js";

// ============================================================================
// SERVICE BINDING TRANSPORT
// ============================================================================

export interface ServiceBindingTransportOptions {
  /** Service name */
  serviceName: string;
  /** Cloudflare service binding */
  binding: Fetcher;
  /** Serializer (default: JSON) */
  serializer?: Serializer;
  /** Logger */
  logger?: Logger;
  /** Timeout in ms */
  timeout?: number;
}

/**
 * RPC transport using Cloudflare Service Bindings
 *
 * Service bindings provide zero-latency, in-network communication
 * between Cloudflare Workers.
 */
export class ServiceBindingTransport implements RpcTransport {
  readonly name = "service-binding";
  private readonly serviceName: string;
  private readonly binding: Fetcher;
  private readonly serializer: Serializer;
  private readonly logger: Logger;

  constructor(options: ServiceBindingTransportOptions) {
    this.serviceName = options.serviceName;
    this.binding = options.binding;
    this.serializer = options.serializer ?? jsonSerializer;
    this.logger = options.logger ?? createLogger({ name: `binding:${options.serviceName}` });
    // Note: timeout option reserved for future AbortController support
  }

  async call<TInput, TOutput>(request: RpcRequest<TInput>): Promise<RpcResponse<TOutput>> {
    const startTime = Date.now();

    try {
      // Serialize request
      let body: string | ArrayBuffer;
      try {
        body = this.serializer.encode(request);
      } catch (error) {
        throw new SerializationError(
          "Failed to serialize request",
          error instanceof Error ? error : undefined
        );
      }

      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": this.serializer.contentType,
        Accept: this.serializer.contentType,
        "X-Request-ID": request.id,
        "X-Service": request.service,
        "X-Method": request.method,
        "X-Method-Type": request.type,
      };

      if (request.version) {
        headers["X-Service-Version"] = request.version;
      }

      if (request.traceContext) {
        headers["traceparent"] = formatTraceparent(request.traceContext);
        if (request.traceContext.traceState) {
          headers["tracestate"] = request.traceContext.traceState;
        }
      }

      if (request.metadata?.tenantId) {
        headers["X-Tenant-ID"] = String(request.metadata.tenantId);
      }

      // Make request via service binding
      const response = await this.binding.fetch("http://internal/rpc", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : body,
      });

      // Parse response
      let responseData: RpcResponse<TOutput>;
      try {
        const contentType = response.headers.get("Content-Type") ?? "";
        if (contentType.includes("msgpack")) {
          const buffer = await response.arrayBuffer();
          responseData = this.serializer.decode(buffer) as RpcResponse<TOutput>;
        } else {
          const text = await response.text();
          responseData = this.serializer.decode(text) as RpcResponse<TOutput>;
        }
      } catch (error) {
        throw new SerializationError(
          "Failed to deserialize response",
          error instanceof Error ? error : undefined
        );
      }

      const duration = Date.now() - startTime;
      this.logger.debug(`RPC call completed`, {
        service: this.serviceName,
        method: request.method,
        durationMs: duration,
        success: responseData.success,
      });

      return responseData;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof SerializationError) {
        throw error;
      }

      this.logger.error(`RPC call failed`, error as Error, {
        service: this.serviceName,
        method: request.method,
        durationMs: duration,
      });

      throw new TransportError(
        `Service binding call failed: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  async close(): Promise<void> {
    // Service bindings don't need cleanup
  }
}

/**
 * Create a service binding transport
 */
export function createServiceBindingTransport(
  options: ServiceBindingTransportOptions
): ServiceBindingTransport {
  return new ServiceBindingTransport(options);
}

// ============================================================================
// SERVICE BINDING HANDLER
// ============================================================================

import type { RpcServer } from "../../rpc/server.js";
import { parseTraceparent } from "../../rpc/transports/http.js";

/**
 * Create a request handler for service binding requests
 *
 * @example
 * ```typescript
 * // In your worker
 * export default {
 *   fetch: createServiceBindingHandler(rpcServer),
 * };
 * ```
 */
export function createServiceBindingHandler(
  server: RpcServer,
  options?: {
    serializer?: Serializer;
    logger?: Logger;
  }
): (request: Request) => Promise<Response> {
  const serializer = options?.serializer ?? jsonSerializer;
  const logger = options?.logger ?? createLogger({ name: "binding-handler" });

  return async (request: Request): Promise<Response> => {
    // Only handle POST to /rpc
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/rpc") {
      return new Response("Not Found", { status: 404 });
    }

    try {
      // Parse request body
      const contentType = request.headers.get("Content-Type") ?? "";
      let body: RpcRequest;

      if (contentType.includes("msgpack")) {
        const buffer = await request.arrayBuffer();
        body = serializer.decode(buffer) as RpcRequest;
      } else {
        const text = await request.text();
        body = serializer.decode(text) as RpcRequest;
      }

      // Extract trace context
      const traceparent = request.headers.get("traceparent");
      if (traceparent) {
        const parsedTrace = parseTraceparent(traceparent);
        if (parsedTrace) {
          body.traceContext = parsedTrace;
          const tracestate = request.headers.get("tracestate");
          if (tracestate) {
            body.traceContext.traceState = tracestate;
          }
        }
      }

      // Extract tenant from header
      const tenantId = request.headers.get("X-Tenant-ID");
      if (tenantId) {
        body.metadata = { ...body.metadata, tenantId };
      }

      // Handle request
      const response = await server.handle(body);

      // Serialize response
      const responseBody = serializer.encode(response);

      return new Response(
        typeof responseBody === "string" ? responseBody : responseBody,
        {
          status: response.success ? 200 : getHttpStatus(response.error?.code),
          headers: {
            "Content-Type": serializer.contentType,
            "X-Request-ID": body.id,
          },
        }
      );
    } catch (error) {
      logger.error("Handler error", error as Error);

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: (error as Error).message,
          },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  };
}

// ============================================================================
// HELPERS
// ============================================================================

import type { TraceContext } from "../../types.js";

function formatTraceparent(ctx: TraceContext): string {
  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

function getHttpStatus(code?: string): number {
  switch (code) {
    case "METHOD_NOT_FOUND":
    case "SERVICE_NOT_FOUND":
      return 404;
    case "VERSION_MISMATCH":
    case "VALIDATION_ERROR":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "TIMEOUT":
      return 504;
    case "CIRCUIT_OPEN":
    case "BULKHEAD_REJECTED":
      return 503;
    default:
      return 500;
  }
}
