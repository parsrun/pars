/**
 * @module
 * Lightweight, edge-compatible structured logging.
 * Works standalone or as abstraction over pino/winston in Node.js.
 *
 * @example
 * ```typescript
 * import { createLogger, Logger, LogLevel } from '@parsrun/core';
 *
 * // Create a logger
 * const log = createLogger({
 *   name: 'my-service',
 *   level: 'DEBUG',
 *   pretty: true
 * });
 *
 * log.info('Server started', { port: 3000 });
 * log.error('Request failed', error, { userId: '123' });
 *
 * // Create child logger with context
 * const requestLog = log.child({ requestId: 'abc123' });
 * ```
 */

import { getEnv } from "./env.js";
import { ConsoleTransport } from "./transports/console.js";
import type { LogTransport } from "./transports/types.js";

// Re-export ConsoleTransport for backward compatibility
export { ConsoleTransport, type ConsoleTransportOptions } from "./transports/console.js";

// Re-export transport types
export type { LogTransport } from "./transports/types.js";

/**
 * Log level constants mapping level names to numeric values.
 * Lower values are more verbose; higher values are more severe.
 */
export const LogLevel = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
  SILENT: 100,
} as const;

/** Log level name string literal type (TRACE, DEBUG, INFO, WARN, ERROR, FATAL, SILENT) */
export type LogLevelName = keyof typeof LogLevel;

/** Numeric log level value type */
export type LogLevelValue = (typeof LogLevel)[LogLevelName];

/**
 * Structured error information included in log entries.
 * Extracted from Error objects for serialization.
 */
export interface ErrorInfo {
  /** Error class name (e.g., "TypeError", "ValidationError") */
  name: string;
  /** Error message */
  message: string;
  /** Stack trace if available */
  stack: string | undefined;
}

/**
 * Structured log entry passed to transports.
 * Contains all information about a single log event.
 */
export interface LogEntry {
  /** Log level name */
  level: LogLevelName;
  /** Numeric log level value */
  levelValue: LogLevelValue;
  /** Log message */
  message: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Additional context data */
  context: Record<string, unknown> | undefined;
  /** Error information if an error was logged */
  error: ErrorInfo | undefined;
}


/**
 * Configuration options for creating a Logger instance.
 */
export interface LoggerConfig {
  /** Minimum log level */
  level: LogLevelName | undefined;
  /** Logger name/module */
  name: string | undefined;
  /** Base context added to all logs */
  context: Record<string, unknown> | undefined;
  /** Custom transports */
  transports: LogTransport[] | undefined;
  /** Pretty print in development */
  pretty: boolean | undefined;
  /** Redact sensitive fields */
  redact: string[] | undefined;
  /** Timestamp format */
  timestamp: boolean | (() => string) | undefined;
}


/**
 * Redact sensitive fields from context
 */
function redactFields(
  obj: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result = { ...obj };
  for (const field of fields) {
    if (field in result) {
      result[field] = "[REDACTED]";
    }
    // Handle nested fields like "user.password"
    const parts = field.split(".");
    if (parts.length > 1) {
      let current: Record<string, unknown> | undefined = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part && current && typeof current === "object" && part in current) {
          const val = current[part];
          if (val && typeof val === "object") {
            current = val as Record<string, unknown>;
          } else {
            current = undefined;
            break;
          }
        } else {
          current = undefined;
          break;
        }
      }
      const lastPart = parts[parts.length - 1];
      if (lastPart && current && typeof current === "object" && lastPart in current) {
        current[lastPart] = "[REDACTED]";
      }
    }
  }
  return result;
}

/**
 * Default redact fields
 */
const DEFAULT_REDACT_FIELDS = [
  "password",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "authorization",
  "cookie",
  "creditCard",
  "ssn",
];

/**
 * Structured logger with support for multiple transports and redaction.
 * Thread-safe and edge-compatible.
 *
 * @example
 * ```typescript
 * const logger = new Logger({ name: 'api', level: 'DEBUG' });
 * logger.info('Request received', { path: '/users' });
 * logger.error('Request failed', new Error('Not found'), { userId: '123' });
 * ```
 */
export class Logger {
  private level: LogLevelValue;
  private name: string | undefined;
  private context: Record<string, unknown>;
  private transports: LogTransport[];
  private redactFields: string[];
  private timestampFn: () => string;

  constructor(config: Partial<LoggerConfig> = {}) {
    const levelName = config.level ?? (getEnv("LOG_LEVEL") as LogLevelName | undefined) ?? "INFO";
    this.level = LogLevel[levelName] ?? LogLevel.INFO;
    this.name = config.name;
    this.context = config.context ?? {};
    this.transports = config.transports ?? [
      new ConsoleTransport(
        config.pretty !== undefined ? { pretty: config.pretty } : {}
      ),
    ];
    this.redactFields = [...DEFAULT_REDACT_FIELDS, ...(config.redact ?? [])];

    if (config.timestamp === false) {
      this.timestampFn = () => "";
    } else if (typeof config.timestamp === "function") {
      this.timestampFn = config.timestamp;
    } else {
      this.timestampFn = () => new Date().toISOString();
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    const levelEntry = Object.entries(LogLevel).find(([_, v]) => v === this.level);
    const levelName = levelEntry ? (levelEntry[0] as LogLevelName) : "INFO";

    const child = new Logger({
      level: levelName,
      name: this.name,
      context: { ...this.context, ...context },
      transports: this.transports,
      redact: this.redactFields,
    });
    return child;
  }

  /**
   * Log a message
   */
  private log(
    level: LogLevelName,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    const levelValue = LogLevel[level];
    if (levelValue < this.level) return;

    let finalContext = { ...this.context };
    if (this.name) {
      finalContext["module"] = this.name;
    }
    if (context) {
      finalContext = { ...finalContext, ...context };
    }

    // Redact sensitive fields
    finalContext = redactFields(finalContext, this.redactFields);

    const entry: LogEntry = {
      level,
      levelValue,
      message,
      timestamp: this.timestampFn(),
      context: Object.keys(finalContext).length > 0 ? finalContext : undefined,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    for (const transport of this.transports) {
      transport.log(entry);
    }
  }

  /**
   * Log a trace message (most verbose level).
   * @param message - Log message
   * @param context - Optional context data
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log("TRACE", message, context);
  }

  /**
   * Log a debug message.
   * @param message - Log message
   * @param context - Optional context data
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log("DEBUG", message, context);
  }

  /**
   * Log an informational message.
   * @param message - Log message
   * @param context - Optional context data
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  /**
   * Log a warning message.
   * @param message - Log message
   * @param context - Optional context data
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  /**
   * Log an error message with optional Error object.
   * @param message - Log message
   * @param error - Optional Error object or context
   * @param context - Optional additional context
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : undefined;
    const ctx = error instanceof Error ? context : (error as Record<string, unknown> | undefined);
    this.log("ERROR", message, ctx, err);
  }

  /**
   * Log a fatal error message (most severe level).
   * @param message - Log message
   * @param error - Optional Error object or context
   * @param context - Optional additional context
   */
  fatal(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : undefined;
    const ctx = error instanceof Error ? context : (error as Record<string, unknown> | undefined);
    this.log("FATAL", message, ctx, err);
  }
}

/**
 * Create a new Logger instance with the specified configuration.
 *
 * @param config - Logger configuration options
 * @returns A new Logger instance
 *
 * @example
 * ```typescript
 * const log = createLogger({
 *   name: 'my-service',
 *   level: 'DEBUG',
 *   pretty: true
 * });
 * ```
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

/**
 * Default logger instance using default configuration.
 * Level can be controlled via LOG_LEVEL environment variable.
 */
export const logger = createLogger();

/**
 * Utility function to log an error with proper formatting.
 * Handles both Error objects and unknown error types.
 *
 * @param log - The logger instance to use
 * @param error - The error to log
 * @param message - Human-readable error message
 * @param context - Optional additional context
 *
 * @example
 * ```typescript
 * try {
 *   await doSomething();
 * } catch (error) {
 *   logError(logger, error, 'Operation failed', { userId });
 * }
 * ```
 */
export function logError(
  log: Logger,
  error: unknown,
  message: string,
  context?: Record<string, unknown>
): void {
  if (error instanceof Error) {
    log.error(message, error, context);
  } else {
    log.error(message, { error: String(error), ...context });
  }
}

/**
 * Measure and log the execution time of an async operation.
 * Logs completion time on success, or error details on failure.
 *
 * @param log - The logger instance to use
 * @param operation - Name of the operation being measured
 * @param fn - Async function to execute and measure
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const users = await measureTime(logger, 'fetchUsers', async () => {
 *   return await db.users.findMany();
 * });
 * // Logs: "fetchUsers completed" { operation: 'fetchUsers', durationMs: 45 }
 * ```
 */
export async function measureTime<T>(
  log: Logger,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    log.info(`${operation} completed`, { operation, durationMs: duration });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logError(log, error, `${operation} failed`, { operation, durationMs: duration });
    throw error;
  }
}

/**
 * Create a child logger with request context for HTTP request logging.
 * Automatically extracts the pathname from the URL.
 *
 * @param baseLogger - The parent logger instance
 * @param request - Request information to include in all logs
 * @returns A child Logger with request context
 *
 * @example
 * ```typescript
 * const requestLog = createRequestLogger(logger, {
 *   requestId: 'abc-123',
 *   method: 'GET',
 *   url: 'https://api.example.com/users',
 *   userId: 'user-456'
 * });
 * requestLog.info('Processing request');
 * // Includes: requestId, method, path, userId in all logs
 * ```
 */
export function createRequestLogger(
  baseLogger: Logger,
  request: {
    method?: string;
    url?: string;
    requestId?: string;
    userId?: string;
    tenantId?: string;
  }
): Logger {
  const pathname = request.url ? new URL(request.url).pathname : undefined;
  return baseLogger.child({
    requestId: request.requestId,
    method: request.method,
    path: pathname,
    userId: request.userId,
    tenantId: request.tenantId,
  });
}
