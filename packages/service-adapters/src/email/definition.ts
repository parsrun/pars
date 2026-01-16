/**
 * @parsrun/service-adapters - Email Service Definition
 */

import { defineService } from "@parsrun/service";

/**
 * Email Service Definition
 *
 * Provides email sending capabilities as a microservice.
 */
export const emailServiceDefinition = defineService({
  name: "email",
  version: "1.0.0",
  description: "Email sending microservice",

  queries: {
    /**
     * Check if email configuration is valid
     */
    verify: {
      input: undefined,
      output: undefined as unknown as { valid: boolean; provider: string },
      description: "Verify email provider configuration",
    },

    /**
     * Get available email templates
     */
    getTemplates: {
      input: undefined,
      output: undefined as unknown as {
        templates: Array<{
          name: string;
          description: string;
          variables: string[];
        }>;
      },
      description: "List available email templates",
    },
  },

  mutations: {
    /**
     * Send a single email
     */
    send: {
      input: undefined as unknown as {
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
      },
      output: undefined as unknown as {
        success: boolean;
        messageId?: string;
        error?: string;
      },
      description: "Send a single email",
    },

    /**
     * Send batch emails
     */
    sendBatch: {
      input: undefined as unknown as {
        emails: Array<{
          to: string | string[];
          subject: string;
          html?: string;
          text?: string;
          templateName?: string;
          templateData?: Record<string, unknown>;
        }>;
        stopOnError?: boolean;
      },
      output: undefined as unknown as {
        total: number;
        successful: number;
        failed: number;
        results: Array<{
          success: boolean;
          messageId?: string;
          error?: string;
        }>;
      },
      description: "Send multiple emails in batch",
    },

    /**
     * Render an email template
     */
    renderTemplate: {
      input: undefined as unknown as {
        templateName: string;
        data: Record<string, unknown>;
      },
      output: undefined as unknown as {
        subject: string;
        html: string;
        text: string;
      },
      description: "Render an email template without sending",
    },
  },

  events: {
    emits: {
      /**
       * Emitted when an email is sent successfully
       */
      "email.sent": {
        data: undefined as unknown as {
          messageId: string;
          to: string[];
          subject: string;
          provider: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Email was sent successfully",
      },

      /**
       * Emitted when an email fails to send
       */
      "email.failed": {
        data: undefined as unknown as {
          to: string[];
          subject: string;
          error: string;
          provider: string;
          timestamp: string;
        },
        delivery: "at-least-once",
        description: "Email failed to send",
      },
    },

    handles: [
      // Events this service listens to
      "user.created", // Send welcome email
      "user.password_reset_requested", // Send password reset email
      "user.email_verification_requested", // Send verification email
      "tenant.invitation_created", // Send invitation email
      "dunning.notification_required", // Send dunning emails
    ],
  },
});

/**
 * Type export for the email service definition
 */
export type EmailServiceDefinition = typeof emailServiceDefinition;
