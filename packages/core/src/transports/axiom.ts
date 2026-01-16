/**
 * @parsrun/core - Axiom Transport
 *
 * Log ingestion transport for Axiom (axiom.co).
 * Uses native fetch - works on all runtimes (Node, Deno, Bun, Workers).
 *
 * @example
 * ```typescript
 * import { createLogger, AxiomTransport } from '@parsrun/core';
 *
 * const axiom = new AxiomTransport({
 *   token: process.env.AXIOM_TOKEN!,
 *   dataset: 'my-app-logs',
 *   batchSize: 100,      // Send every 100 logs
 *   flushInterval: 5000, // Or every 5 seconds
 * });
 *
 * const logger = createLogger({
 *   transports: [axiom]
 * });
 * ```
 */

import type { LogEntry } from "../logger.js";
import type { LogTransport, BatchTransportOptions } from "./types.js";

/**
 * Axiom transport options
 */
export interface AxiomTransportOptions extends BatchTransportOptions {
  /** Axiom API token */
  token: string;
  /** Dataset name to ingest logs into */
  dataset: string;
  /** Organization ID (optional, for personal tokens) */
  orgId?: string;
  /** Custom Axiom API URL (default: https://api.axiom.co) */
  apiUrl?: string;
  /** Callback for errors during ingestion */
  onError?: (error: Error, droppedCount: number) => void;
}

/**
 * Axiom log event structure
 */
interface AxiomEvent {
  _time: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Axiom Transport
 * Batches logs and sends them to Axiom's ingest API
 */
export class AxiomTransport implements LogTransport {
  readonly name = "axiom";

  private buffer: AxiomEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private readonly options: Required<
    Pick<AxiomTransportOptions, "batchSize" | "flushInterval" | "apiUrl">
  > &
    AxiomTransportOptions;

  constructor(options: AxiomTransportOptions) {
    this.options = {
      batchSize: 100,
      flushInterval: 5000,
      apiUrl: "https://api.axiom.co",
      ...options,
    };

    // Start flush interval if enabled
    if (this.options.flushInterval > 0) {
      this.flushTimer = setInterval(
        () => this.flush(),
        this.options.flushInterval
      );
    }
  }

  log(entry: LogEntry): void {
    if (this.options.enabled === false) return;

    const event: AxiomEvent = {
      _time: entry.timestamp,
      level: entry.level,
      message: entry.message,
    };

    // Add context fields
    if (entry.context) {
      Object.assign(event, entry.context);
    }

    // Add error fields
    if (entry.error) {
      event["error.name"] = entry.error.name;
      event["error.message"] = entry.error.message;
      event["error.stack"] = entry.error.stack;
    }

    this.buffer.push(event);

    // Flush if buffer is full
    if (this.buffer.length >= this.options.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    // Prevent concurrent flushes
    if (this.isFlushing || this.buffer.length === 0) return;

    this.isFlushing = true;
    const events = this.buffer;
    this.buffer = [];

    try {
      const response = await fetch(
        `${this.options.apiUrl}/v1/datasets/${this.options.dataset}/ingest`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.token}`,
            "Content-Type": "application/json",
            ...(this.options.orgId && {
              "X-Axiom-Org-Id": this.options.orgId,
            }),
          },
          body: JSON.stringify(events),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Axiom ingest failed: ${response.status} ${errorText}`);
      }
    } catch (error) {
      // Call error handler if provided
      if (this.options.onError) {
        this.options.onError(
          error instanceof Error ? error : new Error(String(error)),
          events.length
        );
      } else {
        // Silent fail by default - don't crash the app for logging failures
        console.error("[Axiom] Failed to send logs:", error);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  async close(): Promise<void> {
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();
  }
}

/**
 * Create an Axiom transport instance.
 *
 * @param options - Axiom transport configuration
 * @returns A new AxiomTransport instance
 *
 * @example
 * ```typescript
 * const axiom = createAxiomTransport({
 *   token: 'xaat-xxx',
 *   dataset: 'logs'
 * });
 * ```
 */
export function createAxiomTransport(
  options: AxiomTransportOptions
): AxiomTransport {
  return new AxiomTransport(options);
}
