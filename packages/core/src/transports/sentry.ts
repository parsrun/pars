/**
 * @parsrun/core - Sentry Transport
 * Error tracking transport for Sentry
 *
 * Supports two modes:
 * 1. HTTP API mode (default) - Zero dependency, works on all runtimes
 * 2. SDK mode (BYOS) - Full features with user-provided Sentry SDK
 *
 * @example HTTP API mode (simple, universal)
 * ```typescript
 * const sentry = new SentryTransport({
 *   dsn: 'https://xxx@sentry.io/123',
 *   environment: 'production',
 * });
 * ```
 *
 * @example SDK mode (full features)
 * ```typescript
 * import * as Sentry from '@sentry/cloudflare'; // or @sentry/node
 *
 * Sentry.init({ dsn: '...' });
 *
 * const sentry = new SentryTransport({
 *   client: Sentry,
 * });
 * ```
 */

import type { LogEntry } from "../logger.js";
import type {
  LogTransport,
  ErrorTransport,
  ErrorContext,
  ErrorUser,
  Breadcrumb,
  BaseTransportOptions,
} from "./types.js";

/**
 * Sentry SDK interface (minimal interface for BYOS)
 * Compatible with @sentry/node, @sentry/cloudflare, @sentry/browser, etc.
 */
export interface SentryClient {
  captureException(error: Error, hint?: unknown): string;
  captureMessage(message: string, level?: string): string;
  withScope(callback: (scope: SentryScope) => void): void;
  flush?(timeout?: number): Promise<boolean>;
}

export interface SentryScope {
  setTag(key: string, value: string): void;
  setUser(user: { id: string; email?: string; [key: string]: unknown } | null): void;
  setExtra(key: string, value: unknown): void;
  setExtras(extras: Record<string, unknown>): void;
  setLevel(level: string): void;
  addBreadcrumb(breadcrumb: unknown): void;
}

/**
 * Parsed DSN components
 */
interface ParsedDSN {
  protocol: string;
  publicKey: string;
  host: string;
  projectId: string;
}

/**
 * Sentry transport options
 */
export interface SentryTransportOptions extends BaseTransportOptions {
  /**
   * Sentry DSN (required for HTTP mode)
   * Format: https://{publicKey}@{host}/{projectId}
   */
  dsn?: string;

  /**
   * Sentry SDK client (for BYOS mode)
   * Pass your initialized Sentry client for full SDK features
   */
  client?: SentryClient;

  /** Environment name (e.g., 'production', 'staging') */
  environment?: string;

  /** Release version */
  release?: string;

  /** Server name */
  serverName?: string;

  /** Sample rate for error events (0.0 to 1.0) */
  sampleRate?: number;

  /** Additional tags to add to all events */
  tags?: Record<string, string>;

  /** Callback before sending (return null to drop event) */
  beforeSend?: (event: SentryEvent) => SentryEvent | null;

  /** Callback for transport errors */
  onError?: (error: Error) => void;
}

/**
 * Sentry event structure (simplified)
 */
export interface SentryEvent {
  event_id: string;
  timestamp: string;
  platform: string;
  level: "fatal" | "error" | "warning" | "info" | "debug";
  logger?: string;
  transaction?: string;
  server_name?: string;
  release?: string;
  environment?: string;
  message?: { formatted: string };
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: {
        frames: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
          in_app?: boolean;
        }>;
      };
    }>;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
    [key: string]: unknown;
  };
  breadcrumbs?: Array<{
    type?: string;
    category?: string;
    message?: string;
    data?: Record<string, unknown>;
    level?: string;
    timestamp?: number;
  }>;
  contexts?: Record<string, Record<string, unknown>>;
}

/**
 * Sentry Transport
 * Implements both LogTransport and ErrorTransport
 */
export class SentryTransport implements LogTransport, ErrorTransport {
  readonly name = "sentry";

  private readonly client?: SentryClient;
  private readonly dsn?: ParsedDSN;
  private readonly options: SentryTransportOptions;
  private user: ErrorUser | null = null;
  private contexts: Map<string, Record<string, unknown>> = new Map();
  private breadcrumbs: Breadcrumb[] = [];
  private readonly maxBreadcrumbs = 100;

  constructor(options: SentryTransportOptions) {
    this.options = {
      sampleRate: 1.0,
      ...options,
    };

    if (options.client) {
      this.client = options.client;
    } else if (options.dsn) {
      this.dsn = this.parseDSN(options.dsn);
    } else {
      throw new Error("SentryTransport requires either 'dsn' or 'client' option");
    }
  }

  /**
   * Parse Sentry DSN
   */
  private parseDSN(dsn: string): ParsedDSN {
    const match = dsn.match(/^(https?):\/\/([^@]+)@([^/]+)\/(.+)$/);
    if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
      throw new Error(`Invalid Sentry DSN: ${dsn}`);
    }
    return {
      protocol: match[1],
      publicKey: match[2],
      host: match[3],
      projectId: match[4],
    };
  }

  /**
   * LogTransport implementation
   * Only sends ERROR and FATAL level logs
   */
  log(entry: LogEntry): void {
    if (this.options.enabled === false) return;

    // Only capture errors
    if (entry.levelValue < 50) return; // ERROR = 50, FATAL = 60

    if (entry.error) {
      const error = new Error(entry.error.message);
      error.name = entry.error.name;
      if (entry.error.stack) {
        error.stack = entry.error.stack;
      }

      this.captureException(
        error,
        entry.context ? { extra: entry.context } : undefined
      );
    } else {
      this.captureMessage(
        entry.message,
        entry.level === "FATAL" ? "error" : "warning",
        entry.context ? { extra: entry.context } : undefined
      );
    }
  }

  /**
   * Capture an exception
   */
  captureException(error: Error, context?: ErrorContext): void {
    if (this.options.enabled === false) return;
    if (!this.shouldSample()) return;

    if (this.client) {
      this.captureWithSdk(error, context);
    } else {
      this.captureWithHttp(error, context);
    }
  }

  /**
   * Capture a message
   */
  captureMessage(
    message: string,
    level: "info" | "warning" | "error",
    context?: ErrorContext
  ): void {
    if (this.options.enabled === false) return;
    if (!this.shouldSample()) return;

    if (this.client) {
      this.client.withScope((scope) => {
        this.applyContext(scope, context);
        scope.setLevel(level);
        this.client!.captureMessage(message, level);
      });
    } else {
      this.sendHttpEvent({
        level: level === "warning" ? "warning" : level === "info" ? "info" : "error",
        message: { formatted: message },
        ...this.buildEventContext(context),
      });
    }
  }

  /**
   * Set user context
   */
  setUser(user: ErrorUser | null): void {
    this.user = user;
  }

  /**
   * Set custom context
   */
  setContext(name: string, context: Record<string, unknown>): void {
    this.contexts.set(name, context);
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb: Breadcrumb): void {
    this.breadcrumbs.push({
      ...breadcrumb,
      timestamp: breadcrumb.timestamp ?? Date.now() / 1000,
    });

    // Keep only last N breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    if (this.client?.flush) {
      await this.client.flush(2000);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private shouldSample(): boolean {
    const rate = this.options.sampleRate ?? 1.0;
    return Math.random() < rate;
  }

  /**
   * Capture with SDK (BYOS mode)
   */
  private captureWithSdk(error: Error, context?: ErrorContext): void {
    this.client!.withScope((scope) => {
      this.applyContext(scope, context);
      this.client!.captureException(error);
    });
  }

  /**
   * Apply context to SDK scope
   */
  private applyContext(scope: SentryScope, context?: ErrorContext): void {
    // User
    if (this.user) {
      scope.setUser(this.user);
    } else if (context?.userId) {
      scope.setUser({ id: context.userId });
    }

    // Tags
    if (this.options.tags) {
      for (const [key, value] of Object.entries(this.options.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.requestId) {
      scope.setTag("requestId", context.requestId);
    }
    if (context?.tenantId) {
      scope.setTag("tenantId", context.tenantId);
    }

    // Extra
    if (context?.extra) {
      scope.setExtras(context.extra);
    }

    // Breadcrumbs
    for (const bc of this.breadcrumbs) {
      scope.addBreadcrumb(bc);
    }
  }

  /**
   * Capture with HTTP API (default mode)
   */
  private captureWithHttp(error: Error, context?: ErrorContext): void {
    const stacktrace = this.parseStackTrace(error.stack);
    const exceptionValue: {
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> };
    } = {
      type: error.name,
      value: error.message,
    };

    if (stacktrace) {
      exceptionValue.stacktrace = stacktrace;
    }

    const event: Partial<SentryEvent> = {
      level: "error",
      exception: {
        values: [exceptionValue],
      },
      ...this.buildEventContext(context),
    };

    this.sendHttpEvent(event);
  }

  /**
   * Build event context for HTTP API
   */
  private buildEventContext(context?: ErrorContext): Partial<SentryEvent> {
    const event: Partial<SentryEvent> = {};

    // Environment & Release
    if (this.options.environment) {
      event.environment = this.options.environment;
    }
    if (this.options.release) {
      event.release = this.options.release;
    }
    if (this.options.serverName) {
      event.server_name = this.options.serverName;
    }

    // Tags
    const tags: Record<string, string> = { ...this.options.tags };
    if (context?.tags) {
      Object.assign(tags, context.tags);
    }
    if (context?.requestId) {
      tags["requestId"] = context.requestId;
    }
    if (context?.tenantId) {
      tags["tenantId"] = context.tenantId;
    }
    if (Object.keys(tags).length > 0) {
      event.tags = tags;
    }

    // Extra
    if (context?.extra) {
      event.extra = context.extra;
    }

    // User
    if (this.user) {
      event.user = this.user;
    } else if (context?.userId) {
      event.user = { id: context.userId };
    }

    // Breadcrumbs
    if (this.breadcrumbs.length > 0) {
      event.breadcrumbs = this.breadcrumbs.map((bc) => {
        const crumb: {
          type?: string;
          category?: string;
          message?: string;
          data?: Record<string, unknown>;
          level?: string;
          timestamp?: number;
        } = {};
        if (bc.type) crumb.type = bc.type;
        if (bc.category) crumb.category = bc.category;
        if (bc.message) crumb.message = bc.message;
        if (bc.data) crumb.data = bc.data;
        if (bc.level) crumb.level = bc.level;
        if (bc.timestamp !== undefined) crumb.timestamp = bc.timestamp;
        return crumb;
      });
    }

    // Contexts
    if (this.contexts.size > 0) {
      event.contexts = Object.fromEntries(this.contexts);
    }

    return event;
  }

  /**
   * Parse error stack trace into Sentry format
   */
  private parseStackTrace(
    stack?: string
  ): { frames: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> } | undefined {
    if (!stack) return undefined;

    const lines = stack.split("\n").slice(1); // Skip first line (error message)
    const frames: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> = [];

    for (const line of lines) {
      // Parse V8 stack trace format
      const match = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (match && match[3] && match[4]) {
        const frame: { filename?: string; function?: string; lineno?: number; colno?: number } = {
          function: match[1] || "<anonymous>",
          lineno: parseInt(match[3], 10),
          colno: parseInt(match[4], 10),
        };
        if (match[2]) {
          frame.filename = match[2];
        }
        frames.push(frame);
      }
    }

    // Sentry expects oldest frame first
    frames.reverse();

    return frames.length > 0 ? { frames } : undefined;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    // 32 character hex string
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Send event via HTTP API
   */
  private async sendHttpEvent(eventData: Partial<SentryEvent>): Promise<void> {
    if (!this.dsn) return;

    const event: SentryEvent = {
      event_id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      platform: "javascript",
      level: "error",
      ...eventData,
    };

    // Apply beforeSend hook
    if (this.options.beforeSend) {
      const result = this.options.beforeSend(event);
      if (result === null) return;
    }

    const url = `${this.dsn.protocol}://${this.dsn.host}/api/${this.dsn.projectId}/store/`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sentry-Auth": [
            "Sentry sentry_version=7",
            `sentry_client=pars-sentry/1.0.0`,
            `sentry_key=${this.dsn.publicKey}`,
          ].join(", "),
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Sentry API error: ${response.status}`);
      }
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error(String(error)));
      }
      // Silent fail - don't crash the app for logging failures
    }
  }
}

/**
 * Create Sentry transport
 */
export function createSentryTransport(options: SentryTransportOptions): SentryTransport {
  return new SentryTransport(options);
}
