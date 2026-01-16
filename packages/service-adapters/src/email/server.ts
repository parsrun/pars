/**
 * @parsrun/service-adapters - Email Service Server
 * Server-side implementation of the Email microservice
 */

import type { Logger } from "@parsrun/core";
import { createLogger } from "@parsrun/core";
import {
  createRpcServer,
  createEventEmitter,
  createMemoryEventTransport,
  getEmbeddedRegistry,
  type RpcServer,
  type RpcHandlers,
  type EventEmitter,
} from "@parsrun/service";
import { emailServiceDefinition } from "./definition.js";

// ============================================================================
// EMAIL SERVICE SERVER
// ============================================================================

export interface EmailServiceServerOptions {
  /** Email provider configuration */
  provider: EmailProviderConfig;
  /** Logger */
  logger?: Logger;
  /** Event transport (for emitting events) */
  eventTransport?: ReturnType<typeof createMemoryEventTransport>;
}

export interface EmailProviderConfig {
  type: "resend" | "sendgrid" | "postmark" | "console";
  apiKey?: string;
  fromEmail: string;
  fromName?: string;
}

/**
 * Create Email Service Server
 */
export function createEmailServiceServer(
  options: EmailServiceServerOptions
): {
  rpcServer: RpcServer;
  eventEmitter: EventEmitter;
  register: () => void;
} {
  const logger = options.logger ?? createLogger({ name: "email-service" });
  const eventTransport = options.eventTransport ?? createMemoryEventTransport();

  // Create event emitter
  const eventEmitter = createEventEmitter({
    service: "email",
    definition: emailServiceDefinition,
    transport: eventTransport,
    logger,
  });

  // Create handlers
  const handlers: RpcHandlers = {
    queries: {
      verify: async (_input, ctx) => {
        ctx.logger.debug("Verifying email configuration");
        // In real implementation, would verify API key with provider
        return {
          valid: !!options.provider.apiKey || options.provider.type === "console",
          provider: options.provider.type,
        };
      },

      getTemplates: async (_input, ctx) => {
        ctx.logger.debug("Getting available templates");
        return {
          templates: [
            {
              name: "welcome",
              description: "Welcome email for new users",
              variables: ["name", "loginUrl"],
            },
            {
              name: "password-reset",
              description: "Password reset email",
              variables: ["resetUrl", "expiresInMinutes"],
            },
            {
              name: "email-verification",
              description: "Email verification link",
              variables: ["verificationUrl", "expiresInHours"],
            },
            {
              name: "otp",
              description: "One-time password email",
              variables: ["code", "expiresInMinutes"],
            },
            {
              name: "magic-link",
              description: "Magic link for passwordless login",
              variables: ["url", "expiresInMinutes"],
            },
            {
              name: "invitation",
              description: "Team/organization invitation",
              variables: ["inviterName", "organizationName", "url", "role", "expiresInDays"],
            },
          ],
        };
      },
    },

    mutations: {
      send: async (input, ctx) => {
        const { to, subject, html, text: _text, templateName, templateData: _templateData } = input as {
          to: string | string[];
          subject: string;
          html?: string;
          text?: string;
          templateName?: string;
          templateData?: Record<string, unknown>;
        };
        void _text; void _templateData; // Reserved for real implementation

        ctx.logger.info("Sending email", { to, subject, templateName });

        try {
          // In real implementation, would use @parsrun/email
          const toArray = Array.isArray(to) ? to : [to];
          const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          // Simulate sending
          if (options.provider.type === "console") {
            console.log("📧 Email sent:", {
              to: toArray,
              subject,
              templateName,
              html: html?.slice(0, 100),
            });
          }

          // Emit success event
          await eventEmitter.emit("email.sent", {
            messageId,
            to: toArray,
            subject,
            provider: options.provider.type,
            timestamp: new Date().toISOString(),
          });

          return { success: true, messageId };
        } catch (error) {
          const toArray = Array.isArray(to) ? to : [to];

          // Emit failure event
          await eventEmitter.emit("email.failed", {
            to: toArray,
            subject,
            error: (error as Error).message,
            provider: options.provider.type,
            timestamp: new Date().toISOString(),
          });

          return { success: false, error: (error as Error).message };
        }
      },

      sendBatch: async (input, ctx) => {
        const { emails, stopOnError } = input as {
          emails: Array<{
            to: string | string[];
            subject: string;
            html?: string;
            text?: string;
          }>;
          stopOnError?: boolean;
        };

        ctx.logger.info("Sending batch emails", { count: emails.length });

        const results: Array<{ success: boolean; messageId?: string; error?: string }> = [];
        let successful = 0;
        let failed = 0;

        for (const email of emails) {
          try {
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

            if (options.provider.type === "console") {
              console.log("📧 Batch email:", { to: email.to, subject: email.subject });
            }

            results.push({ success: true, messageId });
            successful++;
          } catch (error) {
            results.push({ success: false, error: (error as Error).message });
            failed++;

            if (stopOnError) {
              break;
            }
          }
        }

        return {
          total: emails.length,
          successful,
          failed,
          results,
        };
      },

      renderTemplate: async (input, ctx) => {
        const { templateName, data } = input as {
          templateName: string;
          data: Record<string, unknown>;
        };

        ctx.logger.debug("Rendering template", { templateName });

        // In real implementation, would use @parsrun/email templates
        const templates: Record<string, { subject: string; html: string; text: string }> = {
          welcome: {
            subject: `Welcome to ${data["appName"] ?? "Our App"}!`,
            html: `<h1>Welcome ${data["name"]}!</h1><p>Click <a href="${data["loginUrl"]}">here</a> to login.</p>`,
            text: `Welcome ${data["name"]}! Visit ${data["loginUrl"]} to login.`,
          },
          otp: {
            subject: "Your verification code",
            html: `<h1>Your code is: ${data["code"]}</h1><p>Expires in ${data["expiresInMinutes"]} minutes.</p>`,
            text: `Your code is: ${data["code"]}. Expires in ${data["expiresInMinutes"]} minutes.`,
          },
        };

        const template = templates[templateName];
        if (!template) {
          throw new Error(`Template not found: ${templateName}`);
        }

        return template;
      },
    },
  };

  // Create RPC server
  const rpcServer = createRpcServer({
    definition: emailServiceDefinition,
    handlers,
    logger,
  });

  // Register function
  const register = () => {
    const registry = getEmbeddedRegistry();
    registry.register("email", rpcServer);
    logger.info("Email service registered");
  };

  return {
    rpcServer,
    eventEmitter,
    register,
  };
}
