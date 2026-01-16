/**
 * Resend Email Provider
 * Uses Resend API for sending emails
 */

import type { EmailProvider, EmailOptions, EmailResult } from './types.js';

/**
 * Resend provider configuration
 */
export interface ResendProviderConfig {
  /** Resend API key */
  apiKey: string;
  /** Default from email */
  fromEmail?: string;
  /** Default from name */
  fromName?: string;
  /** Resend API base URL (default: https://api.resend.com) */
  baseUrl?: string;
}

/**
 * Resend Email Provider
 */
export class ResendEmailProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;
  private baseUrl: string;

  constructor(config: ResendProviderConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail ?? 'noreply@example.com';
    this.fromName = config.fromName ?? 'App';
    this.baseUrl = config.baseUrl ?? 'https://api.resend.com';
  }

  /**
   * Send email via Resend API
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    const from = options.from ?? `${this.fromName} <${this.fromEmail}>`;

    try {
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
          reply_to: options.replyTo,
          cc: options.cc,
          bcc: options.bcc,
          headers: options.headers,
          attachments: options.attachments?.map((a) => ({
            filename: a.filename,
            content: typeof a.content === 'string' ? a.content : a.content.toString('base64'),
            content_type: a.contentType,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        return {
          success: false,
          error: (errorData['message'] as string) ?? `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as Record<string, unknown>;

      return {
        success: true,
        messageId: data['id'] as string,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create Resend email provider
 */
export function createResendProvider(config: ResendProviderConfig): ResendEmailProvider {
  return new ResendEmailProvider(config);
}
