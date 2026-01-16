/**
 * Email Service Types
 */

/**
 * Email provider interface
 */
export interface EmailProvider {
  /** Send an email */
  sendEmail(options: EmailOptions): Promise<EmailResult>;
}

/**
 * Email options
 */
export interface EmailOptions {
  /** Recipient email address */
  to: string;
  /** Email subject */
  subject: string;
  /** HTML content */
  html?: string;
  /** Plain text content */
  text?: string;
  /** From email (overrides default) */
  from?: string;
  /** Reply-to address */
  replyTo?: string;
  /** CC recipients */
  cc?: string[];
  /** BCC recipients */
  bcc?: string[];
  /** Custom headers */
  headers?: Record<string, string>;
  /** Attachments */
  attachments?: EmailAttachment[];
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * Email send result
 */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email service configuration
 */
export interface EmailServiceConfig {
  /** Email provider instance */
  provider?: EmailProvider;
  /** API key for default provider */
  apiKey?: string;
  /** Default from email */
  fromEmail?: string;
  /** Default from name */
  fromName?: string;
  /** Development mode (logs emails instead of sending) */
  devMode?: boolean;
}

/**
 * OTP email options
 */
export interface OTPEmailOptions {
  /** Recipient email */
  email: string;
  /** OTP code */
  code: string;
  /** Expiration in minutes (default: 10) */
  expiresInMinutes?: number;
  /** User name (for personalization) */
  userName?: string;
  /** App name */
  appName?: string;
}

/**
 * Verification email options
 */
export interface VerificationEmailOptions {
  /** Recipient email */
  email: string;
  /** Verification URL */
  verificationUrl: string;
  /** User name (for personalization) */
  userName?: string;
  /** Expiration in hours (default: 24) */
  expiresInHours?: number;
  /** App name */
  appName?: string;
}

/**
 * Welcome email options
 */
export interface WelcomeEmailOptions {
  /** Recipient email */
  email: string;
  /** User name */
  userName?: string;
  /** App name */
  appName?: string;
  /** Login URL */
  loginUrl?: string;
}

/**
 * Magic link email options
 */
export interface MagicLinkEmailOptions {
  /** Recipient email */
  email: string;
  /** Magic link URL */
  magicLinkUrl: string;
  /** Expiration in minutes (default: 15) */
  expiresInMinutes?: number;
  /** User name (for personalization) */
  userName?: string;
  /** App name */
  appName?: string;
}

/**
 * Password reset email options
 */
export interface PasswordResetEmailOptions {
  /** Recipient email */
  email: string;
  /** Reset URL */
  resetUrl: string;
  /** Expiration in hours (default: 1) */
  expiresInHours?: number;
  /** User name (for personalization) */
  userName?: string;
  /** App name */
  appName?: string;
}

/**
 * Invitation email options
 */
export interface InvitationEmailOptions {
  /** Recipient email */
  email: string;
  /** Invitation URL */
  invitationUrl: string;
  /** Inviter name */
  inviterName: string;
  /** Organization/tenant name */
  organizationName: string;
  /** Role being assigned */
  roleName?: string;
  /** Expiration in days (default: 7) */
  expiresInDays?: number;
  /** App name */
  appName?: string;
}
