/**
 * @parsrun/payments - Fallback Executor
 * Handles provider fallback with safety controls
 */

import type { PaymentProvider, PaymentProviderType } from "../types.js";
import { PaymentErrorCodes } from "../types.js";
import type {
  FallbackConfig,
  FallbackOperation,
  FallbackContext,
  BillingLogger,
} from "./types.js";
import { BillingError } from "./types.js";

/**
 * Default retryable error codes
 */
const DEFAULT_RETRYABLE_ERRORS = [
  PaymentErrorCodes.API_ERROR,
  PaymentErrorCodes.RATE_LIMITED,
  "PROVIDER_UNAVAILABLE",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "NetworkError",
  "fetch failed",
];

/**
 * Default allowed operations for fallback
 * Only checkout is safe by default - subscriptions can cause issues
 */
const DEFAULT_ALLOWED_OPERATIONS: FallbackOperation[] = ["createCheckout"];

/**
 * Internal config type with required fields
 */
interface InternalFallbackConfig {
  enabled: boolean;
  maxAttempts: number;
  allowedOperations: FallbackOperation[];
  retryableErrors: string[];
  providers: PaymentProvider[] | undefined;
  onFallback: ((context: FallbackContext) => void | Promise<void>) | undefined;
  onAllFailed: ((context: FallbackContext) => void | Promise<void>) | undefined;
}

/**
 * Fallback Executor
 * Handles provider fallback with safety controls and logging
 */
export class FallbackExecutor {
  private readonly config: InternalFallbackConfig;
  private readonly logger: BillingLogger | undefined;

  constructor(config: FallbackConfig, logger?: BillingLogger) {
    this.config = {
      enabled: config.enabled,
      maxAttempts: config.maxAttempts ?? 1,
      allowedOperations: config.allowedOperations ?? DEFAULT_ALLOWED_OPERATIONS,
      retryableErrors: config.retryableErrors ?? DEFAULT_RETRYABLE_ERRORS,
      providers: config.providers,
      onFallback: config.onFallback,
      onAllFailed: config.onAllFailed,
    };
    this.logger = logger;
  }

  /**
   * Check if fallback is enabled
   */
  get isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Execute operation with fallback support
   *
   * @param operation - Operation name for safety checks
   * @param primaryProvider - Primary provider to try first
   * @param fallbackProviders - Fallback providers in order of preference
   * @param execute - Function that executes the operation on a provider
   */
  async execute<T>(
    operation: FallbackOperation,
    primaryProvider: PaymentProvider,
    fallbackProviders: PaymentProvider[],
    execute: (provider: PaymentProvider) => Promise<T>
  ): Promise<{ result: T; provider: PaymentProvider; usedFallback: boolean }> {
    // Check if fallback is enabled for this operation
    const canFallback = this.canFallback(operation);

    let lastError: Error | undefined;
    let attempt = 0;

    // Build provider list: primary + fallbacks
    const providers = [primaryProvider];
    if (canFallback) {
      for (const fb of fallbackProviders) {
        if (fb !== primaryProvider && providers.length <= this.config.maxAttempts) {
          providers.push(fb);
        }
      }
    }

    // Try each provider
    for (const provider of providers) {
      attempt++;
      const isUsingFallback = provider !== primaryProvider;

      try {
        this.logger?.debug(`Attempting ${operation}`, {
          provider: provider.type,
          attempt,
          isUsingFallback,
        });

        const result = await execute(provider);

        if (isUsingFallback) {
          this.logger?.info(`Fallback succeeded`, {
            operation,
            provider: provider.type,
            originalProvider: primaryProvider.type,
          });
        }

        return {
          result,
          provider,
          usedFallback: isUsingFallback,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger?.warn(`Provider ${provider.type} failed`, {
          operation,
          error: lastError.message,
          attempt,
          maxAttempts: providers.length,
        });

        // Check if we should try fallback
        if (
          isUsingFallback ||
          !canFallback ||
          attempt >= providers.length ||
          !this.isRetryableError(lastError)
        ) {
          // If this is the last attempt or not retryable, we'll throw
          if (attempt >= providers.length) {
            // Notify all failed callback
            if (this.config.onAllFailed) {
              await this.notifyAllFailed(
                operation,
                primaryProvider.type,
                lastError,
                attempt
              );
            }
            break;
          }
          continue;
        }

        // Notify fallback callback before trying next provider
        if (this.config.onFallback && attempt < providers.length) {
          const nextProvider = providers[attempt];
          if (nextProvider) {
            await this.notifyFallback(
              operation,
              primaryProvider.type,
              nextProvider.type,
              lastError,
              attempt,
              providers.length
            );
          }
        }
      }
    }

    // All providers failed
    throw new BillingError(
      `All providers failed for ${operation}: ${lastError?.message}`,
      "ALL_PROVIDERS_FAILED",
      primaryProvider.type,
      lastError
    );
  }

  /**
   * Check if fallback is allowed for operation
   */
  canFallback(operation: FallbackOperation): boolean {
    if (!this.config.enabled) {
      return false;
    }

    return this.config.allowedOperations.includes(operation);
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: Error): boolean {
    const errorCode = (error as { code?: string }).code;
    const errorMessage = error.message;

    for (const retryable of this.config.retryableErrors) {
      if (errorCode === retryable) return true;
      if (errorMessage.includes(retryable)) return true;
    }

    return false;
  }

  /**
   * Notify fallback callback
   */
  private async notifyFallback(
    operation: FallbackOperation,
    originalProvider: PaymentProviderType,
    fallbackProvider: PaymentProviderType,
    error: Error,
    attempt: number,
    totalAttempts: number
  ): Promise<void> {
    if (!this.config.onFallback) return;

    const context: FallbackContext = {
      operation,
      originalProvider,
      fallbackProvider,
      error,
      attempt,
      totalAttempts,
      allFailed: false,
    };

    try {
      await this.config.onFallback(context);
    } catch (callbackError) {
      this.logger?.error("Fallback callback failed", {
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
      });
    }
  }

  /**
   * Notify all failed callback
   */
  private async notifyAllFailed(
    operation: FallbackOperation,
    originalProvider: PaymentProviderType,
    error: Error,
    totalAttempts: number
  ): Promise<void> {
    if (!this.config.onAllFailed) return;

    const context: FallbackContext = {
      operation,
      originalProvider,
      // fallbackProvider is omitted when all failed (undefined not allowed in type)
      error,
      attempt: totalAttempts,
      totalAttempts,
      allFailed: true,
    };

    try {
      await this.config.onAllFailed(context);
    } catch (callbackError) {
      this.logger?.error("All-failed callback failed", {
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
      });
    }
  }
}

/**
 * Create a disabled fallback executor (default behavior)
 */
export function createDisabledFallback(): FallbackExecutor {
  return new FallbackExecutor({ enabled: false });
}

/**
 * Create fallback executor
 */
export function createFallbackExecutor(
  config: FallbackConfig,
  logger?: BillingLogger
): FallbackExecutor {
  return new FallbackExecutor(config, logger);
}
