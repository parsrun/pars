/**
 * @parsrun/email - Postmark Provider
 * Edge-compatible Postmark email provider
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
 * Postmark Email Provider
 * Uses fetch API for edge compatibility
 *
 * @example
 * ```typescript
 * const postmark = new PostmarkProvider({
 *   apiKey: process.env.POSTMARK_API_KEY,
 *   fromEmail: 'hello@example.com',
 *   fromName: 'My App',
 * });
 *
 * await postmark.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World!</p>',
 * });
 * ```
 */
export class PostmarkProvider implements EmailProvider {
  readonly type = "postmark" as const;

  private apiKey: string;
  private fromEmail: string;
  private fromName: string | undefined;
  private baseUrl = "https://api.postmarkapp.com";

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
  ): string {
    if (Array.isArray(addresses)) {
      return addresses.map((a) => this.formatAddress(a)).join(",");
    }
    return this.formatAddress(addresses);
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    const from = options.from
      ? this.formatAddress(options.from)
      : this.fromName
        ? `${this.fromName} <${this.fromEmail}>`
        : this.fromEmail;

    const payload: Record<string, unknown> = {
      From: from,
      To: this.formatAddresses(options.to),
      Subject: options.subject,
    };

    if (options.html) payload["HtmlBody"] = options.html;
    if (options.text) payload["TextBody"] = options.text;
    if (options.replyTo) payload["ReplyTo"] = this.formatAddress(options.replyTo);
    if (options.cc) payload["Cc"] = this.formatAddresses(options.cc);
    if (options.bcc) payload["Bcc"] = this.formatAddresses(options.bcc);

    if (options.headers) {
      payload["Headers"] = Object.entries(options.headers).map(([Name, Value]) => ({ Name, Value }));
    }

    if (options.tags) {
      // Postmark uses Tag field (single tag) and Metadata for custom data
      const tagEntries = Object.entries(options.tags);
      if (tagEntries.length > 0 && tagEntries[0]) {
        payload["Tag"] = tagEntries[0][1];
      }
      payload["Metadata"] = options.tags;
    }

    if (options.attachments && options.attachments.length > 0) {
      payload["Attachments"] = options.attachments.map((att) => ({
        Name: att.filename,
        Content: typeof att.content === "string"
          ? att.content
          : this.uint8ArrayToBase64(att.content),
        ContentType: att.contentType || "application/octet-stream",
        ContentID: att.contentId,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/email`, {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": this.apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as {
        MessageID?: string;
        ErrorCode?: number;
        Message?: string;
      };

      if (!response.ok || data.ErrorCode) {
        return {
          success: false,
          error: data.Message || `HTTP ${response.status}`,
          data,
        };
      }

      return {
        success: true,
        messageId: data.MessageID,
        data,
      };
    } catch (err) {
      throw new EmailError(
        `Postmark send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        EmailErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  async sendBatch(options: BatchEmailOptions): Promise<BatchEmailResult> {
    // Postmark supports batch sending up to 500 emails
    const batchPayload = options.emails.map((email) => {
      const from = email.from
        ? this.formatAddress(email.from)
        : this.fromName
          ? `${this.fromName} <${this.fromEmail}>`
          : this.fromEmail;

      const item: Record<string, unknown> = {
        From: from,
        To: this.formatAddresses(email.to),
        Subject: email.subject,
      };

      if (email.html) item["HtmlBody"] = email.html;
      if (email.text) item["TextBody"] = email.text;
      if (email.replyTo) item["ReplyTo"] = this.formatAddress(email.replyTo);
      if (email.cc) item["Cc"] = this.formatAddresses(email.cc);
      if (email.bcc) item["Bcc"] = this.formatAddresses(email.bcc);

      return item;
    });

    try {
      const response = await fetch(`${this.baseUrl}/email/batch`, {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": this.apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(batchPayload),
      });

      const data = await response.json() as Array<{
        MessageID?: string;
        ErrorCode?: number;
        Message?: string;
      }>;

      const results: EmailResult[] = data.map((item) => ({
        success: !item.ErrorCode,
        messageId: item.MessageID,
        error: item.ErrorCode ? item.Message : undefined,
        data: item,
      }));

      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      return {
        total: options.emails.length,
        successful,
        failed,
        results,
      };
    } catch (err) {
      throw new EmailError(
        `Postmark batch send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        EmailErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  async verify(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/server`, {
        headers: {
          "X-Postmark-Server-Token": this.apiKey,
          "Accept": "application/json",
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
 * Create a Postmark provider
 */
export function createPostmarkProvider(config: EmailProviderConfig): PostmarkProvider {
  return new PostmarkProvider(config);
}
