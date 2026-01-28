/**
 * @parsrun/sms - Console Provider
 * Development provider that logs SMS to console instead of sending
 */

import type {
  BatchSMSOptions,
  BatchSMSResult,
  SMSOptions,
  SMSProvider,
  SMSProviderConfig,
  SMSResult,
} from "../types.js";

/**
 * Console SMS Provider
 * Logs SMS messages to console for development/testing
 *
 * @example
 * ```typescript
 * const sms = new ConsoleProvider({ from: 'TEST' });
 *
 * await sms.send({
 *   to: '905551234567',
 *   message: 'Test message',
 * });
 * // Logs: [SMS] To: 905551234567, From: TEST, Message: Test message
 * ```
 */
export class ConsoleProvider implements SMSProvider {
  /** Provider type identifier */
  readonly type = "console" as const;

  private from: string;
  private delay: number;

  /**
   * Creates a new ConsoleProvider instance.
   *
   * @param config - The provider configuration
   */
  constructor(config: SMSProviderConfig & { delay?: number }) {
    this.from = config.from || "CONSOLE";
    this.delay = config.delay ?? 100; // Simulate network delay
  }

  /**
   * Logs an SMS message to the console.
   *
   * @param options - The SMS options
   * @returns A promise that resolves to a successful result
   */
  async send(options: SMSOptions): Promise<SMSResult> {
    // Simulate network delay
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    const from = options.from || this.from;
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    console.log("\n" + "─".repeat(50));
    console.log("📱 SMS (Console Provider)");
    console.log("─".repeat(50));
    console.log(`To:      ${options.to}`);
    console.log(`From:    ${from}`);
    console.log(`Message: ${options.message}`);
    if (options.tags) {
      console.log(`Tags:    ${JSON.stringify(options.tags)}`);
    }
    console.log(`ID:      ${messageId}`);
    console.log("─".repeat(50) + "\n");

    return {
      success: true,
      messageId,
      data: { provider: "console", logged: true },
    };
  }

  /**
   * Logs multiple SMS messages to the console.
   *
   * @param options - The batch SMS options
   * @returns A promise that resolves to the batch result
   */
  async sendBatch(options: BatchSMSOptions): Promise<BatchSMSResult> {
    const results: SMSResult[] = [];

    for (const sms of options.messages) {
      const result = await this.send(sms);
      results.push(result);
    }

    return {
      total: options.messages.length,
      successful: options.messages.length,
      failed: 0,
      results,
    };
  }

  /**
   * Always returns true for console provider.
   */
  async verify(): Promise<boolean> {
    return true;
  }
}

/**
 * Creates a Console provider instance.
 *
 * @param config - The provider configuration
 * @returns A new ConsoleProvider instance
 */
export function createConsoleProvider(
  config?: SMSProviderConfig & { delay?: number }
): ConsoleProvider {
  return new ConsoleProvider(config || {});
}
