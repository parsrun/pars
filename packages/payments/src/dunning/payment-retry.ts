/**
 * @parsrun/payments - Payment Retry Strategy
 * Smart retry logic based on payment failure codes
 */

import type {
  PaymentFailure,
  PaymentFailureCategory,
  RetryStrategy,
  RetryResult,
  DunningContext,
  DunningLogger,
} from "./types.js";

// ============================================================================
// Error Code Mapping
// ============================================================================

/**
 * Map provider error codes to failure categories
 */
export interface ErrorCodeMapping {
  provider: string;
  codes: Record<string, PaymentFailureCategory>;
}

/**
 * Stripe error code mappings
 */
export const stripeErrorCodes: ErrorCodeMapping = {
  provider: "stripe",
  codes: {
    // Card declined
    card_declined: "card_declined",
    generic_decline: "card_declined",
    do_not_honor: "card_declined",
    transaction_not_allowed: "card_declined",

    // Insufficient funds
    insufficient_funds: "insufficient_funds",

    // Card expired/invalid
    expired_card: "card_expired",
    invalid_expiry_month: "card_expired",
    invalid_expiry_year: "card_expired",
    invalid_number: "invalid_card",
    invalid_cvc: "invalid_card",
    incorrect_number: "invalid_card",
    incorrect_cvc: "invalid_card",

    // Processing errors (retry immediately)
    processing_error: "processing_error",
    try_again_later: "processing_error",
    bank_not_supported: "processing_error",

    // Authentication required
    authentication_required: "authentication_required",
    card_not_supported: "authentication_required",

    // Fraud
    fraudulent: "fraud_suspected",
    merchant_blacklist: "fraud_suspected",
    stolen_card: "fraud_suspected",
    lost_card: "fraud_suspected",

    // Rate limits
    rate_limit: "velocity_exceeded",
  },
};

/**
 * Paddle error code mappings
 */
export const paddleErrorCodes: ErrorCodeMapping = {
  provider: "paddle",
  codes: {
    declined: "card_declined",
    insufficient_funds: "insufficient_funds",
    card_expired: "card_expired",
    invalid_card: "invalid_card",
    processing_error: "processing_error",
    authentication_required: "authentication_required",
    fraud: "fraud_suspected",
  },
};

/**
 * iyzico error code mappings
 */
export const iyzicoErrorCodes: ErrorCodeMapping = {
  provider: "iyzico",
  codes: {
    // Turkish bank error codes
    "10051": "insufficient_funds", // Yetersiz bakiye
    "10054": "card_expired", // Süresi dolmuş kart
    "10057": "card_declined", // İşlem onaylanmadı
    "10005": "invalid_card", // Geçersiz kart
    "10012": "invalid_card", // Geçersiz işlem
    "10041": "fraud_suspected", // Kayıp kart
    "10043": "fraud_suspected", // Çalıntı kart
    "10058": "card_declined", // Terminal işlem yapma yetkisi yok
    "10034": "fraud_suspected", // Dolandırıcılık şüphesi
  },
};

/**
 * All provider mappings
 */
export const allErrorCodeMappings: ErrorCodeMapping[] = [
  stripeErrorCodes,
  paddleErrorCodes,
  iyzicoErrorCodes,
];

// ============================================================================
// Default Retry Strategies
// ============================================================================

/**
 * Default retry strategies by failure category
 */
export const defaultRetryStrategies: RetryStrategy[] = [
  {
    category: "card_declined",
    shouldRetry: true,
    initialDelayHours: 24, // Wait a day
    maxRetries: 4,
    backoffMultiplier: 2,
    maxDelayHours: 168, // 1 week max
    optimalRetryHours: [10, 14, 18], // Business hours
    optimalRetryDays: [1, 2, 3, 4, 5], // Weekdays
  },
  {
    category: "insufficient_funds",
    shouldRetry: true,
    initialDelayHours: 72, // Wait until likely payday
    maxRetries: 4,
    backoffMultiplier: 1.5,
    maxDelayHours: 168,
    // Optimal times: end of month, mid-month (paydays)
    optimalRetryDays: [0, 1, 15, 16, 28, 29, 30, 31].map((d) => d % 7), // Around paydays
  },
  {
    category: "card_expired",
    shouldRetry: false, // Don't retry - needs card update
    initialDelayHours: 0,
    maxRetries: 0,
    backoffMultiplier: 1,
    maxDelayHours: 0,
  },
  {
    category: "invalid_card",
    shouldRetry: false, // Don't retry - needs card update
    initialDelayHours: 0,
    maxRetries: 0,
    backoffMultiplier: 1,
    maxDelayHours: 0,
  },
  {
    category: "processing_error",
    shouldRetry: true,
    initialDelayHours: 1, // Retry soon
    maxRetries: 5,
    backoffMultiplier: 2,
    maxDelayHours: 24,
  },
  {
    category: "authentication_required",
    shouldRetry: false, // Needs customer action (3DS)
    initialDelayHours: 0,
    maxRetries: 0,
    backoffMultiplier: 1,
    maxDelayHours: 0,
  },
  {
    category: "fraud_suspected",
    shouldRetry: false, // Never retry fraud
    initialDelayHours: 0,
    maxRetries: 0,
    backoffMultiplier: 1,
    maxDelayHours: 0,
  },
  {
    category: "velocity_exceeded",
    shouldRetry: true,
    initialDelayHours: 6, // Wait for rate limit reset
    maxRetries: 3,
    backoffMultiplier: 2,
    maxDelayHours: 48,
  },
  {
    category: "unknown",
    shouldRetry: true, // Cautious retry
    initialDelayHours: 24,
    maxRetries: 2,
    backoffMultiplier: 2,
    maxDelayHours: 72,
  },
];

// ============================================================================
// Retry Calculator
// ============================================================================

/**
 * Payment retry calculator
 * Determines optimal retry timing based on failure category
 */
export class PaymentRetryCalculator {
  private strategies: Map<PaymentFailureCategory, RetryStrategy>;
  private errorMappings: Map<string, Map<string, PaymentFailureCategory>>;
  private logger?: DunningLogger;

  constructor(
    strategies: RetryStrategy[] = defaultRetryStrategies,
    errorMappings: ErrorCodeMapping[] = allErrorCodeMappings,
    logger?: DunningLogger
  ) {
    this.strategies = new Map(strategies.map((s) => [s.category, s]));
    this.errorMappings = new Map();
    if (logger) {
      this.logger = logger;
    }

    // Build error code lookup
    for (const mapping of errorMappings) {
      this.errorMappings.set(mapping.provider, new Map(Object.entries(mapping.codes)));
    }
  }

  /**
   * Map error code to failure category
   */
  categorizeError(provider: string, errorCode: string): PaymentFailureCategory {
    const providerMapping = this.errorMappings.get(provider.toLowerCase());
    if (providerMapping) {
      const category = providerMapping.get(errorCode.toLowerCase());
      if (category) return category;
    }
    return "unknown";
  }

  /**
   * Get retry strategy for failure category
   */
  getStrategy(category: PaymentFailureCategory): RetryStrategy {
    return (
      this.strategies.get(category) ?? {
        category: "unknown",
        shouldRetry: true,
        initialDelayHours: 24,
        maxRetries: 2,
        backoffMultiplier: 2,
        maxDelayHours: 72,
      }
    );
  }

  /**
   * Check if a failure should be retried
   */
  shouldRetry(failure: PaymentFailure): boolean {
    const strategy = this.getStrategy(failure.category);

    // Check if strategy allows retry
    if (!strategy.shouldRetry) {
      this.logger?.debug("Retry not allowed for category", {
        category: failure.category,
        failureId: failure.id,
      });
      return false;
    }

    // Check retry count
    if (failure.retryCount >= strategy.maxRetries) {
      this.logger?.debug("Max retries reached", {
        category: failure.category,
        retryCount: failure.retryCount,
        maxRetries: strategy.maxRetries,
      });
      return false;
    }

    return true;
  }

  /**
   * Calculate next retry time
   */
  calculateNextRetry(failure: PaymentFailure): Date | null {
    if (!this.shouldRetry(failure)) {
      return null;
    }

    const strategy = this.getStrategy(failure.category);

    // Calculate delay with exponential backoff
    const baseDelay = strategy.initialDelayHours;
    const multiplier = Math.pow(strategy.backoffMultiplier, failure.retryCount);
    let delayHours = Math.min(baseDelay * multiplier, strategy.maxDelayHours);

    // Calculate base retry time
    let retryTime = new Date(failure.failedAt.getTime() + delayHours * 60 * 60 * 1000);

    // Optimize for best retry time
    retryTime = this.optimizeRetryTime(retryTime, strategy);

    this.logger?.debug("Calculated next retry time", {
      failureId: failure.id,
      category: failure.category,
      retryCount: failure.retryCount,
      delayHours,
      nextRetry: retryTime.toISOString(),
    });

    return retryTime;
  }

  /**
   * Optimize retry time based on strategy
   */
  private optimizeRetryTime(baseTime: Date, strategy: RetryStrategy): Date {
    const optimalHours = strategy.optimalRetryHours;
    const optimalDays = strategy.optimalRetryDays;

    if (!optimalHours?.length && !optimalDays?.length) {
      return baseTime;
    }

    let optimizedTime = new Date(baseTime);

    // Adjust to optimal hour if specified
    if (optimalHours?.length) {
      const currentHour = optimizedTime.getHours();
      const nearestOptimalHour = this.findNearestValue(currentHour, optimalHours);

      if (nearestOptimalHour !== currentHour) {
        optimizedTime.setHours(nearestOptimalHour, 0, 0, 0);

        // If we moved to an earlier hour, add a day
        if (nearestOptimalHour < currentHour) {
          optimizedTime.setDate(optimizedTime.getDate() + 1);
        }
      }
    }

    // Adjust to optimal day if specified
    if (optimalDays?.length) {
      const currentDay = optimizedTime.getDay();
      const nearestOptimalDay = this.findNearestValue(currentDay, optimalDays);

      if (nearestOptimalDay !== currentDay) {
        const daysToAdd = (nearestOptimalDay - currentDay + 7) % 7;
        optimizedTime.setDate(optimizedTime.getDate() + (daysToAdd || 7));
      }
    }

    // Don't move earlier than base time
    if (optimizedTime < baseTime) {
      return baseTime;
    }

    return optimizedTime;
  }

  /**
   * Find nearest value in array
   */
  private findNearestValue(current: number, values: number[]): number {
    const firstValue = values[0];
    if (firstValue === undefined) {
      return current;
    }

    let nearest = firstValue;
    let minDiff = Math.abs(current - nearest);

    for (const value of values) {
      const diff = Math.abs(current - value);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = value;
      }
    }

    return nearest;
  }

  /**
   * Check if failure is recoverable (can be retried eventually)
   */
  isRecoverable(category: PaymentFailureCategory): boolean {
    const strategy = this.getStrategy(category);
    return strategy.shouldRetry;
  }

  /**
   * Get recommendation message for failure category
   */
  getRecommendation(category: PaymentFailureCategory): string {
    switch (category) {
      case "card_declined":
        return "The payment was declined. We'll retry automatically.";
      case "insufficient_funds":
        return "There were insufficient funds. We'll retry around payday.";
      case "card_expired":
        return "Your card has expired. Please update your payment method.";
      case "invalid_card":
        return "The card information is invalid. Please update your payment method.";
      case "processing_error":
        return "A temporary processing error occurred. We'll retry shortly.";
      case "authentication_required":
        return "Additional authentication is required. Please complete the payment manually.";
      case "fraud_suspected":
        return "The payment was flagged. Please contact your bank or use a different card.";
      case "velocity_exceeded":
        return "Too many payment attempts. We'll retry later.";
      default:
        return "An error occurred. We'll retry the payment.";
    }
  }
}

// ============================================================================
// Payment Retrier
// ============================================================================

/**
 * Payment retry handler configuration
 */
export interface PaymentRetrierConfig {
  /** Retry calculator */
  calculator?: PaymentRetryCalculator;

  /** Function to actually retry the payment */
  retryPayment: (context: DunningContext) => Promise<RetryResult>;

  /** Logger */
  logger?: DunningLogger;

  /** Maximum retries per dunning session */
  maxSessionRetries?: number;
}

/**
 * Payment retrier
 * Handles intelligent payment retry logic
 */
export class PaymentRetrier {
  private calculator: PaymentRetryCalculator;
  private retryPayment: (context: DunningContext) => Promise<RetryResult>;
  private logger?: DunningLogger;
  private maxSessionRetries: number;

  constructor(config: PaymentRetrierConfig) {
    this.calculator =
      config.calculator ?? new PaymentRetryCalculator(undefined, undefined, config.logger);
    this.retryPayment = config.retryPayment;
    if (config.logger) {
      this.logger = config.logger;
    }
    this.maxSessionRetries = config.maxSessionRetries ?? 10;
  }

  /**
   * Attempt to retry a payment
   */
  async retry(context: DunningContext): Promise<RetryResult> {
    const failure = context.latestFailure;

    // Check if we should retry
    if (!this.calculator.shouldRetry(failure)) {
      this.logger?.info("Payment retry skipped - not recoverable", {
        failureId: failure.id,
        category: failure.category,
        reason: this.calculator.getRecommendation(failure.category),
      });

      return {
        success: false,
        failure,
        attemptedAt: new Date(),
      };
    }

    // Check session retry limit
    if (context.state.totalRetryAttempts >= this.maxSessionRetries) {
      this.logger?.warn("Payment retry skipped - session limit reached", {
        customerId: context.customer.id,
        totalAttempts: context.state.totalRetryAttempts,
        maxAttempts: this.maxSessionRetries,
      });

      return {
        success: false,
        failure,
        attemptedAt: new Date(),
      };
    }

    // Attempt retry
    this.logger?.info("Attempting payment retry", {
      failureId: failure.id,
      customerId: context.customer.id,
      amount: failure.amount,
      retryCount: failure.retryCount,
    });

    try {
      const result = await this.retryPayment(context);

      if (result.success) {
        this.logger?.info("Payment retry successful", {
          failureId: failure.id,
          transactionId: result.transactionId,
        });
      } else {
        this.logger?.info("Payment retry failed", {
          failureId: failure.id,
          newFailure: result.failure,
        });
      }

      return result;
    } catch (error) {
      this.logger?.error("Payment retry error", {
        failureId: failure.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        failure,
        attemptedAt: new Date(),
      };
    }
  }

  /**
   * Get next retry time for a failure
   */
  getNextRetryTime(failure: PaymentFailure): Date | null {
    return this.calculator.calculateNextRetry(failure);
  }

  /**
   * Check if failure is recoverable
   */
  isRecoverable(failure: PaymentFailure): boolean {
    return this.calculator.isRecoverable(failure.category);
  }

  /**
   * Categorize an error code
   */
  categorizeError(provider: string, errorCode: string): PaymentFailureCategory {
    return this.calculator.categorizeError(provider, errorCode);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a payment retry calculator
 */
export function createPaymentRetryCalculator(
  strategies?: RetryStrategy[],
  errorMappings?: ErrorCodeMapping[],
  logger?: DunningLogger
): PaymentRetryCalculator {
  return new PaymentRetryCalculator(strategies, errorMappings, logger);
}

/**
 * Create a payment retrier
 */
export function createPaymentRetrier(config: PaymentRetrierConfig): PaymentRetrier {
  return new PaymentRetrier(config);
}
