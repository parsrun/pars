/**
 * Email Service
 * Provides email sending functionality with templates
 */

import type {
  EmailProvider,
  EmailOptions,
  EmailResult,
  EmailServiceConfig,
  OTPEmailOptions,
  VerificationEmailOptions,
  WelcomeEmailOptions,
  MagicLinkEmailOptions,
  PasswordResetEmailOptions,
  InvitationEmailOptions,
} from './types.js';
import { ResendEmailProvider } from './resend-provider.js';
import { generateOTPEmailHTML, generateOTPEmailText } from './templates/otp.js';
import { generateVerificationEmailHTML, generateVerificationEmailText } from './templates/verification.js';
import { generateMagicLinkEmailHTML, generateMagicLinkEmailText } from './templates/magic-link.js';

// Re-export types and providers
export * from './types.js';
export { ResendEmailProvider, createResendProvider } from './resend-provider.js';

/**
 * Email Service
 * Singleton service for sending emails
 */
export class EmailService {
  private provider: EmailProvider;
  private fromEmail: string;
  private fromName: string;
  private devMode: boolean;

  constructor(config: EmailServiceConfig) {
    this.devMode = config.devMode ?? process.env['NODE_ENV'] !== 'production';
    this.fromEmail = config.fromEmail ?? process.env['EMAIL_FROM_ADDRESS'] ?? 'noreply@example.com';
    this.fromName = config.fromName ?? process.env['EMAIL_FROM_NAME'] ?? 'App';

    if (config.provider) {
      this.provider = config.provider;
    } else {
      const apiKey = config.apiKey ?? process.env['RESEND_API_KEY'] ?? process.env['EMAIL_API_KEY'];
      if (!apiKey) {
        throw new Error('Email API key is required (RESEND_API_KEY or EMAIL_API_KEY)');
      }
      this.provider = new ResendEmailProvider({
        apiKey,
        fromEmail: this.fromEmail,
        fromName: this.fromName,
      });
    }
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    // Development mode: log instead of send
    if (this.devMode) {
      console.log('📧 EMAIL (Development Mode):');
      console.log('To:', options.to);
      console.log('Subject:', options.subject);
      console.log('From:', options.from ?? `${this.fromName} <${this.fromEmail}>`);
      console.log('Content:', options.html?.substring(0, 200) ?? options.text?.substring(0, 200));
      console.log('─'.repeat(50));
      return { success: true, messageId: 'dev-mode-' + Date.now() };
    }

    return this.provider.sendEmail(options);
  }

  /**
   * Send OTP verification email
   */
  async sendOTPEmail(options: OTPEmailOptions): Promise<EmailResult> {
    const { email, code, expiresInMinutes = 10, userName, appName = this.fromName } = options;

    return this.sendEmail({
      to: email,
      subject: `Your ${appName} Verification Code`,
      html: generateOTPEmailHTML({ code, expiresInMinutes, userName, appName }),
      text: generateOTPEmailText({ code, expiresInMinutes, userName, appName }),
    });
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(options: VerificationEmailOptions): Promise<EmailResult> {
    const { email, verificationUrl, userName, expiresInHours = 24, appName = this.fromName } = options;

    return this.sendEmail({
      to: email,
      subject: `Verify your ${appName} email`,
      html: generateVerificationEmailHTML({ verificationUrl, userName, expiresInHours, appName }),
      text: generateVerificationEmailText({ verificationUrl, userName, expiresInHours, appName }),
    });
  }

  /**
   * Send magic link email
   */
  async sendMagicLinkEmail(options: MagicLinkEmailOptions): Promise<EmailResult> {
    const { email, magicLinkUrl, expiresInMinutes = 15, userName, appName = this.fromName } = options;

    return this.sendEmail({
      to: email,
      subject: `Sign in to ${appName}`,
      html: generateMagicLinkEmailHTML({ magicLinkUrl, expiresInMinutes, userName, appName }),
      text: generateMagicLinkEmailText({ magicLinkUrl, expiresInMinutes, userName, appName }),
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(options: WelcomeEmailOptions): Promise<EmailResult> {
    const { email, userName, appName = this.fromName, loginUrl } = options;

    const greeting = userName ? `Hi ${userName}` : 'Welcome';

    return this.sendEmail({
      to: email,
      subject: `Welcome to ${appName}!`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>${greeting},</h1>
          <p>Thank you for joining ${appName}!</p>
          <p>We're excited to have you on board.</p>
          ${loginUrl ? `<p><a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Get Started</a></p>` : ''}
          <p>Best regards,<br>The ${appName} Team</p>
        </div>
      `,
      text: `${greeting},\n\nThank you for joining ${appName}!\n\nWe're excited to have you on board.\n\n${loginUrl ? `Get Started: ${loginUrl}\n\n` : ''}Best regards,\nThe ${appName} Team`,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(options: PasswordResetEmailOptions): Promise<EmailResult> {
    const { email, resetUrl, expiresInHours = 1, userName, appName = this.fromName } = options;

    const greeting = userName ? `Hi ${userName}` : 'Hello';

    return this.sendEmail({
      to: email,
      subject: `Reset your ${appName} password`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>${greeting},</h1>
          <p>We received a request to reset your password.</p>
          <p>Click the button below to reset it. This link expires in ${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}.</p>
          <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
          <p>Best regards,<br>The ${appName} Team</p>
        </div>
      `,
      text: `${greeting},\n\nWe received a request to reset your password.\n\nClick the link below to reset it. This link expires in ${expiresInHours} hour${expiresInHours > 1 ? 's' : ''}.\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\nBest regards,\nThe ${appName} Team`,
    });
  }

  /**
   * Send invitation email
   */
  async sendInvitationEmail(options: InvitationEmailOptions): Promise<EmailResult> {
    const {
      email,
      invitationUrl,
      inviterName,
      organizationName,
      roleName,
      expiresInDays = 7,
      appName = this.fromName,
    } = options;

    const roleText = roleName ? ` as a ${roleName}` : '';

    return this.sendEmail({
      to: email,
      subject: `You're invited to join ${organizationName} on ${appName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>You're Invited!</h1>
          <p>${inviterName} has invited you to join <strong>${organizationName}</strong>${roleText}.</p>
          <p>Click the button below to accept the invitation. This link expires in ${expiresInDays} day${expiresInDays > 1 ? 's' : ''}.</p>
          <p><a href="${invitationUrl}" style="display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">Accept Invitation</a></p>
          <p style="color: #666; font-size: 14px;">If you don't want to join, you can safely ignore this email.</p>
          <p>Best regards,<br>The ${appName} Team</p>
        </div>
      `,
      text: `You're Invited!\n\n${inviterName} has invited you to join ${organizationName}${roleText}.\n\nClick the link below to accept the invitation. This link expires in ${expiresInDays} day${expiresInDays > 1 ? 's' : ''}.\n\n${invitationUrl}\n\nIf you don't want to join, you can safely ignore this email.\n\nBest regards,\nThe ${appName} Team`,
    });
  }
}

/**
 * Create email service
 */
export function createEmailService(config: EmailServiceConfig): EmailService {
  return new EmailService(config);
}
