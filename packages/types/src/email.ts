/**
 * @parsrun/types - Email Schemas
 * Email service validation schemas
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

export type EmailAddress = typeof emailAddress.infer;
export type EmailRecipient = typeof emailRecipient.infer;
export type EmailAttachment = typeof emailAttachment.infer;
export type SendEmailOptions = typeof sendEmailOptions.infer;
export type SendTemplateEmailOptions = typeof sendTemplateEmailOptions.infer;
export type EmailSendResult = typeof emailSendResult.infer;
export type SmtpConfig = typeof smtpConfig.infer;
export type ResendConfig = typeof resendConfig.infer;
export type SendgridConfig = typeof sendgridConfig.infer;
export type SesConfig = typeof sesConfig.infer;
export type PostmarkConfig = typeof postmarkConfig.infer;
export type EmailConfig = typeof emailConfig.infer;
