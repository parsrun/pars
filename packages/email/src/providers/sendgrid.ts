/**
 * @parsrun/email - SendGrid Provider
 * Edge-compatible SendGrid email provider
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
 * SendGrid Email Provider
 * Uses fetch API for edge compatibility
 *
 * @example
 * ```typescript
 * const sendgrid = new SendGridProvider({
 *   apiKey: process.env.SENDGRID_API_KEY,
 *   fromEmail: 'hello@example.com',
 *   fromName: 'My App',
 * });
 *
 * await sendgrid.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World!</p>',
 * });
 * ```
 */
export class SendGridProvider implements EmailProvider {
  readonly type = "sendgrid" as const;

  private apiKey: string;
  private fromEmail: string;
  private fromName: string | undefined;
  private baseUrl = "https://api.sendgrid.com/v3";

  constructor(config: EmailProviderConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.fromName = config.fromName;
  }

  private formatAddress(address: string | EmailAddress): { email: string; name?: string | undefined } {
    if (typeof address === "string") {
      return { email: address };
    }
    return address.name ? { email: address.email, name: address.name } : { email: address.email };
  }

  private formatAddresses(
    addresses: string | string[] | EmailAddress | EmailAddress[]
  ): Array<{ email: string; name?: string | undefined }> {
    if (Array.isArray(addresses)) {
      return addresses.map((a) => this.formatAddress(a));
    }
    return [this.formatAddress(addresses)];
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    const from = options.from
      ? this.formatAddress(options.from)
      : this.fromName
        ? { email: this.fromEmail, name: this.fromName }
        : { email: this.fromEmail };

    const personalization: {
      to: Array<{ email: string; name?: string | undefined }>;
      cc?: Array<{ email: string; name?: string | undefined }> | undefined;
      bcc?: Array<{ email: string; name?: string | undefined }> | undefined;
      headers?: Record<string, string> | undefined;
    } = {
      to: this.formatAddresses(options.to),
    };

    if (options.cc) {
      personalization.cc = this.formatAddresses(options.cc);
    }
    if (options.bcc) {
      personalization.bcc = this.formatAddresses(options.bcc);
    }
    if (options.headers) {
      personalization.headers = options.headers;
    }

    const payload: Record<string, unknown> = {
      personalizations: [personalization],
      from,
      subject: options.subject,
      content: [],
    };

    const content: Array<{ type: string; value: string }> = [];
    if (options.text) {
      content.push({ type: "text/plain", value: options.text });
    }
    if (options.html) {
      content.push({ type: "text/html", value: options.html });
    }
    payload["content"] = content;

    if (options.replyTo) {
      payload["reply_to"] = this.formatAddress(options.replyTo);
    }

    if (options.attachments && options.attachments.length > 0) {
      payload["attachments"] = options.attachments.map((att) => ({
        filename: att.filename,
        content: typeof att.content === "string"
          ? att.content
          : this.uint8ArrayToBase64(att.content),
        type: att.contentType,
        content_id: att.contentId,
        disposition: att.contentId ? "inline" : "attachment",
      }));
    }

    if (options.scheduledAt) {
      payload["send_at"] = Math.floor(options.scheduledAt.getTime() / 1000);
    }

    try {
      const response = await fetch(`${this.baseUrl}/mail/send`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // SendGrid returns 202 for success with no body
      if (response.status === 202) {
        const messageId = response.headers.get("x-message-id");
        return {
          success: true,
          messageId: messageId ?? undefined,
        };
      }

      const data = await response.json().catch(() => ({})) as { errors?: Array<{ message: string }> };
      const errorMessage = data.errors?.[0]?.message || `HTTP ${response.status}`;

      return {
        success: false,
        error: errorMessage,
        data,
      };
    } catch (err) {
      throw new EmailError(
        `SendGrid send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
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
      const response = await fetch(`${this.baseUrl}/scopes`, {
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
 * Create a SendGrid provider
 */
export function createSendGridProvider(config: EmailProviderConfig): SendGridProvider {
  return new SendGridProvider(config);
}
