/**
 * @parsrun/service-adapters - Email Service Client
 * Type-safe client for the Email microservice
 */

import {
  useService,
  type ServiceClientOptions,
} from "@parsrun/service";
import type { EmailServiceDefinition } from "./definition.js";

// ============================================================================
// EMAIL SERVICE CLIENT
// ============================================================================

/**
 * Type-safe Email Service Client
 */
export interface EmailServiceClient {
  /**
   * Verify email provider configuration
   */
  verify(): Promise<{ valid: boolean; provider: string }>;

  /**
   * Get available email templates
   */
  getTemplates(): Promise<{
    templates: Array<{
      name: string;
      description: string;
      variables: string[];
    }>;
  }>;

  /**
   * Send a single email
   */
  send(options: SendEmailOptions): Promise<SendEmailResult>;

  /**
   * Send batch emails
   */
  sendBatch(options: SendBatchOptions): Promise<SendBatchResult>;

  /**
   * Render an email template
   */
  renderTemplate(
    templateName: string,
    data: Record<string, unknown>
  ): Promise<{ subject: string; html: string; text: string }>;

  /**
   * Subscribe to email events
   */
  onEmailSent(
    handler: (event: {
      messageId: string;
      to: string[];
      subject: string;
      provider: string;
      timestamp: string;
    }) => Promise<void>
  ): () => void;

  onEmailFailed(
    handler: (event: {
      to: string[];
      subject: string;
      error: string;
      provider: string;
      timestamp: string;
    }) => Promise<void>
  ): () => void;

  /**
   * Close the client
   */
  close(): Promise<void>;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  templateName?: string;
  templateData?: Record<string, unknown>;
  tags?: Record<string, string>;
  scheduledAt?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendBatchOptions {
  emails: Array<{
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    templateName?: string;
    templateData?: Record<string, unknown>;
  }>;
  stopOnError?: boolean;
}

export interface SendBatchResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

/**
 * Create Email Service Client
 *
 * @example
 * ```typescript
 * // Embedded mode (same process)
 * const email = createEmailServiceClient();
 *
 * // HTTP mode (remote service)
 * const email = createEmailServiceClient({
 *   mode: 'http',
 *   baseUrl: 'https://email.example.com',
 * });
 *
 * // Send email
 * const result = await email.send({
 *   to: 'user@example.com',
 *   subject: 'Hello',
 *   html: '<p>Hello World</p>',
 * });
 *
 * // Use template
 * const result = await email.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   templateName: 'welcome',
 *   templateData: { name: 'John', loginUrl: 'https://app.com/login' },
 * });
 * ```
 */
export function createEmailServiceClient(
  options?: ServiceClientOptions
): EmailServiceClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = useService<EmailServiceDefinition>("email", options) as any;

  return {
    async verify() {
      return client.query("verify", undefined) as Promise<{ valid: boolean; provider: string }>;
    },

    async getTemplates() {
      return client.query("getTemplates", undefined) as Promise<{
        templates: Array<{
          name: string;
          description: string;
          variables: string[];
        }>;
      }>;
    },

    async send(emailOptions: SendEmailOptions) {
      return client.mutate("send", emailOptions) as Promise<SendEmailResult>;
    },

    async sendBatch(batchOptions: SendBatchOptions) {
      return client.mutate("sendBatch", batchOptions) as Promise<SendBatchResult>;
    },

    async renderTemplate(templateName: string, data: Record<string, unknown>) {
      return client.mutate("renderTemplate", { templateName, data }) as Promise<{
        subject: string;
        html: string;
        text: string;
      }>;
    },

    onEmailSent(handler) {
      return client.on("email.sent", async (event: { data: unknown }) => {
        await handler(event.data as {
          messageId: string;
          to: string[];
          subject: string;
          provider: string;
          timestamp: string;
        });
      });
    },

    onEmailFailed(handler) {
      return client.on("email.failed", async (event: { data: unknown }) => {
        await handler(event.data as {
          to: string[];
          subject: string;
          error: string;
          provider: string;
          timestamp: string;
        });
      });
    },

    async close() {
      if ("close" in client && typeof client.close === "function") {
        await (client as { close: () => Promise<void> }).close();
      }
    },
  };
}
