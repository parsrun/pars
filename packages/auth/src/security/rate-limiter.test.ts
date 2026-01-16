import { describe, it, expect, beforeEach } from "vitest";
import {
  RateLimiter,
  createRateLimiter,
  RateLimitPresets,
} from "./rate-limiter.js";
import { MemoryStorage } from "../storage/memory.js";

describe("@parsrun/auth - RateLimiter", () => {
  let storage: MemoryStorage;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    storage = new MemoryStorage();
    rateLimiter = new RateLimiter(storage, {
      windowSeconds: 60,
      maxRequests: 5,
    });
  });

  describe("check", () => {
    it("should allow requests within limit", async () => {
      const result = await rateLimiter.check("user-123");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetAt).toBeInstanceOf(Date);
    });

    it("should decrement remaining on each request", async () => {
      const result1 = await rateLimiter.check("user-123");
      const result2 = await rateLimiter.check("user-123");
      const result3 = await rateLimiter.check("user-123");

      expect(result1.remaining).toBe(4);
      expect(result2.remaining).toBe(3);
      expect(result3.remaining).toBe(2);
    });

    it("should block requests after limit exceeded", async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check("user-123");
      }

      // Next request should be blocked
      const result = await rateLimiter.check("user-123");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("should track different identifiers separately", async () => {
      // Exhaust limit for user-1
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check("user-1");
      }

      // user-2 should still be allowed
      const result = await rateLimiter.check("user-2");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("should reset after window expires", async () => {
      // Create limiter with very short window
      const shortLimiter = new RateLimiter(storage, {
        windowSeconds: 1,
        maxRequests: 2,
      });

      // Exhaust limit
      await shortLimiter.check("user-123");
      await shortLimiter.check("user-123");

      const blockedResult = await shortLimiter.check("user-123");
      expect(blockedResult.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be allowed again
      const result = await shortLimiter.check("user-123");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });
  });

  describe("status", () => {
    it("should return null for unknown identifier", async () => {
      const status = await rateLimiter.status("unknown");
      expect(status).toBeNull();
    });

    it("should return current status without consuming", async () => {
      // Make some requests
      await rateLimiter.check("user-123");
      await rateLimiter.check("user-123");

      // Get status (should not consume)
      const status1 = await rateLimiter.status("user-123");
      const status2 = await rateLimiter.status("user-123");

      expect(status1?.remaining).toBe(3);
      expect(status2?.remaining).toBe(3); // Should be same
    });

    it("should return null for expired window", async () => {
      const shortLimiter = new RateLimiter(storage, {
        windowSeconds: 1,
        maxRequests: 5,
      });

      await shortLimiter.check("user-123");

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const status = await shortLimiter.status("user-123");
      expect(status).toBeNull();
    });
  });

  describe("peek", () => {
    it("should return full limit for new identifier", async () => {
      const result = await rateLimiter.peek("new-user");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it("should return current status for existing identifier", async () => {
      await rateLimiter.check("user-123");
      await rateLimiter.check("user-123");

      const result = await rateLimiter.peek("user-123");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });
  });

  describe("reset", () => {
    it("should reset rate limit for identifier", async () => {
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.check("user-123");
      }

      expect((await rateLimiter.check("user-123")).allowed).toBe(false);

      // Reset
      await rateLimiter.reset("user-123");

      // Should be allowed again
      const result = await rateLimiter.check("user-123");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });

  describe("key prefix", () => {
    it("should use custom key prefix", async () => {
      const prefixedLimiter = new RateLimiter(storage, {
        windowSeconds: 60,
        maxRequests: 5,
        keyPrefix: "login:",
      });

      await prefixedLimiter.check("user-123");

      // Check that prefix is used (via status)
      const status = await prefixedLimiter.status("user-123");
      expect(status).not.toBeNull();
    });

    it("should isolate different prefixes", async () => {
      const loginLimiter = new RateLimiter(storage, {
        windowSeconds: 60,
        maxRequests: 2,
        keyPrefix: "login:",
      });

      const apiLimiter = new RateLimiter(storage, {
        windowSeconds: 60,
        maxRequests: 100,
        keyPrefix: "api:",
      });

      // Exhaust login limit
      await loginLimiter.check("user-123");
      await loginLimiter.check("user-123");
      expect((await loginLimiter.check("user-123")).allowed).toBe(false);

      // API should still work
      const apiResult = await apiLimiter.check("user-123");
      expect(apiResult.allowed).toBe(true);
    });
  });

  describe("createRateLimiter factory", () => {
    it("should create RateLimiter instance", async () => {
      const limiter = createRateLimiter(storage, {
        windowSeconds: 60,
        maxRequests: 10,
      });

      const result = await limiter.check("user-123");
      expect(result.allowed).toBe(true);
    });
  });

  describe("RateLimitPresets", () => {
    it("should have login preset", () => {
      expect(RateLimitPresets.login.maxRequests).toBe(5);
      expect(RateLimitPresets.login.windowSeconds).toBe(15 * 60);
      expect(RateLimitPresets.login.keyPrefix).toBe("login:");
    });

    it("should have otp preset", () => {
      expect(RateLimitPresets.otp.maxRequests).toBe(5);
      expect(RateLimitPresets.otp.windowSeconds).toBe(15 * 60);
    });

    it("should have api preset", () => {
      expect(RateLimitPresets.api.maxRequests).toBe(100);
      expect(RateLimitPresets.api.windowSeconds).toBe(60);
    });

    it("should have all presets defined", () => {
      expect(RateLimitPresets.login).toBeDefined();
      expect(RateLimitPresets.otp).toBeDefined();
      expect(RateLimitPresets.magicLink).toBeDefined();
      expect(RateLimitPresets.passwordReset).toBeDefined();
      expect(RateLimitPresets.api).toBeDefined();
      expect(RateLimitPresets.registration).toBeDefined();
      expect(RateLimitPresets.twoFactor).toBeDefined();
    });

    it("should work with RateLimiter", async () => {
      const limiter = new RateLimiter(storage, RateLimitPresets.api);

      const result = await limiter.check("user-123");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });
  });

  describe("retryAfterMs", () => {
    it("should calculate correct retry time", async () => {
      const limiter = new RateLimiter(storage, {
        windowSeconds: 60,
        maxRequests: 1,
      });

      await limiter.check("user-123");
      const result = await limiter.check("user-123");

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
    });
  });
});
