/**
 * @parsrun/core - Transport Types
 * Interfaces for log and error transports
 */

import type { LogEntry } from "../logger.js";

/**
 * Log transport interface
 * Implement this to create custom log destinations
 */
export interface LogTransport {
  /** Transport name for identification */
  readonly name: string;

  /**
   * Log an entry
   * Can be sync or async - async transports should handle their own buffering
   */
  log(entry: LogEntry): void | Promise<void>;

  /**
   * Flush any buffered logs
   * Called on graceful shutdown
   */
  flush?(): Promise<void>;

  /**
   * Close the transport and release resources
   */
  close?(): Promise<void>;
}

/**
 * Error context for error transports
 */
export interface ErrorContext {
  /** Request correlation ID */
  requestId?: string;
  /** User ID */
  userId?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Custom tags for filtering */
  tags?: Record<string, string>;
  /** Extra context data */
  extra?: Record<string, unknown>;
  /** Error fingerprint for grouping */
  fingerprint?: string[];
}

/**
 * User context for error transports
 */
export interface ErrorUser {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

/**
 * Error transport interface
 * Implement this for error tracking services (Sentry, etc.)
 */
export interface ErrorTransport {
  /** Transport name for identification */
  readonly name: string;

  /**
   * Capture an exception
   */
  captureException(
    error: Error,
    context?: ErrorContext
  ): void | Promise<void>;

  /**
   * Capture a message
   */
  captureMessage(
    message: string,
    level: "info" | "warning" | "error",
    context?: ErrorContext
  ): void | Promise<void>;

  /**
   * Set user context for subsequent events
   */
  setUser?(user: ErrorUser | null): void;

  /**
   * Set custom context
   */
  setContext?(name: string, context: Record<string, unknown>): void;

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb?(breadcrumb: Breadcrumb): void;

  /**
   * Flush pending events
   */
  flush?(): Promise<void>;
}

/**
 * Breadcrumb for error context trail
 */
export interface Breadcrumb {
  type?: "default" | "http" | "navigation" | "user" | "debug" | "error";
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  level?: "debug" | "info" | "warning" | "error";
  timestamp?: number;
}

/**
 * Combined transport that implements both log and error transport
 */
export interface CombinedTransport extends LogTransport, ErrorTransport {}

/**
 * Transport options common to all transports
 */
export interface BaseTransportOptions {
  /** Minimum log level to transport */
  minLevel?: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  /** Enable/disable the transport */
  enabled?: boolean;
}

/**
 * Batch transport options for transports that buffer logs
 */
export interface BatchTransportOptions extends BaseTransportOptions {
  /** Maximum number of entries to buffer before flushing */
  batchSize?: number;
  /** Flush interval in milliseconds */
  flushInterval?: number;
  /** Maximum time to wait before dropping old entries */
  maxRetention?: number;
}
