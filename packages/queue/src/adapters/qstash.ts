/**
 * @parsrun/queue - QStash Adapter
 * Edge-compatible Upstash QStash adapter using fetch API
 */

import type {
  BatchSendResult,
  QStashConfig,
  QueueAdapter,
  QueueMessage,
  SendMessageOptions,
} from "../types.js";
import { QueueError, QueueErrorCodes } from "../types.js";

/**
 * QStash Queue Adapter
 * Edge-compatible using HTTP API
 *
 * QStash is a serverless message queue that delivers messages via HTTP webhooks.
 * Messages are sent to QStash which then delivers them to your endpoint.
 *
 * @example
 * ```typescript
 * const queue = new QStashAdapter({
 *   token: process.env.QSTASH_TOKEN,
 *   destinationUrl: 'https://myapp.com/api/webhooks/queue',
 * });
 *
 * await queue.send({ userId: '123', action: 'welcome-email' });
 * ```
 */
export class QStashAdapter<T = unknown> implements QueueAdapter<T> {
  readonly type = "qstash" as const;
  readonly name = "qstash";

  private token: string;
  private destinationUrl: string;
  private baseUrl = "https://qstash.upstash.io/v2";

  constructor(config: QStashConfig) {
    this.token = config.token;
    this.destinationUrl = config.destinationUrl;
  }

  async send(body: T, options?: SendMessageOptions): Promise<string> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      };

      // Add delay
      if (options?.delaySeconds) {
        headers["Upstash-Delay"] = `${options.delaySeconds}s`;
      }

      // Add deduplication
      if (options?.deduplicationId) {
        headers["Upstash-Deduplication-Id"] = options.deduplicationId;
      }

      // Add custom headers from metadata
      if (options?.metadata) {
        for (const [key, value] of Object.entries(options.metadata)) {
          if (typeof value === "string") {
            headers[`Upstash-Forward-${key}`] = value;
          }
        }
      }

      const response = await fetch(
        `${this.baseUrl}/publish/${encodeURIComponent(this.destinationUrl)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`QStash API error: ${error}`);
      }

      const result = await response.json() as { messageId: string };
      return result.messageId;
    } catch (err) {
      throw new QueueError(
        `QStash send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        QueueErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  async sendBatch(
    messages: Array<{ body: T; options?: SendMessageOptions }>
  ): Promise<BatchSendResult> {
    try {
      const batchMessages = messages.map((m) => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (m.options?.delaySeconds) {
          headers["Upstash-Delay"] = `${m.options.delaySeconds}s`;
        }

        if (m.options?.deduplicationId) {
          headers["Upstash-Deduplication-Id"] = m.options.deduplicationId;
        }

        return {
          destination: this.destinationUrl,
          headers,
          body: JSON.stringify(m.body),
        };
      });

      const response = await fetch(`${this.baseUrl}/batch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchMessages),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`QStash API error: ${error}`);
      }

      const results = await response.json() as Array<{
        messageId?: string;
        error?: string;
      }>;

      const messageIds: string[] = [];
      const errors: Array<{ index: number; error: string }> = [];
      let successful = 0;
      let failed = 0;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result?.messageId) {
          messageIds.push(result.messageId);
          successful++;
        } else {
          failed++;
          errors.push({
            index: i,
            error: result?.error ?? "Unknown error",
          });
        }
      }

      return {
        total: messages.length,
        successful,
        failed,
        messageIds,
        errors,
      };
    } catch (err) {
      throw new QueueError(
        `QStash batch send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        QueueErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  /**
   * Schedule a message for future delivery
   */
  async schedule(
    body: T,
    cronExpression: string,
    options?: Omit<SendMessageOptions, "delaySeconds">
  ): Promise<string> {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Upstash-Cron": cronExpression,
      };

      if (options?.deduplicationId) {
        headers["Upstash-Deduplication-Id"] = options.deduplicationId;
      }

      const response = await fetch(
        `${this.baseUrl}/schedules/${encodeURIComponent(this.destinationUrl)}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`QStash API error: ${error}`);
      }

      const result = await response.json() as { scheduleId: string };
      return result.scheduleId;
    } catch (err) {
      throw new QueueError(
        `QStash schedule failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        QueueErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  /**
   * Delete a scheduled message
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`QStash API error: ${error}`);
      }
    } catch (err) {
      throw new QueueError(
        `QStash delete schedule failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        QueueErrorCodes.SEND_FAILED,
        err
      );
    }
  }

  /**
   * List all schedules
   */
  async listSchedules(): Promise<
    Array<{
      scheduleId: string;
      cron: string;
      destination: string;
      body?: string;
      createdAt: number;
    }>
  > {
    try {
      const response = await fetch(`${this.baseUrl}/schedules`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`QStash API error: ${error}`);
      }

      return await response.json() as Array<{
        scheduleId: string;
        cron: string;
        destination: string;
        body?: string;
        createdAt: number;
      }>;
    } catch (err) {
      throw new QueueError(
        `QStash list schedules failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        QueueErrorCodes.SEND_FAILED,
        err
      );
    }
  }
}

/**
 * QStash Message Receiver
 * Helper for receiving and verifying messages in your webhook endpoint
 *
 * @example
 * ```typescript
 * // In your API route
 * const receiver = new QStashReceiver({
 *   currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
 *   nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
 * });
 *
 * export async function POST(request: Request) {
 *   const message = await receiver.verify(request);
 *   if (!message) {
 *     return new Response('Invalid signature', { status: 401 });
 *   }
 *
 *   // Process the message
 *   console.log(message.body);
 *   return new Response('OK');
 * }
 * ```
 */
export class QStashReceiver<T = unknown> {
  private currentSigningKey: string;
  private nextSigningKey: string;

  constructor(config: { currentSigningKey: string; nextSigningKey: string }) {
    this.currentSigningKey = config.currentSigningKey;
    this.nextSigningKey = config.nextSigningKey;
  }

  /**
   * Verify a request from QStash and extract the message
   */
  async verify(request: Request): Promise<QueueMessage<T> | null> {
    const signature = request.headers.get("Upstash-Signature");

    if (!signature) {
      return null;
    }

    const body = await request.text();

    // Try current key first, then next key
    const isValid =
      (await this.verifySignature(body, signature, this.currentSigningKey)) ||
      (await this.verifySignature(body, signature, this.nextSigningKey));

    if (!isValid) {
      return null;
    }

    const messageId = request.headers.get("Upstash-Message-Id") ?? `qstash-${Date.now()}`;
    const retryCount = parseInt(
      request.headers.get("Upstash-Retried") ?? "0",
      10
    );

    let parsedBody: T;
    try {
      parsedBody = JSON.parse(body) as T;
    } catch {
      parsedBody = body as T;
    }

    return {
      id: messageId,
      body: parsedBody,
      timestamp: new Date(),
      attempts: retryCount + 1,
    };
  }

  private async verifySignature(
    body: string,
    signature: string,
    key: string
  ): Promise<boolean> {
    try {
      // Parse JWT-like signature
      const parts = signature.split(".");
      if (parts.length !== 3) {
        return false;
      }

      const [headerB64, payloadB64, signatureB64] = parts;
      if (!headerB64 || !payloadB64 || !signatureB64) {
        return false;
      }

      // Verify signature using Web Crypto API
      const encoder = new TextEncoder();
      const keyData = encoder.encode(key);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const signatureData = this.base64UrlDecode(signatureB64);
      const dataToVerify = encoder.encode(`${headerB64}.${payloadB64}`);

      const isValid = await crypto.subtle.verify(
        "HMAC",
        cryptoKey,
        signatureData,
        dataToVerify
      );

      if (!isValid) {
        return false;
      }

      // Verify payload contains correct body hash
      const payload = JSON.parse(atob(payloadB64)) as {
        body?: string;
        iss?: string;
        sub?: string;
        exp?: number;
        nbf?: number;
        iat?: number;
      };

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return false;
      }

      // Check not before
      if (payload.nbf && payload.nbf > now) {
        return false;
      }

      // Verify body hash
      if (payload.body) {
        const bodyHash = await this.sha256(body);
        const expectedHash = this.base64UrlEncode(
          new Uint8Array(
            atob(payload.body)
              .split("")
              .map((c) => c.charCodeAt(0))
          )
        );

        if (bodyHash !== expectedHash && payload.body !== bodyHash) {
          // Also try direct comparison
          const directHash = await this.sha256Base64(body);
          if (directHash !== payload.body) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  private base64UrlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padding = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padding);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private base64UrlEncode(data: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return this.base64UrlEncode(new Uint8Array(hash));
  }

  private async sha256Base64(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest("SHA-256", data);
    let binary = "";
    const bytes = new Uint8Array(hash);
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary);
  }
}

/**
 * Create a QStash queue adapter
 */
export function createQStashAdapter<T = unknown>(
  config: QStashConfig
): QStashAdapter<T> {
  return new QStashAdapter<T>(config);
}

/**
 * Create a QStash receiver for webhook verification
 */
export function createQStashReceiver<T = unknown>(config: {
  currentSigningKey: string;
  nextSigningKey: string;
}): QStashReceiver<T> {
  return new QStashReceiver<T>(config);
}
