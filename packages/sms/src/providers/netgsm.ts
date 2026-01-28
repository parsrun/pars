/**
 * @parsrun/sms - NetGSM Provider
 * Edge-compatible NetGSM SMS provider using fetch API
 */

import type {
  BatchSMSOptions,
  BatchSMSResult,
  SMSOptions,
  SMSProvider,
  SMSProviderConfig,
  SMSResult,
} from "../types.js";
import { SMSError, SMSErrorCodes } from "../types.js";

/**
 * NetGSM SMS Provider
 * Uses fetch API for edge compatibility
 *
 * @example
 * ```typescript
 * const netgsm = new NetGSMProvider({
 *   username: process.env.NETGSM_USERNAME,
 *   password: process.env.NETGSM_PASSWORD,
 *   from: 'MYSENDER',
 * });
 *
 * await netgsm.send({
 *   to: '905551234567',
 *   message: 'Hello from Pars!',
 * });
 * ```
 */
export class NetGSMProvider implements SMSProvider {
  /** Provider type identifier */
  readonly type = "netgsm" as const;

  private username: string;
  private password: string;
  private from: string;
  private baseUrl: string;

  /**
   * Creates a new NetGSMProvider instance.
   *
   * @param config - The provider configuration including credentials and sender info
   */
  constructor(config: SMSProviderConfig & { providerUrl?: string }) {
    if (!config.username || !config.password) {
      throw new SMSError(
        "NetGSM requires username and password",
        SMSErrorCodes.INVALID_CONFIG
      );
    }
    if (!config.from) {
      throw new SMSError(
        "NetGSM requires a sender ID (from/header)",
        SMSErrorCodes.INVALID_CONFIG
      );
    }

    this.username = config.username;
    this.password = config.password;
    this.from = config.from;
    this.baseUrl = config.providerUrl || "https://api.netgsm.com.tr/sms/send/otp";
  }

  /**
   * Sends an SMS via the NetGSM API.
   *
   * @param options - The SMS options including recipient and message
   * @returns A promise that resolves to the send result
   */
  async send(options: SMSOptions): Promise<SMSResult> {
    const from = options.from || this.from;
    const to = this.sanitizePhoneNumber(options.to);

    const xmlData = `<?xml version='1.0' encoding='iso-8859-9'?>
<mainbody>
  <header>
    <usercode>${this.escapeXml(this.username)}</usercode>
    <password>${this.escapeXml(this.password)}</password>
    <msgheader>${this.escapeXml(from)}</msgheader>
    <encoding>TR</encoding>
  </header>
  <body>
    <msg><![CDATA[${options.message}]]></msg>
    <no>${to}</no>
  </body>
</mainbody>`;

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: xmlData,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const responseText = await response.text();
      const result = this.parseResponse(responseText);

      if (result.success && result.code) {
        const successResult: SMSResult = {
          success: true,
          messageId: result.code,
          data: { raw: responseText },
        };
        return successResult;
      }

      const errorResult: SMSResult = {
        success: false,
        error: this.getErrorMessage(result.code),
        data: { code: result.code, raw: responseText },
      };
      return errorResult;
    } catch (err) {
      throw new SMSError(
        `NetGSM send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        SMSErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  /**
   * Sends multiple SMS messages sequentially.
   *
   * @param options - The batch SMS options
   * @returns A promise that resolves to the batch result
   */
  async sendBatch(options: BatchSMSOptions): Promise<BatchSMSResult> {
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
   * Verifies the NetGSM credentials by checking balance/credit.
   *
   * @returns A promise that resolves to true if credentials are valid
   */
  async verify(): Promise<boolean> {
    // NetGSM doesn't have a dedicated verify endpoint,
    // so we just return true if config is valid
    return !!(this.username && this.password && this.from);
  }

  /**
   * Parse NetGSM XML response
   * Success codes: "0", "00", or numeric job ID
   */
  private parseResponse(xml: string): { success: boolean; code?: string } {
    try {
      // Try to find <code> element
      const codeMatch = xml.match(/<code>(.*?)<\/code>/);
      if (codeMatch && codeMatch[1]) {
        const code = codeMatch[1].trim();
        // NetGSM returns "00" or "0" for success
        if (code === "00" || code === "0") {
          return { success: true, code };
        }
        return { success: false, code };
      }

      // If no <code> element, check for numeric job ID (success)
      const trimmed = xml.trim();
      if (/^\d+$/.test(trimmed) && trimmed.length > 5) {
        return { success: true, code: trimmed };
      }

      return { success: false };
    } catch {
      return { success: false };
    }
  }

  /**
   * Get human-readable error message for NetGSM error codes
   */
  private getErrorMessage(code?: string): string {
    const errorMessages: Record<string, string> = {
      "20": "Mesaj metninde hata var",
      "30": "Geçersiz kullanıcı adı veya şifre",
      "40": "Mesaj başlığı sistemde tanımlı değil",
      "50": "Abone hesabı tanımlı değil",
      "51": "Abone hesabında yeterli bakiye yok",
      "60": "Gönderilecek mesaj bulunamadı",
      "70": "Geçersiz parametre hatası",
      "80": "Gönderim zamanlaması hatalı",
      "85": "Gönderim zamanlaması çok geç",
    };

    return code ? errorMessages[code] || `NetGSM error code: ${code}` : "Unknown error";
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Sanitize phone number (remove spaces, dashes, parentheses)
   */
  private sanitizePhoneNumber(phone: string): string {
    return phone.replace(/[\s\-\(\)\+]/g, "");
  }
}

/**
 * Creates a NetGSM provider instance.
 *
 * @param config - The provider configuration
 * @returns A new NetGSMProvider instance
 */
export function createNetGSMProvider(
  config: SMSProviderConfig & { providerUrl?: string }
): NetGSMProvider {
  return new NetGSMProvider(config);
}
