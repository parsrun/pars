/**
 * @parsrun/service - RPC Server
 * Server for handling RPC requests
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import type {
  RpcRequest,
  RpcResponse,
  ServiceDefinition,
  TraceContext,
} from "../types.js";
import { satisfiesVersion, isMethodDeprecated, getMethodTimeout } from "../define.js";
import { MethodNotFoundError, VersionMismatchError, toRpcError } from "./errors.js";

// ============================================================================
// RPC HANDLER TYPES
// ============================================================================

/**
 * RPC handler context
 */
export interface RpcHandlerContext {
  /** Request ID */
  requestId: string;
  /** Service name */
  service: string;
  /** Method name */
  method: string;
  /** Method type */
  type: "query" | "mutation";
  /** Request metadata */
  metadata: Record<string, unknown>;
  /** Trace context */
  traceContext?: TraceContext;
  /** Logger */
  logger: Logger;
}

/**
 * RPC handler function
 */
export type RpcHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: RpcHandlerContext
) => Promise<TOutput>;

/**
 * RPC handlers record
 */
export type RpcHandlers = {
  queries?: Record<string, RpcHandler>;
  mutations?: Record<string, RpcHandler>;
};

// ============================================================================
// RPC SERVER
// ============================================================================

export interface RpcServerOptions {
  /** Service definition */
  definition: ServiceDefinition;
  /** RPC handlers */
  handlers: RpcHandlers;
  /** Logger */
  logger?: Logger;
  /** Default timeout in ms */
  defaultTimeout?: number;
  /** Middleware */
  middleware?: RpcMiddleware[];
}

/**
 * RPC middleware function
 */
export type RpcMiddleware = (
  request: RpcRequest,
  context: RpcHandlerContext,
  next: () => Promise<unknown>
) => Promise<unknown>;

/**
 * RPC Server for handling incoming requests
 */
export class RpcServer {
  private readonly definition: ServiceDefinition;
  private readonly handlers: RpcHandlers;
  private readonly logger: Logger;
  private readonly defaultTimeout: number;
  private readonly middleware: RpcMiddleware[];

  constructor(options: RpcServerOptions) {
    this.definition = options.definition;
    this.handlers = options.handlers;
    this.logger = options.logger ?? createLogger({ name: `rpc:${options.definition.name}` });
    this.defaultTimeout = options.defaultTimeout ?? 30_000;
    this.middleware = options.middleware ?? [];
  }

  /**
   * Handle an RPC request
   */
  async handle<TInput, TOutput>(request: RpcRequest<TInput>): Promise<RpcResponse<TOutput>> {
    const startTime = Date.now();
    const context: RpcHandlerContext = {
      requestId: request.id,
      service: request.service,
      method: request.method,
      type: request.type,
      metadata: request.metadata ?? {},
      logger: this.logger.child({ requestId: request.id, method: request.method }),
    };

    if (request.traceContext) {
      context.traceContext = request.traceContext;
    }

    try {
      // Check version compatibility
      if (request.version && !satisfiesVersion(this.definition.version, request.version)) {
        throw new VersionMismatchError(
          this.definition.name,
          request.version,
          this.definition.version
        );
      }

      // Get handler
      const handler = this.getHandler(request.method, request.type);
      if (!handler) {
        throw new MethodNotFoundError(this.definition.name, request.method);
      }

      // Check deprecation
      const deprecation = isMethodDeprecated(this.definition, request.method, request.type);
      if (deprecation.deprecated) {
        context.logger.warn(`Method ${request.method} is deprecated`, {
          since: deprecation.since,
          replacement: deprecation.replacement,
        });
      }

      // Build middleware chain
      const chain = this.buildMiddlewareChain(request, context, handler);

      // Execute with timeout
      const timeout = getMethodTimeout(
        this.definition,
        request.method,
        request.type,
        this.defaultTimeout
      );

      const output = await Promise.race([
        chain(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Handler timeout")), timeout)
        ),
      ]);

      const duration = Date.now() - startTime;
      context.logger.info(`${request.type} ${request.method} completed`, { durationMs: duration });

      const successResponse: RpcResponse<TOutput> = {
        id: request.id,
        success: true,
        version: this.definition.version,
        output: output as TOutput,
      };
      if (request.traceContext) {
        successResponse.traceContext = request.traceContext;
      }
      return successResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      const rpcError = toRpcError(error);

      context.logger.error(`${request.type} ${request.method} failed`, error as Error, {
        durationMs: duration,
        errorCode: rpcError.code,
      });

      const errorData: RpcResponse<TOutput>["error"] = {
        code: rpcError.code,
        message: rpcError.message,
        retryable: rpcError.retryable,
      };
      if (rpcError.details) {
        errorData!.details = rpcError.details;
      }
      if (rpcError.retryAfter !== undefined) {
        errorData!.retryAfter = rpcError.retryAfter;
      }

      const errorResponse: RpcResponse<TOutput> = {
        id: request.id,
        success: false,
        version: this.definition.version,
        error: errorData,
      };
      if (request.traceContext) {
        errorResponse.traceContext = request.traceContext;
      }
      return errorResponse;
    }
  }

  /**
   * Get handler for a method
   */
  private getHandler(method: string, type: "query" | "mutation"): RpcHandler | undefined {
    const handlers = type === "query" ? this.handlers.queries : this.handlers.mutations;
    return handlers?.[method];
  }

  /**
   * Build middleware chain
   */
  private buildMiddlewareChain(
    request: RpcRequest,
    context: RpcHandlerContext,
    handler: RpcHandler
  ): () => Promise<unknown> {
    let index = -1;

    const dispatch = async (i: number): Promise<unknown> => {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;

      if (i < this.middleware.length) {
        const mw = this.middleware[i]!;
        return mw(request, context, () => dispatch(i + 1));
      }

      return handler(request.input, context);
    };

    return () => dispatch(0);
  }

  /**
   * Get service definition
   */
  getDefinition(): ServiceDefinition {
    return this.definition;
  }

  /**
   * Get registered methods
   */
  getMethods(): { queries: string[]; mutations: string[] } {
    return {
      queries: Object.keys(this.handlers.queries ?? {}),
      mutations: Object.keys(this.handlers.mutations ?? {}),
    };
  }
}

/**
 * Create an RPC server
 */
export function createRpcServer(options: RpcServerOptions): RpcServer {
  return new RpcServer(options);
}

// ============================================================================
// BUILT-IN MIDDLEWARE
// ============================================================================

/**
 * Logging middleware
 */
export function loggingMiddleware(): RpcMiddleware {
  return async (request, context, next) => {
    context.logger.debug(`Handling ${request.type} ${request.method}`, {
      inputKeys: Object.keys(request.input as object),
    });

    const result = await next();

    context.logger.debug(`Completed ${request.type} ${request.method}`);

    return result;
  };
}

/**
 * Validation middleware (placeholder - integrate with ArkType)
 */
export function validationMiddleware(
  validators: Record<string, (input: unknown) => unknown>
): RpcMiddleware {
  return async (request, _context, next) => {
    const validator = validators[request.method];
    if (validator) {
      request.input = validator(request.input);
    }
    return next();
  };
}

/**
 * Tenant context middleware
 */
export function tenantMiddleware(): RpcMiddleware {
  return async (_request, context, next) => {
    const tenantId = context.metadata["tenantId"];
    if (tenantId) {
      context.logger = context.logger.child({ tenantId });
    }
    return next();
  };
}
