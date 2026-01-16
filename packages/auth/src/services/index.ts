/**
 * Services
 * Email, SMS, and verification services
 */

// Email Service
export {
  EmailService,
  createEmailService,
  ResendEmailProvider,
  createResendProvider,
  type EmailProvider,
  type EmailOptions,
  type EmailResult,
  type EmailServiceConfig,
  type OTPEmailOptions,
  type VerificationEmailOptions,
  type WelcomeEmailOptions,
  type MagicLinkEmailOptions,
  type PasswordResetEmailOptions,
  type InvitationEmailOptions,
  type EmailAttachment,
} from './email/index.js';

// SMS Service
export {
  SMSService,
  createSMSService,
  NetGSMProvider,
  createNetGSMProvider,
  type SMSProvider,
  type SMSOptions,
  type SMSResult,
  type SMSServiceConfig,
  type OTPSMSOptions,
  type NetGSMConfig,
} from './sms/index.js';

// Email Verification Service
export {
  EmailVerificationService,
  createEmailVerificationService,
  type EmailVerificationConfig,
  type RequestVerificationResult,
  type VerifyEmailResult,
  type VerificationStatus,
} from './email-verification/index.js';
