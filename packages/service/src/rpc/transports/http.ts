/**
 * @parsrun/service - HTTP RPC Transport
 * HTTP-based transport for distributed services
 */

import type { RpcRequest, RpcResponse, RpcTransport } from "../../types.js";
import { type Serializer, jsonSerializer } from "../../serialization/index.js";
import { TransportError, SerializationError } from "../errors.js";

// ============================================================================
// HTTP TRANSPORT
// ============================================================================

/**
 * Options for creating an HTTP transport.
 */
export interface HttpTransportOptions {
  /** Base URL of the service */
  baseUrl: string;
  /** Custom serializer (default: JSON) */
  serializer?: Serializer;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Fetch function (for testing or custom implementations) */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * HTTP transport for RPC calls over HTTP/HTTPS.
 * Makes POST requests to /rpc endpoint with serialized request body.
 */
export class HttpTransport implements RpcTransport {
  readonly name = "http";
  private readonly baseUrl: string;
  private readonly serializer: Serializer;
  private readonly headers: Record<string, string>;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly timeout: number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.serializer = options.serializer ?? jsonSerializer;
    this.headers = options.headers ?? {};
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeout = options.timeout ?? 30_000;
  }

  async call<TInput, TOutput>(request: RpcRequest<TInput>): Promise<RpcResponse<TOutput>> {
    const url = `${this.baseUrl}/rpc`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

      // Make HTTP request
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "Content-Type": this.serializer.contentType,
          Accept: this.serializer.contentType,
          "X-Request-ID": request.id,
          "X-Service": request.service,
          "X-Method": request.method,
          "X-Method-Type": request.type,
          ...(request.version ? { "X-Service-Version": request.version } : {}),
          ...(request.traceContext
            ? {
                traceparent: formatTraceparent(request.traceContext),
                ...(request.traceContext.traceState
                  ? { tracestate: request.traceContext.traceState }
                  : {}),
              }
            : {}),
          ...this.headers,
        },
        body: body instanceof ArrayBuffer ? body : body,
        signal: controller.signal,
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

      return responseData;
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new TransportError(`Request timeout after ${this.timeout}ms`);
        }
        throw new TransportError(`HTTP request failed: ${error.message}`, error);
      }

      throw new TransportError("Unknown transport error");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async close(): Promise<void> {
    // No persistent connection to close
  }
}

/**
 * Create an HTTP transport for RPC calls.
 *
 * @param options - Transport configuration options
 * @returns A new HTTP transport instance
 *
 * @example
 * ```typescript
 * const transport = createHttpTransport({
 *   baseUrl: 'https://api.example.com',
 *   timeout: 5000,
 * });
 * ```
 */
export function createHttpTransport(options: HttpTransportOptions): HttpTransport {
  return new HttpTransport(options);
}

// ============================================================================
// TRACE CONTEXT HELPERS
// ============================================================================

import type { TraceContext } from "../../types.js";

/**
 * Format trace context as W3C traceparent header
 */
function formatTraceparent(ctx: TraceContext): string {
  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Parse W3C traceparent header to extract trace context.
 *
 * @param header - The traceparent header value
 * @returns Parsed trace context or null if invalid
 *
 * @example
 * ```typescript
 * const ctx = parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
 * // { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: 1 }
 * ```
 */
export function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split("-");
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;
  if (version !== "00" || !traceId || !spanId || !flags) {
    return null;
  }

  if (traceId.length !== 32 || spanId.length !== 16 || flags.length !== 2) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}

// ============================================================================
// HTTP SERVER ADAPTER
// ============================================================================

import type { RpcServer } from "../server.js";

/**
 * Create HTTP request handler for RPC server.
 * Can be used with Hono, Express, or any HTTP framework.
 *
 * @param server - The RPC server to handle requests
 * @returns Request handler function for HTTP frameworks
 *
 * @example
 * ```typescript
 * const handler = createHttpHandler(rpcServer);
 * // With Hono
 * app.post('/rpc', (c) => handler(c.req.raw));
 * ```
 */
export function createHttpHandler(server: RpcServer) {
  return async (request: Request): Promise<Response> => {
    try {
      // Parse request body
      const contentType = request.headers.get("Content-Type") ?? "application/json";
      let body: unknown;

      if (contentType.includes("msgpack")) {
        const buffer = await request.arrayBuffer();
        // For msgpack, we'd need to decode - using JSON for now
        body = JSON.parse(new TextDecoder().decode(buffer));
      } else {
        body = await request.json();
      }

      const rpcRequest = body as RpcRequest;

      // Parse trace context
      const traceparent = request.headers.get("traceparent");
      if (traceparent) {
        const traceContext = parseTraceparent(traceparent);
        if (traceContext) {
          const tracestate = request.headers.get("tracestate");
          if (tracestate) {
            traceContext.traceState = tracestate;
          }
          rpcRequest.traceContext = traceContext;
        }
      }

      // Handle request
      const response = await server.handle(rpcRequest);

      // Return response
      return new Response(JSON.stringify(response), {
        status: response.success ? 200 : getHttpStatus(response.error?.code),
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": rpcRequest.id,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message,
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

/**
 * Map error code to HTTP status
 */
function getHttpStatus(code?: string): number {
  switch (code) {
    case "METHOD_NOT_FOUND":
    case "SERVICE_NOT_FOUND":
      return 404;
    case "VERSION_MISMATCH":
    case "VALIDATION_ERROR":
    case "SERIALIZATION_ERROR":
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
