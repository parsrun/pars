/**
 * Email Service Handlers
 *
 * Implementation of the email service.
 * In a real app, this would integrate with Resend, SendGrid, etc.
 */

import { createRpcServer } from "@parsrun/service/rpc";
import {
  createEventEmitter,
  type EventTransport,
} from "@parsrun/service/events";
import { emailService } from "./definition.js";

// Helper to generate message IDs
function generateMessageId(): string {
  return `msg_${Math.random().toString(36).substring(2, 15)}`;
}

export interface EmailHandlersDeps {
  eventTransport: EventTransport;
}

export function createEmailHandlers(deps: EmailHandlersDeps) {
  const { eventTransport } = deps;

  // Create event emitter
  const emitter = createEventEmitter({
    service: "email",
    definition: emailService,
    transport: eventTransport,
  });

  // Create RPC server
  const server = createRpcServer({
    service: "email",
    version: "1.0.0",
    handlers: {
      // ============ Queries ============

      getStatus: async (_, ctx) => {
        ctx.logger.info("Getting email service status");

        return {
          configured: true,
          provider: "console", // In demo, we just log emails
        };
      },

      // ============ Mutations ============

      sendWelcome: async ({ userId, email, name }, ctx) => {
        ctx.logger.info("Sending welcome email", { userId, email, name });

        try {
          // In a real app, this would call an email provider
          const messageId = generateMessageId();

          console.log(`
╔════════════════════════════════════════╗
║          WELCOME EMAIL                 ║
╠════════════════════════════════════════╣
║ To: ${email.padEnd(33)}║
║ Subject: Welcome to Pars!              ║
╠────────────────────────────────────────╣
║                                        ║
║ Hello ${name}!
║                                        ║
║ Welcome to our platform. We're excited ║
║ to have you here!                      ║
║                                        ║
║ Your user ID: ${userId.padEnd(22)}║
║                                        ║
╚════════════════════════════════════════╝
`);

          // Emit success event
          await emitter.emit("email.sent", {
            messageId,
            to: email,
            subject: "Welcome to Pars!",
          });

          return { success: true, messageId };
        } catch (error) {
          // Emit failure event
          await emitter.emit("email.failed", {
            to: email,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          return { success: false };
        }
      },

      send: async ({ to, subject, body }, ctx) => {
        ctx.logger.info("Sending email", { to, subject });

        try {
          const messageId = generateMessageId();

          console.log(`
╔════════════════════════════════════════╗
║              EMAIL                     ║
╠════════════════════════════════════════╣
║ To: ${to.padEnd(33)}║
║ Subject: ${subject.substring(0, 28).padEnd(28)}║
╠────────────────────────────────────────╣
${body.split('\n').map(line => `║ ${line.padEnd(38)}║`).join('\n')}
╚════════════════════════════════════════╝
`);

          await emitter.emit("email.sent", {
            messageId,
            to,
            subject,
          });

          return { success: true, messageId };
        } catch (error) {
          await emitter.emit("email.failed", {
            to,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          return { success: false };
        }
      },
    },
  });

  return { server, emitter };
}
