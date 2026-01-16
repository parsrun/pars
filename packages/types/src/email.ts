/**
 * @module
 * Email service validation schemas for sending emails.
 * Includes address, attachment, and provider configuration types.
 *
 * @example
 * ```typescript
 * import { sendEmailOptions, emailConfig, type SendEmailOptions } from '@parsrun/types';
 *
 * const options: SendEmailOptions = {
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   html: '<h1>Hello</h1>'
 * };
 * ```
 */

import { type } from "arktype";

// ============================================================================
// Email Address Schemas
// ============================================================================

/** Email address with optional name */
export const emailAddress = type({
  email: "string.email",
  "name?": "string",
});

/** Simple email string or address object */
export const emailRecipient = type("string.email | object");

// ============================================================================
// Email Content Schemas
// ============================================================================

/** Email attachment */
export const emailAttachment = type({
  filename: "string >= 1",
  content: "string | object",
  "contentType?": "string",
  "encoding?": "'base64' | 'utf-8' | 'binary'",
  "contentId?": "string",
  "disposition?": "'attachment' | 'inline'",
});

/** Email options */
export const sendEmailOptions = type({
  to: "string.email | string.email[] | object | object[]",
  "cc?": "string.email | string.email[] | object | object[]",
  "bcc?": "string.email | string.email[] | object | object[]",
  "from?": "string.email | object",
  "replyTo?": "string.email | object",
  subject: "string >= 1",
  "text?": "string",
  "html?": "string",
  "attachments?": emailAttachment.array(),
  "headers?": "object",
  "priority?": "'high' | 'normal' | 'low'",
  "tags?": "string[]",
  "metadata?": "object",
});

/** Templated email options */
export const sendTemplateEmailOptions = type({
  to: "string.email | string.email[] | object | object[]",
  "cc?": "string.email | string.email[] | object | object[]",
  "bcc?": "string.email | string.email[] | object | object[]",
  "from?": "string.email | object",
  "replyTo?": "string.email | object",
  template: "string >= 1",
  "data?": "object",
  "attachments?": emailAttachment.array(),
  "headers?": "object",
  "priority?": "'high' | 'normal' | 'low'",
  "tags?": "string[]",
  "metadata?": "object",
});

/** Email send result */
export const emailSendResult = type({
  success: "boolean",
  messageId: "string",
  "accepted?": "string[]",
  "rejected?": "string[]",
  "pending?": "string[]",
});

// ============================================================================
// Email Provider Config Schemas
// ============================================================================

/** SMTP config */
export const smtpConfig = type({
  host: "string >= 1",
  port: "number > 0",
  "secure?": "boolean",
  "auth?": {
    user: "string",
    pass: "string",
  },
  "tls?": "object",
});

/** Resend config */
export const resendConfig = type({
  apiKey: "string >= 1",
  "domain?": "string",
});

/** SendGrid config */
export const sendgridConfig = type({
  apiKey: "string >= 1",
});

/** AWS SES config */
export const sesConfig = type({
  region: "string >= 1",
  "accessKeyId?": "string",
  "secretAccessKey?": "string",
  "endpoint?": "string",
});

/** Postmark config */
export const postmarkConfig = type({
  serverToken: "string >= 1",
});

/** Email provider config */
export const emailConfig = type({
  provider: "'smtp' | 'resend' | 'sendgrid' | 'ses' | 'postmark' | 'mailgun'",
  "from?": "string.email | object",
  "replyTo?": "string.email | object",
  "smtp?": smtpConfig,
  "resend?": resendConfig,
  "sendgrid?": sendgridConfig,
  "ses?": sesConfig,
  "postmark?": postmarkConfig,
  "templates?": "object",
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Email address type with optional display name.
 * Contains email and optional name for formatted addresses like "John Doe <john@example.com>".
 */
export type EmailAddress = typeof emailAddress.infer;

/**
 * Email recipient type.
 * Accepts either a simple email string or an EmailAddress object.
 */
export type EmailRecipient = typeof emailRecipient.infer;

/**
 * Email attachment type.
 * Contains filename, content, encoding, and disposition for email attachments.
 */
export type EmailAttachment = typeof emailAttachment.infer;

/**
 * Send email options type.
 * Contains recipients, subject, body content (text/html), attachments, and metadata.
 */
export type SendEmailOptions = typeof sendEmailOptions.infer;

/**
 * Send template email options type.
 * Contains recipients, template name, template data, and attachments.
 */
export type SendTemplateEmailOptions = typeof sendTemplateEmailOptions.infer;

/**
 * Email send result type.
 * Contains success status, message ID, and lists of accepted/rejected/pending recipients.
 */
export type EmailSendResult = typeof emailSendResult.infer;

/**
 * SMTP configuration type.
 * Contains host, port, authentication, and TLS settings for SMTP servers.
 */
export type SmtpConfig = typeof smtpConfig.infer;

/**
 * Resend configuration type.
 * Contains API key and optional domain for the Resend email service.
 */
export type ResendConfig = typeof resendConfig.infer;

/**
 * SendGrid configuration type.
 * Contains API key for the SendGrid email service.
 */
export type SendgridConfig = typeof sendgridConfig.infer;

/**
 * AWS SES configuration type.
 * Contains region and optional credentials for Amazon Simple Email Service.
 */
export type SesConfig = typeof sesConfig.infer;

/**
 * Postmark configuration type.
 * Contains server token for the Postmark email service.
 */
export type PostmarkConfig = typeof postmarkConfig.infer;

/**
 * Email configuration type.
 * Contains provider selection and provider-specific configuration.
 */
export type EmailConfig = typeof emailConfig.infer;
