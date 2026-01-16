/**
 * SMS Service
 * Provides SMS sending functionality
 */

/**
 * SMS provider interface
 */
export interface SMSProvider {
  /** Send an SMS */
  sendSMS(options: SMSOptions): Promise<SMSResult>;
}

/**
 * SMS options
 */
export interface SMSOptions {
  /** Recipient phone number (E.164 format) */
  to: string;
  /** Message content */
  message: string;
  /** Sender ID (alphanumeric, max 11 chars) */
  from?: string;
}

/**
 * SMS send result
 */
export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * SMS service configuration
 */
export interface SMSServiceConfig {
  /** SMS provider instance */
  provider?: SMSProvider;
  /** Default sender ID */
  senderId?: string;
  /** Development mode (logs SMS instead of sending) */
  devMode?: boolean;
}

/**
 * OTP SMS options
 */
export interface OTPSMSOptions {
  /** Recipient phone number */
  phone: string;
  /** OTP code */
  code: string;
  /** Expiration in minutes (default: 10) */
  expiresInMinutes?: number;
  /** App name */
  appName?: string;
}

/**
 * SMS Service
 */
export class SMSService {
  private provider: SMSProvider | null;
  private senderId: string;
  private devMode: boolean;

  constructor(config: SMSServiceConfig) {
    this.devMode = config.devMode ?? process.env['NODE_ENV'] !== 'production';
    this.senderId = config.senderId ?? process.env['SMS_SENDER_ID'] ?? 'App';
    this.provider = config.provider ?? null;
  }

  /**
   * Send SMS
   */
  async sendSMS(options: SMSOptions): Promise<SMSResult> {
    // Development mode: log instead of send
    if (this.devMode) {
      console.log('📱 SMS (Development Mode):');
      console.log('To:', options.to);
      console.log('From:', options.from ?? this.senderId);
      console.log('Message:', options.message);
      console.log('─'.repeat(50));
      return { success: true, messageId: 'dev-mode-' + Date.now() };
    }

    if (!this.provider) {
      return { success: false, error: 'SMS provider not configured' };
    }

    return this.provider.sendSMS({
      ...options,
      from: options.from ?? this.senderId,
    });
  }

  /**
   * Send OTP SMS
   */
  async sendOTPSMS(options: OTPSMSOptions): Promise<SMSResult> {
    const { phone, code, expiresInMinutes = 10, appName = this.senderId } = options;

    const message = `Your ${appName} verification code is: ${code}. Valid for ${expiresInMinutes} minutes.`;

    return this.sendSMS({
      to: phone,
      message,
    });
  }
}

/**
 * Create SMS service
 */
export function createSMSService(config: SMSServiceConfig): SMSService {
  return new SMSService(config);
}

// Export providers
export { NetGSMProvider, createNetGSMProvider } from './netgsm-provider.js';
export type { NetGSMConfig } from './netgsm-provider.js';
