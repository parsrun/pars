/**
 * @parsrun/service - Timeout
 * Timeout wrapper for async operations
 */

// ============================================================================
// TIMEOUT
// ============================================================================

/**
 * Error thrown when an operation exceeds its timeout.
 */
export class TimeoutExceededError extends Error {
  /** The timeout value in milliseconds that was exceeded */
  readonly timeout: number;

  constructor(timeout: number) {
    super(`Operation timed out after ${timeout}ms`);
    this.name = "TimeoutExceededError";
    this.timeout = timeout;
  }
}

/**
 * Wrap a function with a timeout.
 * Returns a new function that will reject if the timeout is exceeded.
 *
 * @param fn - The function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param onTimeout - Optional callback or throw function when timeout occurs
 * @returns A wrapped function with timeout behavior
 */
export function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void | never
): () => Promise<T> {
  return async (): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (onTimeout) {
          try {
            onTimeout();
          } catch (error) {
            reject(error);
            return;
          }
        }
        reject(new TimeoutExceededError(timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  };
}

/**
 * Execute a function with timeout immediately.
 *
 * @param fn - The function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param onTimeout - Optional callback or throw function when timeout occurs
 * @returns Promise resolving to the function result or rejecting on timeout
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void | never
): Promise<T> {
  return withTimeout(fn, timeoutMs, onTimeout)();
}

/**
 * Create a reusable timeout wrapper with preset duration.
 *
 * @param defaultTimeoutMs - Default timeout in milliseconds
 * @returns A function that executes with timeout
 */
export function createTimeoutWrapper(
  defaultTimeoutMs: number
): <T>(fn: () => Promise<T>, timeoutMs?: number) => Promise<T> {
  return async <T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> => {
    return executeWithTimeout(fn, timeoutMs ?? defaultTimeoutMs);
  };
}

/**
 * Race multiple promises with a timeout.
 * Returns the first promise to resolve, or rejects on timeout.
 *
 * @param promises - Array of promises to race
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to the first result
 */
export async function raceWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutExceededError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([...promises, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Execute a function with an absolute deadline.
 * Converts the deadline to a relative timeout.
 *
 * @param fn - The function to execute
 * @param deadline - Absolute deadline as a Date
 * @returns Promise resolving to the function result
 */
export async function executeWithDeadline<T>(
  fn: () => Promise<T>,
  deadline: Date
): Promise<T> {
  const now = Date.now();
  const deadlineMs = deadline.getTime();
  const timeoutMs = Math.max(0, deadlineMs - now);

  if (timeoutMs === 0) {
    throw new TimeoutExceededError(0);
  }

  return executeWithTimeout(fn, timeoutMs);
}
