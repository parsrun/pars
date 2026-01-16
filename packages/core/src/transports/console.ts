/**
 * @parsrun/core - Console Transport
 *
 * Default log transport that outputs to the console.
 * Supports pretty printing with colors for development and JSON output for production.
 *
 * @example
 * ```typescript
 * import { ConsoleTransport } from '@parsrun/core';
 *
 * const transport = new ConsoleTransport({
 *   pretty: true,  // Enable colored, human-readable output
 *   colors: true   // Enable ANSI colors
 * });
 * ```
 */

import { runtime } from "../runtime.js";
import { isDevelopment } from "../env.js";
import type { LogEntry, LogLevelName } from "../logger.js";
import type { LogTransport } from "./types.js";

/**
 * Console transport options
 */
export interface ConsoleTransportOptions {
  /** Enable pretty printing (default: true in development) */
  pretty?: boolean;
  /** Enable ANSI colors (default: true in Node/Bun) */
  colors?: boolean;
}

/**
 * Console transport
 * Outputs logs to console with optional pretty printing and colors
 */
export class ConsoleTransport implements LogTransport {
  readonly name = "console";

  private pretty: boolean;
  private colors: boolean;

  constructor(options: ConsoleTransportOptions = {}) {
    this.pretty = options.pretty ?? isDevelopment();
    this.colors = options.colors ?? (runtime === "node" || runtime === "bun");
  }

  log(entry: LogEntry): void {
    if (this.pretty) {
      this.logPretty(entry);
    } else {
      this.logJson(entry);
    }
  }

  private logJson(entry: LogEntry): void {
    const { level, message, timestamp, context, error } = entry;

    const output: Record<string, unknown> = {
      level,
      time: timestamp,
      msg: message,
    };

    if (context && Object.keys(context).length > 0) {
      Object.assign(output, context);
    }

    if (error) {
      output["err"] = error;
    }

    console.log(JSON.stringify(output));
  }

  private logPretty(entry: LogEntry): void {
    const { level, message, timestamp, context, error } = entry;

    const levelColors: Record<LogLevelName, string> = {
      TRACE: "\x1b[90m", // Gray
      DEBUG: "\x1b[36m", // Cyan
      INFO: "\x1b[32m", // Green
      WARN: "\x1b[33m", // Yellow
      ERROR: "\x1b[31m", // Red
      FATAL: "\x1b[35m", // Magenta
      SILENT: "",
    };

    const reset = "\x1b[0m";
    const color = this.colors ? levelColors[level] : "";
    const resetCode = this.colors ? reset : "";

    // Extract time part from ISO timestamp
    const timePart = timestamp.split("T")[1];
    const time = timePart ? timePart.slice(0, 8) : timestamp;

    let output = `${color}[${time}] ${level.padEnd(5)}${resetCode} ${message}`;

    if (context && Object.keys(context).length > 0) {
      output += ` ${JSON.stringify(context)}`;
    }

    // Route to appropriate console method
    if (level === "ERROR" || level === "FATAL") {
      console.error(output);
      if (error?.stack) {
        console.error(error.stack);
      }
    } else if (level === "WARN") {
      console.warn(output);
    } else if (level === "DEBUG" || level === "TRACE") {
      console.debug(output);
    } else {
      console.log(output);
    }
  }
}
