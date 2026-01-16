/**
 * @parsrun/service - Resilience tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker } from "../src/resilience/circuit-breaker.js";
import { Bulkhead } from "../src/resilience/bulkhead.js";
import { withRetry } from "../src/resilience/retry.js";
import { withTimeout, TimeoutExceededError } from "../src/resilience/timeout.js";

describe("CircuitBreaker", () => {
  it("should start in closed state", () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      successThreshold: 2,
    });

    expect(cb.state).toBe("closed");
  });

  it("should open after failure threshold", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 1000,
      successThreshold: 1,
    });

    const failingFn = async () => {
      throw new Error("fail");
    };

    // First failure
    await expect(cb.execute(failingFn)).rejects.toThrow("fail");
    expect(cb.state).toBe("closed");

    // Second failure - should open
    await expect(cb.execute(failingFn)).rejects.toThrow("fail");
    expect(cb.state).toBe("open");
  });

  it("should reject immediately when open", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeout: 1000,
      successThreshold: 1,
    });

    // Fail to open circuit
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();

    // Should reject immediately
    await expect(cb.execute(async () => "success")).rejects.toThrow("Circuit breaker open");
  });

  it("should reset failure count on success", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      successThreshold: 1,
    });

    // One failure
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();

    // Success resets count
    await cb.execute(async () => "success");

    // Can fail again without opening
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    expect(cb.state).toBe("closed");
  });
});

describe("Bulkhead", () => {
  it("should allow concurrent requests up to limit", async () => {
    const bulkhead = new Bulkhead({
      maxConcurrent: 2,
      maxQueue: 0,
    });

    let running = 0;
    let maxRunning = 0;

    const slowFn = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 50));
      running--;
      return "done";
    };

    // Start 2 concurrent
    const p1 = bulkhead.execute(slowFn);
    const p2 = bulkhead.execute(slowFn);

    // Third should reject (no queue)
    await expect(bulkhead.execute(slowFn)).rejects.toThrow("too many concurrent requests");

    await Promise.all([p1, p2]);

    expect(maxRunning).toBe(2);
  });

  it("should queue requests when maxQueue > 0", async () => {
    const bulkhead = new Bulkhead({
      maxConcurrent: 1,
      maxQueue: 2,
    });

    const results: number[] = [];
    const fn = (n: number) => async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(n);
      return n;
    };

    const p1 = bulkhead.execute(fn(1));
    const p2 = bulkhead.execute(fn(2));
    const p3 = bulkhead.execute(fn(3));

    await Promise.all([p1, p2, p3]);

    expect(results).toEqual([1, 2, 3]);
  });
});

describe("withRetry", () => {
  it("should retry on failure", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("fail");
      }
      return "success";
    };

    const retryFn = withRetry(fn, {
      attempts: 3,
      backoff: "linear",
      initialDelay: 10,
      maxDelay: 100,
      shouldRetry: () => true, // Always retry for this test
    });

    const result = await retryFn();

    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("should throw after max attempts", async () => {
    const fn = async () => {
      throw new Error("always fails");
    };

    const retryFn = withRetry(fn, {
      attempts: 2,
      backoff: "linear",
      initialDelay: 10,
      maxDelay: 100,
      shouldRetry: () => true, // Always retry for this test
    });

    await expect(retryFn()).rejects.toThrow("always fails");
  });

  it("should respect shouldRetry predicate", async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      throw new Error("non-retryable");
    };

    const retryFn = withRetry(fn, {
      attempts: 3,
      backoff: "linear",
      initialDelay: 10,
      maxDelay: 100,
      shouldRetry: () => false,
    });

    await expect(retryFn()).rejects.toThrow("non-retryable");
    expect(attempts).toBe(1);
  });
});

describe("withTimeout", () => {
  it("should complete within timeout", async () => {
    const fn = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "done";
    };

    const timeoutFn = withTimeout(fn, 100);
    const result = await timeoutFn();

    expect(result).toBe("done");
  });

  it("should throw on timeout", async () => {
    const fn = async () => {
      await new Promise((r) => setTimeout(r, 100));
      return "done";
    };

    const timeoutFn = withTimeout(fn, 10);

    await expect(timeoutFn()).rejects.toThrow(TimeoutExceededError);
  });
});
