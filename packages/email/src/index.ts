/**
 * @module
 * Edge-compatible email sending for Pars.
 *
 * Supports multiple providers:
 * - Resend (recommended)
 * - SendGrid
 * - Postmark
 * - Console (development)
 *
 * @example
 * ```typescript
 * import { createEmailService } from '@parsrun/email';
 *
 * const email = createEmailService({
 *   provider: 'resend',
 *   apiKey: process.env.RESEND_API_KEY,
 *   fromEmail: 'hello@example.com',
 *   fromName: 'My App',
 * });
 *
 * await email.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World!</p>',
 * });
 * ```
 */

// Re-export types
export * from "./types.js";

// Re-export providers
export { ResendProvider, createResendProvider } from "./providers/resend.js";
export { SendGridProvider, createSendGridProvider } from "./providers/sendgrid.js";
export { PostmarkProvider, createPostmarkProvider } from "./providers/postmark.js";
export { ConsoleProvider, createConsoleProvider } from "./providers/console.js";

// Re-export templates
export * from "./templates/index.js";

import type {
  BatchEmailOptions,
  BatchEmailResult,
  EmailOptions,
  EmailProvider,
  EmailProviderConfig,
  EmailProviderType,
  EmailResult,
  EmailServiceConfig,
} from "./types.js";
import { EmailError, EmailErrorCodes } from "./types.js";
import { ResendProvider } from "./providers/resend.js";
import { SendGridProvider } from "./providers/sendgrid.js";
import { PostmarkProvider } from "./providers/postmark.js";
import { ConsoleProvider } from "./providers/console.js";

/**
 * Email Service
 *
 * High-level email service that provides a unified interface for sending emails
 * through various providers (Resend, SendGrid, Postmark, or Console for development).
 *
 * @example
 * ```typescript
 * const service = new EmailService({
 *   provider: 'resend',
 *   apiKey: 'your-api-key',
 *   fromEmail: 'hello@example.com',
 *   fromName: 'My App',
 * });
 *
 * await service.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Welcome!</p>',
 * });
 * ```
 */
export class EmailService {
  private provider: EmailProvider;
  private debug: boolean;

  /**
   * Creates a new EmailService instance.
   *
   * @param config - The email service configuration including provider type, API key, and default sender info
   */
  constructor(config: EmailServiceConfig) {
    this.debug = config.debug ?? false;
    this.provider = this.createProvider(config);
  }

  private createProvider(config: EmailServiceConfig): EmailProvider {
    const providerConfig: EmailProviderConfig = {
      apiKey: config.apiKey,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      options: config.providerOptions,
    };

    switch (config.provider) {
      case "resend":
        return new ResendProvider(providerConfig);
      case "sendgrid":
        return new SendGridProvider(providerConfig);
      case "postmark":
        return new PostmarkProvider(providerConfig);
      case "console":
        return new ConsoleProvider(providerConfig);
      default:
        throw new EmailError(
          `Unknown email provider: ${config.provider}`,
          EmailErrorCodes.INVALID_CONFIG
        );
    }
  }

  /**
   * Gets the type of email provider being used.
   *
   * @returns The provider type identifier (e.g., 'resend', 'sendgrid', 'postmark', 'console')
   */
  get providerType(): EmailProviderType {
    return this.provider.type;
  }

  /**
   * Sends a single email through the configured provider.
   *
   * @param options - The email options including recipient, subject, and content
   * @returns A promise that resolves to the result of the send operation
   * @throws {EmailError} If the email send fails due to provider error
   */
  async send(options: EmailOptions): Promise<EmailResult> {
    if (this.debug) {
      console.log("[Email] Sending email:", {
        to: options.to,
        subject: options.subject,
        provider: this.provider.type,
      });
    }

    const result = await this.provider.send(options);

    if (this.debug) {
      console.log("[Email] Result:", result);
    }

    return result;
  }

  /**
   * Sends multiple emails in a batch.
   *
   * If the provider supports native batch sending, it will be used. Otherwise,
   * emails are sent sequentially.
   *
   * @param options - The batch email options including array of emails and error handling config
   * @returns A promise that resolves to the batch result with success/failure counts
   */
  async sendBatch(options: BatchEmailOptions): Promise<BatchEmailResult> {
    if (this.debug) {
      console.log("[Email] Sending batch:", {
        count: options.emails.length,
        provider: this.provider.type,
      });
    }

    // Use provider's native batch if available
    if (this.provider.sendBatch) {
      const result = await this.provider.sendBatch(options);

      if (this.debug) {
        console.log("[Email] Batch result:", {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
        });
      }

      return result;
    }

    // Fallback to sequential sending
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

  /**
   * Verifies the provider configuration by testing the API connection.
   *
   * @returns A promise that resolves to true if the configuration is valid, false otherwise
   */
  async verify(): Promise<boolean> {
    if (this.provider.verify) {
      return this.provider.verify();
    }
    return true;
  }
}

/**
 * Create an email service
 *
 * @example
 * ```typescript
 * // With Resend
 * const email = createEmailService({
 *   provider: 'resend',
 *   apiKey: process.env.RESEND_API_KEY,
 *   fromEmail: 'hello@example.com',
 * });
 *
 * // With SendGrid
 * const email = createEmailService({
 *   provider: 'sendgrid',
 *   apiKey: process.env.SENDGRID_API_KEY,
 *   fromEmail: 'hello@example.com',
 * });
 *
 * // For development
 * const email = createEmailService({
 *   provider: 'console',
 *   apiKey: 'not-needed',
 *   fromEmail: 'test@example.com',
 * });
 * ```
 */
export function createEmailService(config: EmailServiceConfig): EmailService {
  return new EmailService(config);
}

/**
 * Creates an email provider instance directly.
 *
 * Use this when you need direct access to a provider without the EmailService wrapper.
 *
 * @param type - The type of email provider to create
 * @param config - The provider configuration including API key and sender info
 * @returns A new email provider instance
 * @throws {EmailError} If an unknown provider type is specified
 *
 * @example
 * ```typescript
 * const provider = createEmailProvider('resend', {
 *   apiKey: 'your-api-key',
 *   fromEmail: 'hello@example.com',
 * });
 *
 * await provider.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hi!</p>',
 * });
 * ```
 */
export function createEmailProvider(
  type: EmailProviderType,
  config: EmailProviderConfig
): EmailProvider {
  switch (type) {
    case "resend":
      return new ResendProvider(config);
    case "sendgrid":
      return new SendGridProvider(config);
    case "postmark":
      return new PostmarkProvider(config);
    case "console":
      return new ConsoleProvider(config);
    default:
      throw new EmailError(
        `Unknown email provider: ${type}`,
        EmailErrorCodes.INVALID_CONFIG
      );
  }
}

// Default export
export default {
  EmailService,
  createEmailService,
  createEmailProvider,
};
