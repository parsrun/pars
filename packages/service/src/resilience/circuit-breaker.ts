/**
 * @parsrun/service - Circuit Breaker
 * Prevents cascading failures by failing fast when a service is unhealthy
 */

import { CircuitOpenError } from "../rpc/errors.js";

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Options for configuring a circuit breaker.
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before half-open state (ms) */
  resetTimeout: number;
  /** Number of successes in half-open to close circuit */
  successThreshold: number;
  /** Optional callback on state change */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Circuit breaker state.
 * - "closed": Normal operation, requests pass through
 * - "open": Failing fast, requests are rejected immediately
 * - "half-open": Testing if service recovered, limited requests allowed
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit Breaker implementation
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing fast, requests are rejected immediately
 * - HALF-OPEN: Testing if service recovered, limited requests allowed
 */
export class CircuitBreaker {
  private _state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  /**
   * Get current state
   */
  get state(): CircuitState {
    // Check if we should transition from open to half-open
    if (this._state === "open") {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.options.resetTimeout) {
        this.transitionTo("half-open");
      }
    }
    return this._state;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check state (this may transition from open to half-open)
    const currentState = this.state;

    if (currentState === "open") {
      const resetAfter = this.options.resetTimeout - (Date.now() - this.lastFailureTime);
      throw new CircuitOpenError("service", Math.max(0, resetAfter));
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  private onSuccess(): void {
    if (this._state === "half-open") {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.transitionTo("closed");
      }
    } else if (this._state === "closed") {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed call
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();

    if (this._state === "half-open") {
      // Any failure in half-open goes back to open
      this.transitionTo("open");
    } else if (this._state === "closed") {
      this.failures++;
      if (this.failures >= this.options.failureThreshold) {
        this.transitionTo("open");
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this._state;
    this._state = newState;

    // Reset counters on state change
    if (newState === "closed") {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === "half-open") {
      this.successes = 0;
    }

    this.options.onStateChange?.(oldState, newState);
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo("closed");
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
