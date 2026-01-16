/**
 * @parsrun/service - RPC Client
 * Client for making RPC calls to services
 */

import { generateId } from "@parsrun/core";
import type {
  RpcRequest,
  RpcTransport,
  RpcMetadata,
  TraceContext,
  ServiceConfig,
} from "../types.js";
import { mergeConfig } from "../config.js";
import { TimeoutError, toRpcError } from "./errors.js";
import {
  CircuitBreaker,
  Bulkhead,
  withRetry,
  withTimeout,
} from "../resilience/index.js";

// ============================================================================
// RPC CLIENT
// ============================================================================

export interface RpcClientOptions {
  /** Service name */
  service: string;
  /** RPC transport */
  transport: RpcTransport;
  /** Service configuration */
  config?: ServiceConfig;
  /** Default metadata for all requests */
  defaultMetadata?: RpcMetadata;
}

/**
 * RPC Client for making service calls
 */
export class RpcClient {
  private readonly service: string;
  private readonly transport: RpcTransport;
  private readonly config: Required<ServiceConfig>;
  private readonly defaultMetadata: RpcMetadata;
  private readonly circuitBreaker: CircuitBreaker | null;
  private readonly bulkhead: Bulkhead | null;

  constructor(options: RpcClientOptions) {
    this.service = options.service;
    this.transport = options.transport;
    this.config = mergeConfig(options.config);
    this.defaultMetadata = options.defaultMetadata ?? {};

    // Initialize circuit breaker
    const cbConfig = this.config.resilience?.circuitBreaker;
    if (
      cbConfig &&
      cbConfig.enabled &&
      cbConfig.failureThreshold !== undefined &&
      cbConfig.resetTimeout !== undefined &&
      cbConfig.successThreshold !== undefined
    ) {
      this.circuitBreaker = new CircuitBreaker({
        failureThreshold: cbConfig.failureThreshold,
        resetTimeout: cbConfig.resetTimeout,
        successThreshold: cbConfig.successThreshold,
      });
    } else {
      this.circuitBreaker = null;
    }

    // Initialize bulkhead
    const bhConfig = this.config.resilience?.bulkhead;
    if (bhConfig && bhConfig.maxConcurrent !== undefined && bhConfig.maxQueue !== undefined) {
      this.bulkhead = new Bulkhead({
        maxConcurrent: bhConfig.maxConcurrent,
        maxQueue: bhConfig.maxQueue,
      });
    } else {
      this.bulkhead = null;
    }
  }

  /**
   * Execute a query
   */
  async query<TInput, TOutput>(
    method: string,
    input: TInput,
    options?: CallOptions
  ): Promise<TOutput> {
    return this.call<TInput, TOutput>("query", method, input, options);
  }

  /**
   * Execute a mutation
   */
  async mutate<TInput, TOutput>(
    method: string,
    input: TInput,
    options?: CallOptions
  ): Promise<TOutput> {
    return this.call<TInput, TOutput>("mutation", method, input, options);
  }

  /**
   * Internal call implementation
   */
  private async call<TInput, TOutput>(
    type: "query" | "mutation",
    method: string,
    input: TInput,
    options?: CallOptions
  ): Promise<TOutput> {
    const request: RpcRequest<TInput> = {
      id: generateId(),
      service: this.service,
      method,
      type,
      input,
      metadata: {
        ...this.defaultMetadata,
        ...options?.metadata,
      },
    };

    const version = options?.version ?? this.config.versioning.defaultVersion;
    if (version) {
      request.version = version;
    }
    if (options?.traceContext) {
      request.traceContext = options.traceContext;
    }

    const timeout = options?.timeout ?? this.config.resilience.timeout ?? 30_000;
    const retryConfig = options?.retry ?? this.config.resilience.retry;

    // Build the execution chain
    let execute = async (): Promise<TOutput> => {
      const response = await this.transport.call<TInput, TOutput>(request);

      if (!response.success) {
        const error = toRpcError(
          new Error(response.error?.message ?? "Unknown error")
        );
        throw error;
      }

      return response.output as TOutput;
    };

    // Wrap with timeout
    execute = withTimeout(execute, timeout, () => {
      throw new TimeoutError(this.service, method, timeout);
    });

    // Wrap with retry
    const attempts = retryConfig?.attempts ?? 0;
    if (attempts > 0) {
      execute = withRetry(execute, {
        attempts,
        backoff: retryConfig?.backoff ?? "exponential",
        initialDelay: retryConfig?.initialDelay ?? 100,
        maxDelay: retryConfig?.maxDelay ?? 5000,
        shouldRetry: (error) => {
          if (error instanceof Error && "retryable" in error) {
            return (error as { retryable: boolean }).retryable;
          }
          return false;
        },
      });
    }

    // Wrap with circuit breaker
    if (this.circuitBreaker) {
      const cb = this.circuitBreaker;
      const originalExecute = execute;
      execute = async () => {
        return cb.execute(originalExecute);
      };
    }

    // Wrap with bulkhead
    if (this.bulkhead) {
      const bh = this.bulkhead;
      const originalExecute = execute;
      execute = async () => {
        return bh.execute(originalExecute);
      };
    }

    return execute();
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): "closed" | "open" | "half-open" | null {
    return this.circuitBreaker?.state ?? null;
  }

  /**
   * Get bulkhead stats
   */
  getBulkheadStats(): { concurrent: number; queued: number } | null {
    if (!this.bulkhead) return null;
    return {
      concurrent: this.bulkhead.concurrent,
      queued: this.bulkhead.queued,
    };
  }

  /**
   * Close the client and release resources
   */
  async close(): Promise<void> {
    await this.transport.close?.();
  }
}

/**
 * Call options
 */
export interface CallOptions {
  /** Timeout in ms */
  timeout?: number;
  /** Version requirement */
  version?: string;
  /** Trace context */
  traceContext?: TraceContext;
  /** Request metadata */
  metadata?: RpcMetadata;
  /** Retry configuration override */
  retry?: {
    attempts?: number;
    backoff?: "linear" | "exponential";
    initialDelay?: number;
    maxDelay?: number;
  };
}

/**
 * Create an RPC client
 */
export function createRpcClient(options: RpcClientOptions): RpcClient {
  return new RpcClient(options);
}
