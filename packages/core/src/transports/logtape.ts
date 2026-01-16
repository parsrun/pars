/**
 * @parsrun/core - Logtape Transport
 * Structured logging transport for Logtape (@logtape/logtape)
 *
 * Logtape is a TypeScript-first structured logging library.
 * This transport bridges Pars Logger to Logtape for advanced logging scenarios.
 *
 * @example BYOS (Bring Your Own SDK)
 * ```typescript
 * import { getLogger, configure } from '@logtape/logtape';
 *
 * // Configure Logtape
 * await configure({
 *   sinks: { console: consoleSink() },
 *   loggers: [{ category: 'pars', sinks: ['console'], level: 'info' }],
 * });
 *
 * const logtapeLogger = getLogger('pars');
 * const transport = new LogtapeTransport({ logger: logtapeLogger });
 * ```
 *
 * @example Simple mode (creates internal logger)
 * ```typescript
 * const transport = new LogtapeTransport({
 *   category: 'my-app',
 * });
 * ```
 */

import type { LogEntry, LogLevelName } from "../logger.js";
import type { LogTransport, BaseTransportOptions } from "./types.js";

/**
 * Logtape Logger interface (minimal interface for BYOS)
 * Compatible with @logtape/logtape getLogger() return type
 */
export interface LogtapeLogger {
  debug(message: string, properties?: Record<string, unknown>): void;
  info(message: string, properties?: Record<string, unknown>): void;
  warn(message: string, properties?: Record<string, unknown>): void;
  warning(message: string, properties?: Record<string, unknown>): void;
  error(message: string, properties?: Record<string, unknown>): void;
  fatal(message: string, properties?: Record<string, unknown>): void;
}

/**
 * Level mapping from Pars to Logtape
 */
type LogtapeLevel = "debug" | "info" | "warning" | "error" | "fatal";

/**
 * Logtape transport options
 */
export interface LogtapeTransportOptions extends BaseTransportOptions {
  /**
   * Logtape logger instance (for BYOS mode)
   * Get this from @logtape/logtape's getLogger()
   */
  logger?: LogtapeLogger;

  /**
   * Category name for the logger
   * Only used if logger is not provided (creates a simple fallback logger)
   */
  category?: string;

  /**
   * Include timestamp in properties
   * @default true
   */
  includeTimestamp?: boolean;

  /**
   * Include level value in properties
   * @default false
   */
  includeLevelValue?: boolean;
}

/**
 * Simple fallback logger when no Logtape instance is provided
 * Just outputs structured JSON - users should use BYOS for full features
 */
class FallbackLogger implements LogtapeLogger {
  constructor(private category: string) {}

  private log(level: string, message: string, properties?: Record<string, unknown>): void {
    const entry = {
      level,
      category: this.category,
      msg: message,
      time: new Date().toISOString(),
      ...properties,
    };
    console.log(JSON.stringify(entry));
  }

  debug(message: string, properties?: Record<string, unknown>): void {
    this.log("debug", message, properties);
  }

  info(message: string, properties?: Record<string, unknown>): void {
    this.log("info", message, properties);
  }

  warn(message: string, properties?: Record<string, unknown>): void {
    this.log("warn", message, properties);
  }

  warning(message: string, properties?: Record<string, unknown>): void {
    this.log("warning", message, properties);
  }

  error(message: string, properties?: Record<string, unknown>): void {
    this.log("error", message, properties);
  }

  fatal(message: string, properties?: Record<string, unknown>): void {
    this.log("fatal", message, properties);
  }
}

/**
 * Logtape Transport
 * Bridges Pars Logger to Logtape
 */
export class LogtapeTransport implements LogTransport {
  readonly name = "logtape";

  private readonly logger: LogtapeLogger;
  private readonly includeTimestamp: boolean;
  private readonly includeLevelValue: boolean;
  private readonly enabled: boolean;

  constructor(options: LogtapeTransportOptions = {}) {
    this.enabled = options.enabled !== false;
    this.includeTimestamp = options.includeTimestamp !== false;
    this.includeLevelValue = options.includeLevelValue ?? false;

    if (options.logger) {
      this.logger = options.logger;
    } else {
      // Create fallback logger
      this.logger = new FallbackLogger(options.category ?? "pars");
    }
  }

  log(entry: LogEntry): void {
    if (!this.enabled) return;

    const level = this.mapLevel(entry.level);
    const properties = this.buildProperties(entry);

    // Call the appropriate log method
    this.logger[level](entry.message, properties);
  }

  /**
   * Map Pars log level to Logtape level
   */
  private mapLevel(level: LogLevelName): LogtapeLevel {
    const mapping: Record<LogLevelName, LogtapeLevel> = {
      TRACE: "debug",
      DEBUG: "debug",
      INFO: "info",
      WARN: "warning",
      ERROR: "error",
      FATAL: "fatal",
      SILENT: "debug", // Should never be logged
    };
    return mapping[level];
  }

  /**
   * Build properties object for Logtape
   */
  private buildProperties(entry: LogEntry): Record<string, unknown> {
    const properties: Record<string, unknown> = {};

    // Add timestamp if enabled
    if (this.includeTimestamp) {
      properties["timestamp"] = entry.timestamp;
    }

    // Add level value if enabled
    if (this.includeLevelValue) {
      properties["levelValue"] = entry.levelValue;
    }

    // Add context
    if (entry.context) {
      Object.assign(properties, entry.context);
    }

    // Add error info
    if (entry.error) {
      properties["error"] = {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack,
      };
    }

    return properties;
  }
}

/**
 * Create a Logtape transport instance.
 *
 * @param options - Logtape transport configuration
 * @returns A new LogtapeTransport instance
 *
 * @example
 * ```typescript
 * import { getLogger } from '@logtape/logtape';
 *
 * const transport = createLogtapeTransport({
 *   logger: getLogger('my-app')
 * });
 * ```
 */
export function createLogtapeTransport(
  options?: LogtapeTransportOptions
): LogtapeTransport {
  return new LogtapeTransport(options);
}
