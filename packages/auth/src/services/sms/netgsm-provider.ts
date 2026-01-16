/**
 * NetGSM SMS Provider
 * Turkish SMS gateway provider
 */

import type { SMSProvider, SMSOptions, SMSResult } from './index.js';

/**
 * NetGSM configuration
 */
export interface NetGSMConfig {
  /** NetGSM username */
  username: string;
  /** NetGSM password */
  password: string;
  /** SMS header/sender ID */
  header: string;
  /** NetGSM API URL (default: https://api.netgsm.com.tr/sms/send/otp) */
  apiUrl?: string;
}

/**
 * NetGSM SMS Provider
 */
export class NetGSMProvider implements SMSProvider {
  private config: Required<NetGSMConfig>;

  constructor(config: NetGSMConfig) {
    this.config = {
      apiUrl: 'https://api.netgsm.com.tr/sms/send/otp',
      ...config,
    };
  }

  /**
   * Send SMS via NetGSM API
   */
  async sendSMS(options: SMSOptions): Promise<SMSResult> {
    try {
      // Build XML payload for NetGSM API
      const xmlData = `<?xml version='1.0' encoding='iso-8859-9'?>
<mainbody>
  <header>
    <usercode>${this.escapeXml(this.config.username)}</usercode>
    <password>${this.escapeXml(this.config.password)}</password>
    <msgheader>${this.escapeXml(options.from ?? this.config.header)}</msgheader>
    <encoding>TR</encoding>
  </header>
  <body>
    <msg><![CDATA[${options.message}]]></msg>
    <no>${this.sanitizePhoneNumber(options.to)}</no>
  </body>
</mainbody>`;

      // Send request to NetGSM API
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
        },
        body: xmlData,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      // Parse XML response
      const responseText = await response.text();
      const result = this.parseResponse(responseText);

      if (result.success) {
        return {
          success: true,
          messageId: result.code,
        };
      }

      return {
        success: false,
        error: `NetGSM error code: ${result.code} - ${this.getErrorMessage(result.code ?? '')}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse NetGSM XML response
   */
  private parseResponse(xml: string): { success: boolean; code?: string } {
    try {
      // Simple XML parsing for <code> element
      const codeMatch = xml.match(/<code>(.*?)<\/code>/);
      if (!codeMatch) {
        // Try alternative format (plain text response)
        const trimmed = xml.trim();
        if (trimmed.length < 20 && /^\d+$/.test(trimmed)) {
          // Response is just a code
          if (trimmed === '00' || trimmed === '0') {
            return { success: true, code: trimmed };
          }
          return { success: false, code: trimmed };
        }
        return { success: false };
      }

      const code = codeMatch[1]!.trim();

      // NetGSM returns "00" or "0" for success
      if (code === '00' || code === '0' || code.length > 10) {
        return { success: true, code };
      }

      return { success: false, code };
    } catch {
      return { success: false };
    }
  }

  /**
   * Get human-readable error message
   */
  private getErrorMessage(code: string): string {
    const errors: Record<string, string> = {
      '20': 'Message text is missing',
      '30': 'Invalid credentials',
      '40': 'Sender ID not approved',
      '50': 'Invalid recipient number',
      '51': 'Duplicate recipient',
      '60': 'OTP sending blocked',
      '70': 'Incorrect parameter format',
      '80': 'Query limit exceeded',
      '85': 'Same content sent too frequently',
    };

    return errors[code] ?? 'Unknown error';
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Sanitize phone number
   */
  private sanitizePhoneNumber(phone: string): string {
    // Remove spaces, dashes, parentheses
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Remove leading + if present
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }

    // If Turkish number without country code, add it
    if (cleaned.startsWith('5') && cleaned.length === 10) {
      cleaned = '90' + cleaned;
    }

    return cleaned;
  }
}

/**
 * Create NetGSM provider
 */
export function createNetGSMProvider(config: NetGSMConfig): NetGSMProvider {
  return new NetGSMProvider(config);
}
