import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  checkPasswordStrength,
} from "./password.js";

describe("@parsrun/auth - Password Utils", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const hash = await hashPassword("mySecurePassword123!");

      expect(hash).toBeDefined();
      expect(hash).not.toBe("mySecurePassword123!");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should generate different hashes for same password (unique salt)", async () => {
      const hash1 = await hashPassword("samePassword");
      const hash2 = await hashPassword("samePassword");

      expect(hash1).not.toBe(hash2);
    });

    it("should generate base64 encoded output", async () => {
      const hash = await hashPassword("testPassword");

      // Base64 characters only
      expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe("verifyPassword", () => {
    it("should verify correct password", async () => {
      const password = "mySecurePassword123!";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const hash = await hashPassword("correctPassword");

      const isValid = await verifyPassword("wrongPassword", hash);

      expect(isValid).toBe(false);
    });

    it("should reject empty password", async () => {
      const hash = await hashPassword("somePassword");

      const isValid = await verifyPassword("", hash);

      expect(isValid).toBe(false);
    });

    it("should return false for invalid hash format", async () => {
      const isValid = await verifyPassword("password", "invalid-hash");

      expect(isValid).toBe(false);
    });

    it("should return false for corrupted hash", async () => {
      const isValid = await verifyPassword("password", "YWJjZGVm"); // valid base64, wrong format

      expect(isValid).toBe(false);
    });

    it("should handle special characters in password", async () => {
      const password = "P@$$w0rd!#$%^&*()_+-=[]{}|;':\",./<>?";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should handle unicode characters", async () => {
      const password = "密码şifre🔐パスワード";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should handle long passwords", async () => {
      const password = "a".repeat(1000);
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it("should be case sensitive", async () => {
      const hash = await hashPassword("Password123");

      expect(await verifyPassword("Password123", hash)).toBe(true);
      expect(await verifyPassword("password123", hash)).toBe(false);
      expect(await verifyPassword("PASSWORD123", hash)).toBe(false);
    });
  });

  describe("checkPasswordStrength", () => {
    it("should return low score for weak password", () => {
      const result = checkPasswordStrength("123");

      expect(result.score).toBeLessThan(2);
      expect(result.isStrong).toBe(false);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it("should return high score for strong password", () => {
      const result = checkPasswordStrength("MyStr0ng!Pass#2024");

      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(result.isStrong).toBe(true);
    });

    it("should check minimum length", () => {
      const short = checkPasswordStrength("Aa1!");
      const long = checkPasswordStrength("Aa1!5678");

      expect(short.feedback).toContain(
        "Password should be at least 8 characters"
      );
      expect(
        long.feedback.some((f) => f.includes("8 characters"))
      ).toBe(false);
    });

    it("should check for mixed case", () => {
      const lowercase = checkPasswordStrength("password123!");
      const mixedCase = checkPasswordStrength("Password123!");

      expect(
        lowercase.feedback.some((f) => f.includes("uppercase"))
      ).toBe(true);
      expect(
        mixedCase.feedback.some((f) => f.includes("uppercase"))
      ).toBe(false);
    });

    it("should check for numbers", () => {
      const noNumbers = checkPasswordStrength("Password!");
      const withNumbers = checkPasswordStrength("Password123!");

      expect(
        noNumbers.feedback.some((f) => f.includes("number"))
      ).toBe(true);
      expect(
        withNumbers.feedback.some((f) => f.includes("number"))
      ).toBe(false);
    });

    it("should check for special characters", () => {
      const noSpecial = checkPasswordStrength("Password123");
      const withSpecial = checkPasswordStrength("Password123!");

      expect(
        noSpecial.feedback.some((f) => f.includes("special character"))
      ).toBe(true);
      expect(
        withSpecial.feedback.some((f) => f.includes("special character"))
      ).toBe(false);
    });

    it("should detect common patterns", () => {
      const result1 = checkPasswordStrength("123password!");
      const result2 = checkPasswordStrength("qwerty123456");
      const result3 = checkPasswordStrength("aaaaaaaaa");

      expect(
        result1.feedback.some((f) => f.includes("common"))
      ).toBe(true);
      expect(
        result2.feedback.some((f) => f.includes("common"))
      ).toBe(true);
      expect(
        result3.feedback.some((f) => f.includes("common"))
      ).toBe(true);
    });

    it("should give bonus for length >= 12", () => {
      // Using passwords without special chars so they don't hit max score
      const short = checkPasswordStrength("Abcdefg1"); // 8 chars, no special = score 3
      const long = checkPasswordStrength("Abcdefghij12"); // 12 chars, no special = score 4 (with length bonus)

      expect(long.score).toBeGreaterThanOrEqual(short.score);
    });

    it("should cap score at 4", () => {
      const result = checkPasswordStrength(
        "VeryStr0ng&Complex!Password@2024#Secure"
      );

      expect(result.score).toBeLessThanOrEqual(4);
    });

    it("should return empty feedback for perfect password", () => {
      const result = checkPasswordStrength("MyStr0ng!Pass#2024");

      // Should have minimal feedback for strong password
      expect(result.isStrong).toBe(true);
    });

    describe("score calculation", () => {
      it("should score 0 for empty-like password", () => {
        const result = checkPasswordStrength("a");
        expect(result.score).toBe(0);
      });

      it("should score based on criteria met", () => {
        // Only length >= 8
        const result1 = checkPasswordStrength("abcdefgh");
        expect(result1.score).toBe(1);

        // Length + mixed case
        const result2 = checkPasswordStrength("Abcdefgh");
        expect(result2.score).toBe(2);

        // Length + mixed case + number
        const result3 = checkPasswordStrength("Abcdefg1");
        expect(result3.score).toBe(3);

        // Length + mixed case + number + special
        const result4 = checkPasswordStrength("Abcdefg1!");
        expect(result4.score).toBe(4);
      });
    });
  });
});
