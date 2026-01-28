/**
 * @parsrun/sms - Type definitions
 */

/**
 * Supported SMS provider types
 */
export type SMSProviderType = "netgsm" | "twilio" | "console";

/**
 * SMS send options
 */
export interface SMSOptions {
  /** Recipient phone number (international format recommended, e.g., 905xxxxxxxxx) */
  to: string;
  /** SMS message content */
  message: string;
  /** Optional sender ID override */
  from?: string;
  /** Optional metadata/tags */
  tags?: Record<string, string>;
}

/**
 * SMS send result
 */
export interface SMSResult {
  /** Whether the SMS was sent successfully */
  success: boolean;
  /** Provider-specific message ID */
  messageId?: string;
  /** Error message if send failed */
  error?: string;
  /** Raw provider response data */
  data?: unknown;
}

/**
 * Batch SMS options
 */
export interface BatchSMSOptions {
  /** Array of SMS messages to send */
  messages: SMSOptions[];
  /** Stop sending if an error occurs */
  stopOnError?: boolean;
}

/**
 * Batch SMS result
 */
export interface BatchSMSResult {
  /** Total number of messages attempted */
  total: number;
  /** Number of successfully sent messages */
  successful: number;
  /** Number of failed messages */
  failed: number;
  /** Individual results for each message */
  results: SMSResult[];
}

/**
 * SMS provider configuration
 */
export interface SMSProviderConfig {
  /** API key or authentication token */
  apiKey?: string;
  /** Provider username (for providers like NetGSM) */
  username?: string;
  /** Provider password (for providers like NetGSM) */
  password?: string;
  /** Default sender ID/header */
  from?: string;
  /** Provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * SMS service configuration
 */
export interface SMSServiceConfig extends SMSProviderConfig {
  /** SMS provider type */
  provider: SMSProviderType;
  /** Provider API URL (for custom endpoints) */
  providerUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * SMS provider interface
 */
export interface SMSProvider {
  /** Provider type identifier */
  readonly type: SMSProviderType;

  /** Send a single SMS */
  send(options: SMSOptions): Promise<SMSResult>;

  /** Send multiple SMS messages (optional) */
  sendBatch?(options: BatchSMSOptions): Promise<BatchSMSResult>;

  /** Verify provider configuration (optional) */
  verify?(): Promise<boolean>;
}

/**
 * SMS error codes
 */
export const SMSErrorCodes = {
  INVALID_CONFIG: "SMS_INVALID_CONFIG",
  SEND_FAILED: "SMS_SEND_FAILED",
  INVALID_PHONE: "SMS_INVALID_PHONE",
  RATE_LIMITED: "SMS_RATE_LIMITED",
  INSUFFICIENT_BALANCE: "SMS_INSUFFICIENT_BALANCE",
  PROVIDER_ERROR: "SMS_PROVIDER_ERROR",
} as const;

export type SMSErrorCode = (typeof SMSErrorCodes)[keyof typeof SMSErrorCodes];

/**
 * SMS error class
 */
export class SMSError extends Error {
  code: SMSErrorCode;
  cause?: unknown;

  constructor(message: string, code: SMSErrorCode, cause?: unknown) {
    super(message);
    this.name = "SMSError";
    this.code = code;
    this.cause = cause;
  }
}
