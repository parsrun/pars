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
 * Log levels
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

export type LogLevelName = keyof typeof LogLevel;
export type LogLevelValue = (typeof LogLevel)[LogLevelName];

/**
 * Error info structure
 */
export interface ErrorInfo {
  name: string;
  message: string;
  stack: string | undefined;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevelName;
  levelValue: LogLevelValue;
  message: string;
  timestamp: string;
  context: Record<string, unknown> | undefined;
  error: ErrorInfo | undefined;
}


/**
 * Logger configuration
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
 * Logger class
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

  trace(message: string, context?: Record<string, unknown>): void {
    this.log("TRACE", message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("DEBUG", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("WARN", message, context);
  }

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : undefined;
    const ctx = error instanceof Error ? context : (error as Record<string, unknown> | undefined);
    this.log("ERROR", message, ctx, err);
  }

  fatal(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : undefined;
    const ctx = error instanceof Error ? context : (error as Record<string, unknown> | undefined);
    this.log("FATAL", message, ctx, err);
  }
}

/**
 * Create a logger instance
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Utility: Log error with proper formatting
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
 * Utility: Measure execution time
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
 * Utility: Create request logger middleware context
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
