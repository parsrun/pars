/**
 * @parsrun/email - Resend Provider
 * Edge-compatible Resend email provider
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
import { EmailError, EmailErrorCodes } from "../types.js";

/**
 * Resend Email Provider
 * Uses fetch API for edge compatibility
 *
 * @example
 * ```typescript
 * const resend = new ResendProvider({
 *   apiKey: process.env.RESEND_API_KEY,
 *   fromEmail: 'hello@example.com',
 *   fromName: 'My App',
 * });
 *
 * await resend.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World!</p>',
 * });
 * ```
 */
export class ResendProvider implements EmailProvider {
  readonly type = "resend" as const;

  private apiKey: string;
  private fromEmail: string;
  private fromName: string | undefined;
  private baseUrl = "https://api.resend.com";

  constructor(config: EmailProviderConfig) {
    this.apiKey = config.apiKey;
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
  ): string[] {
    if (Array.isArray(addresses)) {
      return addresses.map((a) => this.formatAddress(a));
    }
    return [this.formatAddress(addresses)];
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    const from = options.from
      ? this.formatAddress(options.from)
      : this.fromName
        ? `${this.fromName} <${this.fromEmail}>`
        : this.fromEmail;

    const payload: Record<string, unknown> = {
      from,
      to: this.formatAddresses(options.to),
      subject: options.subject,
    };

    if (options.html) payload["html"] = options.html;
    if (options.text) payload["text"] = options.text;
    if (options.replyTo) payload["reply_to"] = this.formatAddress(options.replyTo);
    if (options.cc) payload["cc"] = this.formatAddresses(options.cc);
    if (options.bcc) payload["bcc"] = this.formatAddresses(options.bcc);
    if (options.headers) payload["headers"] = options.headers;
    if (options.tags) payload["tags"] = Object.entries(options.tags).map(([name, value]) => ({ name, value }));
    if (options.scheduledAt) payload["scheduled_at"] = options.scheduledAt.toISOString();

    if (options.attachments && options.attachments.length > 0) {
      payload["attachments"] = options.attachments.map((att) => ({
        filename: att.filename,
        content: typeof att.content === "string"
          ? att.content
          : this.uint8ArrayToBase64(att.content),
        content_type: att.contentType,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as { id?: string; message?: string; statusCode?: number };

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`,
          data,
        };
      }

      return {
        success: true,
        messageId: data.id,
        data,
      };
    } catch (err) {
      throw new EmailError(
        `Resend send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        EmailErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  async sendBatch(options: BatchEmailOptions): Promise<BatchEmailResult> {
    const results: EmailResult[] = [];
    let successful = 0;
    let failed = 0;

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

    return {
      total: options.emails.length,
      successful,
      failed,
      results,
    };
  }

  async verify(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/domains`, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private uint8ArrayToBase64(data: Uint8Array): string {
    // Edge-compatible base64 encoding
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary);
  }
}

/**
 * Create a Resend provider
 */
export function createResendProvider(config: EmailProviderConfig): ResendProvider {
  return new ResendProvider(config);
}
