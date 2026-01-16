/**
 * @parsrun/payments - Dunning Email Integration
 * Built-in integration with @parsrun/email for sending dunning notifications
 */

import type {
  DunningNotification,
  NotificationResult,
  DunningContext,
  DunningLogger,
} from "./types.js";
import {
  renderDunningEmail,
  buildTemplateData,
  type DunningEmailTemplate,
  type DunningEmailData,
} from "./email-templates.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Email service interface (compatible with @parsrun/email)
 * This allows using @parsrun/email or any compatible email service
 */
export interface EmailServiceLike {
  send(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    tags?: string[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

/**
 * Configuration for dunning email integration
 */
export interface DunningEmailIntegrationConfig {
  /** Email service instance (from @parsrun/email or compatible) */
  emailService: EmailServiceLike;

  /** Brand configuration */
  brand?: {
    name?: string;
    color?: string;
    logoUrl?: string;
  };

  /** URLs for dunning emails */
  urls?: {
    updatePayment?: string | ((customerId: string) => string);
    viewInvoice?: string | ((invoiceId: string) => string);
    support?: string;
    unsubscribe?: string | ((customerId: string) => string);
  };

  /** Reply-to email address */
  replyTo?: string;

  /** Email tags for tracking */
  tags?: string[];

  /** Custom email templates (override defaults) */
  customTemplates?: Record<string, DunningEmailTemplate>;

  /** Data enrichment function */
  enrichData?: (data: DunningEmailData, context: DunningContext) => DunningEmailData;

  /** Logger */
  logger?: DunningLogger;

  /** Skip sending to specific customers */
  skip?: (notification: DunningNotification) => boolean;
}

/**
 * Dunning email notification handler result
 */
export interface DunningEmailHandler {
  /** Notification handler to use in DunningManagerConfig */
  handler: (notification: DunningNotification) => Promise<NotificationResult>;

  /** Send a one-off dunning email */
  sendEmail: (templateId: string, to: string, context: DunningContext) => Promise<NotificationResult>;

  /** Send recovery success email */
  sendRecoveryEmail: (to: string, context: DunningContext) => Promise<NotificationResult>;
}

// ============================================================================
// Email Integration
// ============================================================================

/**
 * Create a dunning email notification handler
 *
 * @example
 * ```typescript
 * import { createEmailService } from '@parsrun/email';
 * import { createDunningManager, createDunningEmailHandler } from '@parsrun/payments/dunning';
 *
 * const emailService = createEmailService({
 *   provider: 'resend',
 *   apiKey: process.env.RESEND_API_KEY,
 *   fromEmail: 'billing@example.com',
 *   fromName: 'Billing',
 * });
 *
 * const dunningEmail = createDunningEmailHandler({
 *   emailService,
 *   brand: { name: 'MyApp', color: '#0070f3' },
 *   urls: {
 *     updatePayment: (customerId) => `https://app.example.com/billing?customer=${customerId}`,
 *     support: 'https://app.example.com/support',
 *   },
 * });
 *
 * const dunningManager = createDunningManager({
 *   defaultSequence: standardSaasSequence,
 *   storage,
 *   onNotification: dunningEmail.handler,
 * });
 * ```
 */
export function createDunningEmailHandler(
  config: DunningEmailIntegrationConfig
): DunningEmailHandler {
  const { emailService, logger } = config;

  /**
   * Build URLs from config
   */
  const buildUrls = (
    notification: DunningNotification
  ): {
    updatePaymentUrl?: string;
    invoiceUrl?: string;
    supportUrl?: string;
  } => {
    const { urls } = config;
    if (!urls) return {};

    const result: {
      updatePaymentUrl?: string;
      invoiceUrl?: string;
      supportUrl?: string;
    } = {};

    const customerId = notification.recipient.customerId;
    const invoiceId = notification.context.state.initialFailure.invoiceId;

    // Update payment URL
    const updatePaymentUrl =
      typeof urls.updatePayment === "function"
        ? urls.updatePayment(customerId)
        : urls.updatePayment;
    if (updatePaymentUrl) result.updatePaymentUrl = updatePaymentUrl;

    // Invoice URL
    if (invoiceId && typeof urls.viewInvoice === "function") {
      result.invoiceUrl = urls.viewInvoice(invoiceId);
    } else if (typeof urls.viewInvoice === "string") {
      result.invoiceUrl = urls.viewInvoice;
    }

    // Support URL
    if (urls.support) result.supportUrl = urls.support;

    return result;
  };

  /**
   * Calculate days until events based on sequence
   */
  const calculateDaysUntil = (
    context: DunningContext
  ): {
    daysUntilLimit?: number;
    daysUntilSuspension?: number;
    daysUntilCancellation?: number;
  } => {
    const result: {
      daysUntilLimit?: number;
      daysUntilSuspension?: number;
      daysUntilCancellation?: number;
    } = {};

    // This would ideally come from sequence analysis
    // For now, use step metadata if available
    const stepMeta = context.step.metadata as Record<string, unknown> | undefined;
    if (stepMeta) {
      if (typeof stepMeta["daysUntilLimit"] === "number") {
        result.daysUntilLimit = stepMeta["daysUntilLimit"] as number;
      }
      if (typeof stepMeta["daysUntilSuspension"] === "number") {
        result.daysUntilSuspension = stepMeta["daysUntilSuspension"] as number;
      }
      if (typeof stepMeta["daysUntilCancellation"] === "number") {
        result.daysUntilCancellation = stepMeta["daysUntilCancellation"] as number;
      }
    }

    return result;
  };

  /**
   * Send a dunning email
   */
  const sendEmail = async (
    templateId: string,
    to: string,
    context: DunningContext
  ): Promise<NotificationResult> => {
    try {
      // Build template data
      const urls = buildUrls({
        channel: "email",
        templateId,
        recipient: { customerId: context.customer.id, email: to },
        variables: {
          amount: context.amountOwed,
          currency: context.currency,
          daysSinceFailure: context.daysSinceFailure,
        },
        context,
      });

      const daysUntil = calculateDaysUntil(context);

      // Build options for template data (only include defined values)
      const templateOptions: {
        brandName?: string;
        brandColor?: string;
        updatePaymentUrl?: string;
        invoiceUrl?: string;
        supportUrl?: string;
        daysUntilLimit?: number;
        daysUntilSuspension?: number;
        daysUntilCancellation?: number;
      } = {};

      if (config.brand?.name) templateOptions.brandName = config.brand.name;
      if (config.brand?.color) templateOptions.brandColor = config.brand.color;
      if (urls.updatePaymentUrl) templateOptions.updatePaymentUrl = urls.updatePaymentUrl;
      if (urls.invoiceUrl) templateOptions.invoiceUrl = urls.invoiceUrl;
      if (urls.supportUrl) templateOptions.supportUrl = urls.supportUrl;
      if (daysUntil.daysUntilLimit !== undefined) templateOptions.daysUntilLimit = daysUntil.daysUntilLimit;
      if (daysUntil.daysUntilSuspension !== undefined) templateOptions.daysUntilSuspension = daysUntil.daysUntilSuspension;
      if (daysUntil.daysUntilCancellation !== undefined) templateOptions.daysUntilCancellation = daysUntil.daysUntilCancellation;

      let emailData = buildTemplateData(context, templateOptions);

      // Allow data enrichment
      if (config.enrichData) {
        emailData = config.enrichData(emailData, context);
      }

      // Render email
      const rendered = renderDunningEmail(templateId, emailData, config.customTemplates);

      // Build send options (only include defined values)
      const sendOptions: {
        to: string | string[];
        subject: string;
        html: string;
        text?: string;
        replyTo?: string;
        tags?: string[];
      } = {
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: config.tags ?? ["dunning"],
      };
      if (config.replyTo) sendOptions.replyTo = config.replyTo;

      // Send via email service
      const result = await emailService.send(sendOptions);

      logger?.debug("Dunning email sent", {
        templateId,
        to,
        success: result.success,
        messageId: result.messageId,
      });

      // Build result (only include defined values)
      const notificationResult: NotificationResult = {
        success: result.success,
        channel: "email",
        sentAt: new Date(),
      };
      if (result.messageId) notificationResult.externalId = result.messageId;
      if (result.error) notificationResult.error = result.error;

      return notificationResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger?.error("Failed to send dunning email", {
        templateId,
        to,
        error: errorMessage,
      });

      return {
        success: false,
        channel: "email",
        error: errorMessage,
        sentAt: new Date(),
      };
    }
  };

  /**
   * Main notification handler
   */
  const handler = async (notification: DunningNotification): Promise<NotificationResult> => {
    // Only handle email channel
    if (notification.channel !== "email") {
      return {
        success: false,
        channel: notification.channel,
        error: `Channel ${notification.channel} not supported by email integration`,
        sentAt: new Date(),
      };
    }

    // Check skip condition
    if (config.skip?.(notification)) {
      logger?.debug("Skipping dunning notification", {
        customerId: notification.recipient.customerId,
        templateId: notification.templateId,
      });

      return {
        success: true,
        channel: "email",
        sentAt: new Date(),
      };
    }

    // Get recipient email
    const email = notification.recipient.email;
    if (!email) {
      logger?.warn("No email address for dunning notification", {
        customerId: notification.recipient.customerId,
      });

      return {
        success: false,
        channel: "email",
        error: "No email address available",
        sentAt: new Date(),
      };
    }

    return sendEmail(notification.templateId, email, notification.context);
  };

  /**
   * Send recovery success email
   */
  const sendRecoveryEmail = async (
    to: string,
    context: DunningContext
  ): Promise<NotificationResult> => {
    return sendEmail("dunning-recovered", to, context);
  };

  return {
    handler,
    sendEmail,
    sendRecoveryEmail,
  };
}

// ============================================================================
// Multi-Channel Integration
// ============================================================================

/**
 * SMS service interface (for future SMS integration)
 */
export interface SmsServiceLike {
  send(options: {
    to: string;
    message: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

/**
 * Configuration for multi-channel dunning notifications
 */
export interface MultiChannelDunningConfig {
  /** Email service */
  email?: DunningEmailIntegrationConfig;

  /** SMS service (future) */
  sms?: {
    service: SmsServiceLike;
    templates?: Record<string, string>;
  };

  /** In-app notification handler */
  inApp?: (notification: DunningNotification) => Promise<NotificationResult>;

  /** Webhook handler */
  webhook?: (notification: DunningNotification) => Promise<NotificationResult>;

  /** Push notification handler */
  push?: (notification: DunningNotification) => Promise<NotificationResult>;

  /** Logger */
  logger?: DunningLogger;
}

/**
 * Create a multi-channel notification handler
 *
 * @example
 * ```typescript
 * const notificationHandler = createMultiChannelHandler({
 *   email: {
 *     emailService,
 *     brand: { name: 'MyApp' },
 *   },
 *   inApp: async (notification) => {
 *     await pushToInAppNotifications(notification);
 *     return { success: true, channel: 'in_app', sentAt: new Date() };
 *   },
 * });
 *
 * const dunningManager = createDunningManager({
 *   defaultSequence: standardSaasSequence,
 *   storage,
 *   onNotification: notificationHandler,
 * });
 * ```
 */
export function createMultiChannelHandler(
  config: MultiChannelDunningConfig
): (notification: DunningNotification) => Promise<NotificationResult> {
  const emailHandler = config.email
    ? createDunningEmailHandler(config.email)
    : undefined;

  return async (notification: DunningNotification): Promise<NotificationResult> => {
    const { channel } = notification;

    switch (channel) {
      case "email":
        if (!emailHandler) {
          config.logger?.warn("Email channel not configured", {
            templateId: notification.templateId,
          });
          return {
            success: false,
            channel: "email",
            error: "Email channel not configured",
            sentAt: new Date(),
          };
        }
        return emailHandler.handler(notification);

      case "sms":
        if (!config.sms) {
          return {
            success: false,
            channel: "sms",
            error: "SMS channel not configured",
            sentAt: new Date(),
          };
        }
        // SMS implementation placeholder
        const phone = notification.recipient.phone;
        if (!phone) {
          return {
            success: false,
            channel: "sms",
            error: "No phone number available",
            sentAt: new Date(),
          };
        }
        const template = config.sms.templates?.[notification.templateId];
        if (!template) {
          return {
            success: false,
            channel: "sms",
            error: `SMS template not found: ${notification.templateId}`,
            sentAt: new Date(),
          };
        }
        const smsResult = await config.sms.service.send({
          to: phone,
          message: template, // TODO: render template
        });
        const smsNotificationResult: NotificationResult = {
          success: smsResult.success,
          channel: "sms",
          sentAt: new Date(),
        };
        if (smsResult.messageId) smsNotificationResult.externalId = smsResult.messageId;
        if (smsResult.error) smsNotificationResult.error = smsResult.error;
        return smsNotificationResult;

      case "in_app":
        if (!config.inApp) {
          return {
            success: false,
            channel: "in_app",
            error: "In-app channel not configured",
            sentAt: new Date(),
          };
        }
        return config.inApp(notification);

      case "webhook":
        if (!config.webhook) {
          return {
            success: false,
            channel: "webhook",
            error: "Webhook channel not configured",
            sentAt: new Date(),
          };
        }
        return config.webhook(notification);

      case "push":
        if (!config.push) {
          return {
            success: false,
            channel: "push",
            error: "Push channel not configured",
            sentAt: new Date(),
          };
        }
        return config.push(notification);

      default:
        return {
          success: false,
          channel,
          error: `Unknown channel: ${channel}`,
          sentAt: new Date(),
        };
    }
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a simple email-only notification handler
 * Convenience wrapper for common use case
 *
 * @example
 * ```typescript
 * import { createEmailService } from '@parsrun/email';
 * import { createDunningManager, simpleEmailHandler } from '@parsrun/payments/dunning';
 *
 * const emailService = createEmailService({ ... });
 *
 * const dunningManager = createDunningManager({
 *   defaultSequence: standardSaasSequence,
 *   storage,
 *   onNotification: simpleEmailHandler(emailService, {
 *     brandName: 'MyApp',
 *     updatePaymentUrl: 'https://app.example.com/billing',
 *   }),
 * });
 * ```
 */
export function simpleEmailHandler(
  emailService: EmailServiceLike,
  options?: {
    brandName?: string;
    brandColor?: string;
    updatePaymentUrl?: string;
    supportUrl?: string;
    replyTo?: string;
  }
): (notification: DunningNotification) => Promise<NotificationResult> {
  // Build config object with only defined values
  const config: DunningEmailIntegrationConfig = {
    emailService,
  };

  // Add brand if any option is set
  if (options?.brandName || options?.brandColor) {
    const brand: { name?: string; color?: string } = {};
    if (options.brandName) brand.name = options.brandName;
    if (options.brandColor) brand.color = options.brandColor;
    config.brand = brand;
  }

  // Add urls if any option is set
  if (options?.updatePaymentUrl || options?.supportUrl) {
    const urls: { updatePayment?: string; support?: string } = {};
    if (options.updatePaymentUrl) urls.updatePayment = options.updatePaymentUrl;
    if (options.supportUrl) urls.support = options.supportUrl;
    config.urls = urls;
  }

  // Add replyTo if set
  if (options?.replyTo) {
    config.replyTo = options.replyTo;
  }

  const handler = createDunningEmailHandler(config);
  return handler.handler;
}
