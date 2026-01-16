/**
 * @parsrun/service - Retry
 * Retry failed operations with backoff
 */

// ============================================================================
// RETRY
// ============================================================================

/**
 * Options for configuring retry behavior.
 */
export interface RetryOptions {
  /** Number of retry attempts (not including initial attempt) */
  attempts: number;
  /** Backoff strategy */
  backoff: "linear" | "exponential";
  /** Initial delay in ms */
  initialDelay: number;
  /** Maximum delay in ms */
  maxDelay: number;
  /** Jitter factor (0-1) to add randomness */
  jitter?: number;
  /** Should retry predicate */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback on retry */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * Default retry predicate - retry on retryable errors
 */
const defaultShouldRetry = (error: unknown): boolean => {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable: boolean }).retryable;
  }
  return false;
};

/**
 * Calculate delay for retry attempt
 */
function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  let delay: number;

  if (options.backoff === "exponential") {
    // Exponential backoff: initialDelay * 2^attempt
    delay = options.initialDelay * Math.pow(2, attempt);
  } else {
    // Linear backoff: initialDelay * (attempt + 1)
    delay = options.initialDelay * (attempt + 1);
  }

  // Apply max delay
  delay = Math.min(delay, options.maxDelay);

  // Apply jitter
  if (options.jitter && options.jitter > 0) {
    const jitterRange = delay * options.jitter;
    delay = delay - jitterRange / 2 + Math.random() * jitterRange;
  }

  return Math.round(delay);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a function with retry logic.
 * Returns a new function that will retry on failure.
 *
 * @param fn - The function to wrap
 * @param options - Retry configuration
 * @returns A wrapped function with retry behavior
 *
 * @example
 * ```typescript
 * const fetchWithRetry = withRetry(
 *   () => fetch('/api/data'),
 *   { attempts: 3, backoff: 'exponential', initialDelay: 100, maxDelay: 5000 }
 * );
 * const response = await fetchWithRetry();
 * ```
 */
export function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): () => Promise<T> {
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  return async (): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= options.attempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (attempt >= options.attempts || !shouldRetry(error, attempt)) {
          throw error;
        }

        // Calculate delay
        const delay = calculateDelay(attempt, options);

        // Callback
        options.onRetry?.(error, attempt + 1, delay);

        // Wait before retry
        await sleep(delay);
      }
    }

    throw lastError;
  };
}

/**
 * Execute a function with retry logic immediately.
 *
 * @param fn - The function to execute
 * @param options - Retry configuration
 * @returns Promise resolving to the function result
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  return withRetry(fn, options)();
}

/**
 * Create a reusable retry wrapper with preset default options.
 *
 * @param defaultOptions - Default retry configuration
 * @returns A function that executes with retry using the defaults
 *
 * @example
 * ```typescript
 * const retry = createRetryWrapper({ attempts: 3, backoff: 'exponential' });
 * const result = await retry(() => fetchData());
 * ```
 */
export function createRetryWrapper(
  defaultOptions: Partial<RetryOptions>
): <T>(fn: () => Promise<T>, options?: Partial<RetryOptions>) => Promise<T> {
  const defaults: RetryOptions = {
    attempts: defaultOptions.attempts ?? 3,
    backoff: defaultOptions.backoff ?? "exponential",
    initialDelay: defaultOptions.initialDelay ?? 100,
    maxDelay: defaultOptions.maxDelay ?? 10_000,
    jitter: defaultOptions.jitter ?? 0.1,
  };

  if (defaultOptions.shouldRetry) {
    defaults.shouldRetry = defaultOptions.shouldRetry;
  }
  if (defaultOptions.onRetry) {
    defaults.onRetry = defaultOptions.onRetry;
  }

  return async <T>(
    fn: () => Promise<T>,
    options?: Partial<RetryOptions>
  ): Promise<T> => {
    return executeWithRetry(fn, { ...defaults, ...options });
  };
}
