/**
 * Email Service Definition
 *
 * A simple email service that listens to user events
 * and sends notification emails.
 */

import { defineService } from "@parsrun/service";

export const emailService = defineService({
  name: "email",
  version: "1.0.0",

  queries: {
    // Check if email service is configured
    getStatus: {
      input: undefined,
      output: {
        configured: "boolean",
        provider: "string",
      },
    },
  },

  mutations: {
    // Send a welcome email
    sendWelcome: {
      input: {
        userId: "string",
        email: "string",
        name: "string",
      },
      output: {
        success: "boolean",
        messageId: "string?",
      },
    },

    // Send a generic email
    send: {
      input: {
        to: "string",
        subject: "string",
        body: "string",
      },
      output: {
        success: "boolean",
        messageId: "string?",
      },
    },
  },

  events: {
    emits: {
      "email.sent": {
        data: {
          messageId: "string",
          to: "string",
          subject: "string",
        },
      },
      "email.failed": {
        data: {
          to: "string",
          error: "string",
        },
      },
    },
  },
});

export type EmailService = typeof emailService;
