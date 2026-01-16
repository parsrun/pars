/**
 * @parsrun/email - Type Definitions
 * Email types and interfaces
 */

// Re-export types from @parsrun/types for convenience
export {
  type,
  emailAddress,
  emailAttachment,
  sendEmailOptions,
  sendTemplateEmailOptions,
  emailSendResult,
  smtpConfig,
  resendConfig,
  sendgridConfig,
  sesConfig,
  postmarkConfig,
  emailConfig,
  type EmailAddress as ParsEmailAddress,
  type EmailAttachment as ParsEmailAttachment,
  type SendEmailOptions,
  type SendTemplateEmailOptions,
  type EmailSendResult,
  type SmtpConfig,
  type ResendConfig,
  type SendgridConfig,
  type SesConfig,
  type PostmarkConfig,
  type EmailConfig,
} from "@parsrun/types";

/**
 * Email provider type
 */
export type EmailProviderType = "resend" | "sendgrid" | "postmark" | "ses" | "console" | "mailgun";

/**
 * Email address with optional name
 */
export interface EmailAddress {
  email: string;
  name?: string | undefined;
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  /** File name */
  filename: string;
  /** File content (base64 encoded or Buffer) */
  content: string | Uint8Array;
  /** Content type (MIME type) */
  contentType?: string | undefined;
  /** Content ID for inline attachments */
  contentId?: string | undefined;
}

/**
 * Email options
 */
export interface EmailOptions {
  /** Recipient email address(es) */
  to: string | string[] | EmailAddress | EmailAddress[];
  /** Email subject */
  subject: string;
  /** HTML content */
  html?: string | undefined;
  /** Plain text content */
  text?: string | undefined;
  /** From address (overrides default) */
  from?: string | EmailAddress | undefined;
  /** Reply-to address */
  replyTo?: string | EmailAddress | undefined;
  /** CC recipients */
  cc?: string | string[] | EmailAddress | EmailAddress[] | undefined;
  /** BCC recipients */
  bcc?: string | string[] | EmailAddress | EmailAddress[] | undefined;
  /** Attachments */
  attachments?: EmailAttachment[] | undefined;
  /** Custom headers */
  headers?: Record<string, string> | undefined;
  /** Tags for tracking */
  tags?: Record<string, string> | undefined;
  /** Schedule send time */
  scheduledAt?: Date | undefined;
}

/**
 * Email send result
 */
export interface EmailResult {
  /** Whether send was successful */
  success: boolean;
  /** Message ID from provider */
  messageId?: string | undefined;
  /** Error message if failed */
  error?: string | undefined;
  /** Provider-specific response data */
  data?: unknown;
}

/**
 * Batch email options
 */
export interface BatchEmailOptions {
  /** List of emails to send */
  emails: EmailOptions[];
  /** Whether to stop on first error */
  stopOnError?: boolean | undefined;
}

/**
 * Batch email result
 */
export interface BatchEmailResult {
  /** Total emails attempted */
  total: number;
  /** Successful sends */
  successful: number;
  /** Failed sends */
  failed: number;
  /** Individual results */
  results: EmailResult[];
}

/**
 * Email provider configuration
 */
export interface EmailProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Default from email */
  fromEmail: string;
  /** Default from name */
  fromName?: string | undefined;
  /** Provider-specific options */
  options?: Record<string, unknown> | undefined;
}

/**
 * Email provider interface
 */
export interface EmailProvider {
  /** Provider type */
  readonly type: EmailProviderType;

  /**
   * Send a single email
   */
  send(options: EmailOptions): Promise<EmailResult>;

  /**
   * Send multiple emails
   */
  sendBatch?(options: BatchEmailOptions): Promise<BatchEmailResult>;

  /**
   * Verify provider configuration
   */
  verify?(): Promise<boolean>;
}

/**
 * Email service configuration
 */
export interface EmailServiceConfig {
  /** Provider type */
  provider: EmailProviderType;
  /** API key */
  apiKey: string;
  /** Default from email */
  fromEmail: string;
  /** Default from name */
  fromName?: string | undefined;
  /** Enable debug logging */
  debug?: boolean | undefined;
  /** Provider-specific options */
  providerOptions?: Record<string, unknown> | undefined;
}

/**
 * Template data for email templates
 */
export interface TemplateData {
  [key: string]: string | number | boolean | undefined | null | TemplateData | TemplateData[];
}

/**
 * Email template
 */
export interface EmailTemplate {
  /** Template name */
  name: string;
  /** Subject template */
  subject: string;
  /** HTML template */
  html: string;
  /** Plain text template */
  text?: string | undefined;
}

/**
 * Email error
 */
export class EmailError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "EmailError";
  }
}

/**
 * Common email error codes
 */
export const EmailErrorCodes = {
  INVALID_CONFIG: "INVALID_CONFIG",
  INVALID_RECIPIENT: "INVALID_RECIPIENT",
  INVALID_CONTENT: "INVALID_CONTENT",
  SEND_FAILED: "SEND_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  TEMPLATE_ERROR: "TEMPLATE_ERROR",
  ATTACHMENT_ERROR: "ATTACHMENT_ERROR",
} as const;
