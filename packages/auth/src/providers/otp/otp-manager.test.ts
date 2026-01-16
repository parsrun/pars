import { describe, it, expect, beforeEach } from "vitest";
import { OTPManager, createOTPManager } from "./otp-manager.js";
import { MemoryStorage } from "../../storage/memory.js";

describe("@parsrun/auth - OTPManager", () => {
  let storage: MemoryStorage;
  let otpManager: OTPManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    otpManager = new OTPManager(storage, {
      length: 6,
      expiresIn: 60, // 1 minute for faster tests
      maxAttempts: 3,
      rateLimit: 5,
      rateLimitWindow: 60,
    });
  });

  describe("generateCode", () => {
    it("should generate 6-digit code by default", () => {
      const code = otpManager.generateCode();
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it("should generate code with custom length", () => {
      const code = otpManager.generateCode(8);
      expect(code).toHaveLength(8);
      expect(/^\d{8}$/.test(code)).toBe(true);
    });

    it("should generate unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(otpManager.generateCode());
      }
      // Should have high uniqueness (allowing some collisions for 6-digit codes)
      expect(codes.size).toBeGreaterThan(90);
    });
  });

  describe("store", () => {
    it("should store OTP successfully", async () => {
      const result = await otpManager.store("test@example.com", "email");

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toHaveLength(6);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("should store OTP for phone", async () => {
      const result = await otpManager.store("+905551234567", "sms");

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
    });

    it("should normalize email to lowercase", async () => {
      await otpManager.store("Test@Example.COM", "email");

      const exists = await otpManager.hasValidOTP("test@example.com", "email");
      expect(exists).toBe(true);
    });

    it("should include tenant ID when provided", async () => {
      const result = await otpManager.store("test@example.com", "email", {
        tenantId: "tenant-123",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("verify", () => {
    it("should verify correct OTP", async () => {
      const storeResult = await otpManager.store("test@example.com", "email");
      const code = storeResult.code!;

      const verifyResult = await otpManager.verify("test@example.com", "email", code);

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.message).toContain("successfully");
    });

    it("should reject incorrect OTP", async () => {
      await otpManager.store("test@example.com", "email");

      const verifyResult = await otpManager.verify("test@example.com", "email", "000000");

      expect(verifyResult.success).toBe(false);
      expect(verifyResult.message).toContain("Invalid");
      expect(verifyResult.attemptsLeft).toBe(2);
    });

    it("should return error for non-existent OTP", async () => {
      const verifyResult = await otpManager.verify("test@example.com", "email", "123456");

      expect(verifyResult.success).toBe(false);
      expect(verifyResult.message).toContain("No OTP found");
    });

    it("should delete OTP after successful verification", async () => {
      const storeResult = await otpManager.store("test@example.com", "email");
      const code = storeResult.code!;

      await otpManager.verify("test@example.com", "email", code);

      const exists = await otpManager.hasValidOTP("test@example.com", "email");
      expect(exists).toBe(false);
    });

    it("should track failed attempts", async () => {
      await otpManager.store("test@example.com", "email");

      // First wrong attempt
      const result1 = await otpManager.verify("test@example.com", "email", "000000");
      expect(result1.attemptsLeft).toBe(2);

      // Second wrong attempt
      const result2 = await otpManager.verify("test@example.com", "email", "000000");
      expect(result2.attemptsLeft).toBe(1);

      // Third wrong attempt - should lock out
      const result3 = await otpManager.verify("test@example.com", "email", "000000");
      expect(result3.success).toBe(false);
      expect(result3.message).toContain("Too many failed attempts");
    });

    it("should delete OTP after max attempts exceeded", async () => {
      await otpManager.store("test@example.com", "email");

      for (let i = 0; i < 3; i++) {
        await otpManager.verify("test@example.com", "email", "000000");
      }

      const exists = await otpManager.hasValidOTP("test@example.com", "email");
      expect(exists).toBe(false);
    });

    it("should allow test user bypass", async () => {
      const result = await otpManager.verify("test@example.com", "email", "anycode", {
        testUser: true,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("test user");
    });
  });

  describe("expiry", () => {
    it("should reject expired OTP", async () => {
      // Create manager with very short expiry
      const shortExpiryManager = new OTPManager(storage, {
        expiresIn: 1, // 1 second
        rateLimit: 100,
      });

      const storeResult = await shortExpiryManager.store("test@example.com", "email");
      const code = storeResult.code!;

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const verifyResult = await shortExpiryManager.verify("test@example.com", "email", code);

      expect(verifyResult.success).toBe(false);
      // After expiry, the OTP may be cleaned up - either "expired" or "No OTP found" is valid
      expect(
        verifyResult.message?.includes("expired") || verifyResult.message?.includes("No OTP found")
      ).toBe(true);
    });
  });

  describe("rate limiting", () => {
    it("should allow requests within rate limit", async () => {
      const check = await otpManager.checkRateLimit("test@example.com", "email");

      expect(check.allowed).toBe(true);
      expect(check.remainingRequests).toBeGreaterThan(0);
    });

    it("should track rate limit usage", async () => {
      // Make several requests
      for (let i = 0; i < 3; i++) {
        await otpManager.store(`test${i}@example.com`, "email");
      }

      // First email should have used some rate limit
      const info = await otpManager.getRateLimitInfo("test0@example.com", "email");
      expect(info.requestsUsed).toBe(1);
    });

    it("should block when rate limit exceeded", async () => {
      const limitedManager = new OTPManager(storage, {
        rateLimit: 2,
        rateLimitWindow: 60,
      });

      // Exhaust rate limit
      await limitedManager.store("test@example.com", "email");
      await limitedManager.store("test@example.com", "email");

      // Next request should be blocked
      const result = await limitedManager.store("test@example.com", "email");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many");
    });
  });

  describe("hasValidOTP", () => {
    it("should return true for valid OTP", async () => {
      await otpManager.store("test@example.com", "email");

      const hasOTP = await otpManager.hasValidOTP("test@example.com", "email");
      expect(hasOTP).toBe(true);
    });

    it("should return false for no OTP", async () => {
      const hasOTP = await otpManager.hasValidOTP("test@example.com", "email");
      expect(hasOTP).toBe(false);
    });
  });

  describe("getInfo", () => {
    it("should return OTP info", async () => {
      await otpManager.store("test@example.com", "email");

      const info = await otpManager.getInfo("test@example.com", "email");

      expect(info.exists).toBe(true);
      expect(info.expiresAt).toBeInstanceOf(Date);
      expect(info.attempts).toBe(0);
      expect(info.attemptsLeft).toBe(3);
    });

    it("should return not exists for no OTP", async () => {
      const info = await otpManager.getInfo("test@example.com", "email");

      expect(info.exists).toBe(false);
    });
  });

  describe("delete", () => {
    it("should delete OTP", async () => {
      await otpManager.store("test@example.com", "email");
      await otpManager.delete("test@example.com", "email");

      const exists = await otpManager.hasValidOTP("test@example.com", "email");
      expect(exists).toBe(false);
    });
  });

  describe("factory function", () => {
    it("should create OTPManager with createOTPManager", () => {
      const manager = createOTPManager(storage, { length: 8 });
      const code = manager.generateCode();
      expect(code).toHaveLength(8);
    });
  });
});
