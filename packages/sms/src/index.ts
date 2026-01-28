/**
 * @module
 * Edge-compatible SMS sending for Pars.
 *
 * Supports multiple providers:
 * - NetGSM (Turkey)
 * - Console (development)
 *
 * @example
 * ```typescript
 * import { createSMSService } from '@parsrun/sms';
 *
 * const sms = createSMSService({
 *   provider: 'netgsm',
 *   username: process.env.NETGSM_USERNAME,
 *   password: process.env.NETGSM_PASSWORD,
 *   from: 'MYSENDER',
 * });
 *
 * await sms.send({
 *   to: '905551234567',
 *   message: 'Your verification code is: 123456',
 * });
 * ```
 */

// Re-export types
export * from "./types.js";

// Re-export providers
export { NetGSMProvider, createNetGSMProvider } from "./providers/netgsm.js";
export { ConsoleProvider, createConsoleProvider } from "./providers/console.js";

import type {
  BatchSMSOptions,
  BatchSMSResult,
  SMSOptions,
  SMSProvider,
  SMSProviderConfig,
  SMSProviderType,
  SMSResult,
  SMSServiceConfig,
} from "./types.js";
import { SMSError, SMSErrorCodes } from "./types.js";
import { NetGSMProvider } from "./providers/netgsm.js";
import { ConsoleProvider } from "./providers/console.js";

/**
 * SMS Service
 *
 * High-level SMS service that provides a unified interface for sending SMS
 * through various providers (NetGSM, Twilio, or Console for development).
 *
 * @example
 * ```typescript
 * const service = new SMSService({
 *   provider: 'netgsm',
 *   username: 'your-username',
 *   password: 'your-password',
 *   from: 'MYSENDER',
 * });
 *
 * await service.send({
 *   to: '905551234567',
 *   message: 'Hello!',
 * });
 * ```
 */
export class SMSService {
  private provider: SMSProvider;
  private debug: boolean;

  /**
   * Creates a new SMSService instance.
   *
   * @param config - The SMS service configuration
   */
  constructor(config: SMSServiceConfig) {
    this.debug = config.debug ?? false;
    this.provider = this.createProvider(config);
  }

  private createProvider(config: SMSServiceConfig): SMSProvider {
    // Build config object conditionally to satisfy exactOptionalPropertyTypes
    const providerConfig: SMSProviderConfig & { providerUrl?: string } = {};
    if (config.apiKey !== undefined) providerConfig.apiKey = config.apiKey;
    if (config.username !== undefined) providerConfig.username = config.username;
    if (config.password !== undefined) providerConfig.password = config.password;
    if (config.from !== undefined) providerConfig.from = config.from;
    if (config.options !== undefined) providerConfig.options = config.options;
    if (config.providerUrl !== undefined) providerConfig.providerUrl = config.providerUrl;

    switch (config.provider) {
      case "netgsm":
        return new NetGSMProvider(providerConfig);
      case "console":
        return new ConsoleProvider(providerConfig);
      default:
        throw new SMSError(
          `Unknown SMS provider: ${config.provider}`,
          SMSErrorCodes.INVALID_CONFIG
        );
    }
  }

  /**
   * Gets the type of SMS provider being used.
   */
  get providerType(): SMSProviderType {
    return this.provider.type;
  }

  /**
   * Sends a single SMS message.
   *
   * @param options - The SMS options
   * @returns A promise that resolves to the send result
   */
  async send(options: SMSOptions): Promise<SMSResult> {
    if (this.debug) {
      console.log("[SMS] Sending:", {
        to: options.to,
        message: options.message.slice(0, 50) + (options.message.length > 50 ? "..." : ""),
        provider: this.provider.type,
      });
    }

    const result = await this.provider.send(options);

    if (this.debug) {
      console.log("[SMS] Result:", result);
    }

    return result;
  }

  /**
   * Sends multiple SMS messages in a batch.
   *
   * @param options - The batch SMS options
   * @returns A promise that resolves to the batch result
   */
  async sendBatch(options: BatchSMSOptions): Promise<BatchSMSResult> {
    if (this.debug) {
      console.log("[SMS] Sending batch:", {
        count: options.messages.length,
        provider: this.provider.type,
      });
    }

    // Use provider's native batch if available
    if (this.provider.sendBatch) {
      const result = await this.provider.sendBatch(options);

      if (this.debug) {
        console.log("[SMS] Batch result:", {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
        });
      }

      return result;
    }

    // Fallback to sequential sending
    const results: SMSResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const sms of options.messages) {
      try {
        const result = await this.send(sms);
        results.push(result);

        if (result.success) {
          successful++;
        } else {
          failed++;
          if (options.stopOnError) break;
        }
      } catch (err) {
        failed++;
        results.push({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });

        if (options.stopOnError) break;
      }
    }

    return {
      total: options.messages.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Verifies the provider configuration.
   *
   * @returns A promise that resolves to true if configuration is valid
   */
  async verify(): Promise<boolean> {
    if (this.provider.verify) {
      return this.provider.verify();
    }
    return true;
  }

  /**
   * Send OTP verification SMS
   *
   * @param phone - Recipient phone number
   * @param code - OTP code
   * @param expiresInMinutes - Code expiration time
   */
  async sendOTP(
    phone: string,
    code: string,
    expiresInMinutes = 10
  ): Promise<SMSResult> {
    const message = `Dogrulama kodunuz: ${code}. Bu kod ${expiresInMinutes} dakika gecerlidir.`;
    return this.send({ to: phone, message });
  }

  /**
   * Send welcome SMS
   *
   * @param phone - Recipient phone number
   * @param name - User's display name
   */
  async sendWelcome(phone: string, name?: string): Promise<SMSResult> {
    const displayName = name || "Kullanici";
    const message = `Merhaba ${displayName}! Hesabiniz basariyla olusturuldu.`;
    return this.send({ to: phone, message });
  }
}

/**
 * Create an SMS service
 *
 * @example
 * ```typescript
 * // With NetGSM
 * const sms = createSMSService({
 *   provider: 'netgsm',
 *   username: process.env.NETGSM_USERNAME,
 *   password: process.env.NETGSM_PASSWORD,
 *   from: 'MYSENDER',
 * });
 *
 * // For development
 * const sms = createSMSService({
 *   provider: 'console',
 *   from: 'TEST',
 * });
 * ```
 */
export function createSMSService(config: SMSServiceConfig): SMSService {
  return new SMSService(config);
}

/**
 * Creates an SMS provider instance directly.
 *
 * @param type - The type of SMS provider to create
 * @param config - The provider configuration
 * @returns A new SMS provider instance
 */
export function createSMSProvider(
  type: SMSProviderType,
  config: SMSProviderConfig & { providerUrl?: string }
): SMSProvider {
  switch (type) {
    case "netgsm":
      return new NetGSMProvider(config);
    case "console":
      return new ConsoleProvider(config);
    default:
      throw new SMSError(
        `Unknown SMS provider: ${type}`,
        SMSErrorCodes.INVALID_CONFIG
      );
  }
}

// Default export
export default {
  SMSService,
  createSMSService,
  createSMSProvider,
};
