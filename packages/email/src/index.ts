/**
 * @parsrun/email
 * Edge-compatible email sending for Pars
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
 * High-level email service with provider abstraction
 */
export class EmailService {
  private provider: EmailProvider;
  private debug: boolean;

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
   * Get the provider type
   */
  get providerType(): EmailProviderType {
    return this.provider.type;
  }

  /**
   * Send a single email
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
   * Send multiple emails
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
   * Verify provider configuration
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
 * Create an email provider directly
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
