/**
 * @parsrun/service - Resilience Module
 * Circuit breaker, bulkhead, retry, and timeout patterns
 */

export {
  CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitState,
} from "./circuit-breaker.js";

export { Bulkhead, type BulkheadOptions } from "./bulkhead.js";

export {
  withRetry,
  executeWithRetry,
  createRetryWrapper,
  type RetryOptions,
} from "./retry.js";

export {
  withTimeout,
  executeWithTimeout,
  createTimeoutWrapper,
  raceWithTimeout,
  executeWithDeadline,
  TimeoutExceededError,
} from "./timeout.js";
