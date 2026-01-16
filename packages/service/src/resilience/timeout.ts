/**
 * @parsrun/service - Timeout
 * Timeout wrapper for async operations
 */

// ============================================================================
// TIMEOUT
// ============================================================================

/**
 * Timeout error
 */
export class TimeoutExceededError extends Error {
  readonly timeout: number;

  constructor(timeout: number) {
    super(`Operation timed out after ${timeout}ms`);
    this.name = "TimeoutExceededError";
    this.timeout = timeout;
  }
}

/**
 * Wrap a function with timeout
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
 * Execute a function with timeout
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void | never
): Promise<T> {
  return withTimeout(fn, timeoutMs, onTimeout)();
}

/**
 * Create a timeout wrapper with preset duration
 */
export function createTimeoutWrapper(
  defaultTimeoutMs: number
): <T>(fn: () => Promise<T>, timeoutMs?: number) => Promise<T> {
  return async <T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> => {
    return executeWithTimeout(fn, timeoutMs ?? defaultTimeoutMs);
  };
}

/**
 * Race multiple promises with a timeout
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
 * Execute with deadline (absolute time)
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
