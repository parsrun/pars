/**
 * @parsrun/service - RPC Errors
 */

import { ParsError } from "@parsrun/core";

/**
 * Base RPC error
 */
export class RpcError extends ParsError {
  public readonly retryable: boolean;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    options?: {
      retryable?: boolean;
      retryAfter?: number;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, code, statusCode, options?.details);
    this.name = "RpcError";
    this.retryable = options?.retryable ?? false;
    if (options?.retryAfter !== undefined) {
      this.retryAfter = options.retryAfter;
    }
  }
}

/**
 * Service not found error
 */
export class ServiceNotFoundError extends RpcError {
  constructor(serviceName: string) {
    super(`Service not found: ${serviceName}`, "SERVICE_NOT_FOUND", 404, {
      retryable: false,
      details: { service: serviceName },
    });
    this.name = "ServiceNotFoundError";
  }
}

/**
 * Method not found error
 */
export class MethodNotFoundError extends RpcError {
  constructor(serviceName: string, methodName: string) {
    super(
      `Method not found: ${serviceName}.${methodName}`,
      "METHOD_NOT_FOUND",
      404,
      {
        retryable: false,
        details: { service: serviceName, method: methodName },
      }
    );
    this.name = "MethodNotFoundError";
  }
}

/**
 * Version mismatch error
 */
export class VersionMismatchError extends RpcError {
  constructor(serviceName: string, requested: string, available: string) {
    super(
      `Version mismatch for ${serviceName}: requested ${requested}, available ${available}`,
      "VERSION_MISMATCH",
      400,
      {
        retryable: false,
        details: { service: serviceName, requested, available },
      }
    );
    this.name = "VersionMismatchError";
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends RpcError {
  constructor(serviceName: string, methodName: string, timeoutMs: number) {
    super(
      `Request to ${serviceName}.${methodName} timed out after ${timeoutMs}ms`,
      "TIMEOUT",
      504,
      {
        retryable: true,
        details: { service: serviceName, method: methodName, timeout: timeoutMs },
      }
    );
    this.name = "TimeoutError";
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitOpenError extends RpcError {
  constructor(serviceName: string, resetAfterMs: number) {
    super(
      `Circuit breaker open for ${serviceName}`,
      "CIRCUIT_OPEN",
      503,
      {
        retryable: true,
        retryAfter: Math.ceil(resetAfterMs / 1000),
        details: { service: serviceName, resetAfterMs },
      }
    );
    this.name = "CircuitOpenError";
  }
}

/**
 * Bulkhead rejected error
 */
export class BulkheadRejectedError extends RpcError {
  constructor(serviceName: string) {
    super(
      `Request rejected by bulkhead for ${serviceName}: too many concurrent requests`,
      "BULKHEAD_REJECTED",
      503,
      {
        retryable: true,
        retryAfter: 1,
        details: { service: serviceName },
      }
    );
    this.name = "BulkheadRejectedError";
  }
}

/**
 * Transport error
 */
export class TransportError extends RpcError {
  constructor(message: string, cause?: Error) {
    const options: { retryable: boolean; details?: Record<string, unknown> } = {
      retryable: true,
    };
    if (cause) {
      options.details = { cause: cause.message };
    }
    super(message, "TRANSPORT_ERROR", 502, options);
    this.name = "TransportError";
  }
}

/**
 * Serialization error
 */
export class SerializationError extends RpcError {
  constructor(message: string, cause?: Error) {
    const options: { retryable: boolean; details?: Record<string, unknown> } = {
      retryable: false,
    };
    if (cause) {
      options.details = { cause: cause.message };
    }
    super(message, "SERIALIZATION_ERROR", 400, options);
    this.name = "SerializationError";
  }
}

/**
 * Convert unknown error to RpcError
 */
export function toRpcError(error: unknown): RpcError {
  if (error instanceof RpcError) {
    return error;
  }

  if (error instanceof Error) {
    return new RpcError(error.message, "INTERNAL_ERROR", 500, {
      retryable: false,
      details: { originalError: error.name },
    });
  }

  return new RpcError(String(error), "UNKNOWN_ERROR", 500, {
    retryable: false,
  });
}
