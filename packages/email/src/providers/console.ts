/**
 * @parsrun/email - Console Provider
 * Development/testing email provider that logs to console
 */

import type {
  BatchEmailOptions,
  BatchEmailResult,
  EmailAddress,
  EmailOptions,
  EmailProvider,
  EmailProviderConfig,
  EmailResult,
} from "../types.js";

/**
 * Console Email Provider
 * Logs emails to console instead of sending them.
 * Useful for development and testing.
 *
 * @example
 * ```typescript
 * const console = new ConsoleProvider({
 *   apiKey: 'not-needed',
 *   fromEmail: 'test@example.com',
 *   fromName: 'Test App',
 * });
 *
 * await console.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World!</p>',
 * });
 * // Logs email details to console
 * ```
 */
export class ConsoleProvider implements EmailProvider {
  readonly type = "console" as const;

  private fromEmail: string;
  private fromName: string | undefined;
  private messageCounter = 0;

  constructor(config: EmailProviderConfig) {
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName;
  }

  private formatAddress(address: string | EmailAddress): string {
    if (typeof address === "string") {
      return address;
    }
    if (address.name) {
      return `${address.name} <${address.email}>`;
    }
    return address.email;
  }

  private formatAddresses(
    addresses: string | string[] | EmailAddress | EmailAddress[]
  ): string {
    if (Array.isArray(addresses)) {
      return addresses.map((a) => this.formatAddress(a)).join(", ");
    }
    return this.formatAddress(addresses);
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    this.messageCounter++;
    const messageId = `console-${Date.now()}-${this.messageCounter}`;

    const from = options.from
      ? this.formatAddress(options.from)
      : this.fromName
        ? `${this.fromName} <${this.fromEmail}>`
        : this.fromEmail;

    const separator = "─".repeat(60);

    console.log(`\n${separator}`);
    console.log("📧 EMAIL (Console Provider)");
    console.log(separator);
    console.log(`Message ID: ${messageId}`);
    console.log(`From:       ${from}`);
    console.log(`To:         ${this.formatAddresses(options.to)}`);
    if (options.cc) {
      console.log(`CC:         ${this.formatAddresses(options.cc)}`);
    }
    if (options.bcc) {
      console.log(`BCC:        ${this.formatAddresses(options.bcc)}`);
    }
    if (options.replyTo) {
      console.log(`Reply-To:   ${this.formatAddress(options.replyTo)}`);
    }
    console.log(`Subject:    ${options.subject}`);

    if (options.headers) {
      console.log(`Headers:    ${JSON.stringify(options.headers)}`);
    }
    if (options.tags) {
      console.log(`Tags:       ${JSON.stringify(options.tags)}`);
    }
    if (options.scheduledAt) {
      console.log(`Scheduled:  ${options.scheduledAt.toISOString()}`);
    }
    if (options.attachments && options.attachments.length > 0) {
      console.log(`Attachments:`);
      for (const att of options.attachments) {
        const size = typeof att.content === "string"
          ? att.content.length
          : att.content.length;
        console.log(`  - ${att.filename} (${att.contentType || "unknown"}, ${size} bytes)`);
      }
    }

    console.log(separator);
    if (options.text) {
      console.log("TEXT CONTENT:");
      console.log(options.text);
    }
    if (options.html) {
      console.log("HTML CONTENT:");
      console.log(options.html);
    }
    console.log(`${separator}\n`);

    return {
      success: true,
      messageId,
    };
  }

  async sendBatch(options: BatchEmailOptions): Promise<BatchEmailResult> {
    const results: EmailResult[] = [];
    let successful = 0;
    let failed = 0;

    console.log(`\n📬 BATCH EMAIL (${options.emails.length} emails)`);

    for (const email of options.emails) {
      try {
        const result = await this.send(email);
        results.push(result);

        if (result.success) {
          successful++;
        } else {
          failed++;
          if (options.stopOnError) break;
        }
      } catch (err) {
        failed++;
        results.push({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });

        if (options.stopOnError) break;
      }
    }

    console.log(`📬 BATCH COMPLETE: ${successful} sent, ${failed} failed\n`);

    return {
      total: options.emails.length,
      successful,
      failed,
      results,
    };
  }

  async verify(): Promise<boolean> {
    console.log("📧 Console email provider verified (always returns true)");
    return true;
  }
}

/**
 * Create a Console provider
 */
export function createConsoleProvider(config: EmailProviderConfig): ConsoleProvider {
  return new ConsoleProvider(config);
}
