import { describe, it, expect } from "vitest";
import {
  ParsError,
  AuthError,
  UnauthorizedError,
  ForbiddenError,
  InvalidCredentialsError,
  SessionExpiredError,
  TwoFactorRequiredError,
  AccountLockedError,
  TenantError,
  TenantNotFoundError,
  TenantSuspendedError,
  MembershipError,
  MembershipNotFoundError,
  MembershipExpiredError,
  ValidationError,
  RateLimitError,
  NotFoundError,
  ConflictError,
  DuplicateError,
} from "./errors.js";

describe("@parsrun/core - Error Classes", () => {
  describe("ParsError", () => {
    it("should create with default status code", () => {
      const error = new ParsError("Test error", "TEST_ERROR");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe("ParsError");
    });

    it("should create with custom status code", () => {
      const error = new ParsError("Test error", "TEST_ERROR", 400);
      expect(error.statusCode).toBe(400);
    });

    it("should include details", () => {
      const error = new ParsError("Test error", "TEST_ERROR", 400, { field: "test" });
      expect(error.details).toEqual({ field: "test" });
    });

    it("should serialize to JSON", () => {
      const error = new ParsError("Test error", "TEST_ERROR", 400, { field: "test" });
      const json = error.toJSON();
      expect(json).toEqual({
        name: "ParsError",
        message: "Test error",
        code: "TEST_ERROR",
        statusCode: 400,
        details: { field: "test" },
      });
    });

    it("should be instance of Error", () => {
      const error = new ParsError("Test", "TEST");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("Auth Errors", () => {
    it("AuthError should have default values", () => {
      const error = new AuthError("Auth failed");
      expect(error.code).toBe("AUTH_ERROR");
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe("AuthError");
    });

    it("UnauthorizedError should have correct defaults", () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe("Unauthorized");
      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.statusCode).toBe(401);
    });

    it("ForbiddenError should have correct defaults", () => {
      const error = new ForbiddenError();
      expect(error.message).toBe("Forbidden");
      expect(error.code).toBe("FORBIDDEN");
      expect(error.statusCode).toBe(403);
    });

    it("InvalidCredentialsError should have correct defaults", () => {
      const error = new InvalidCredentialsError();
      expect(error.message).toBe("Invalid credentials");
      expect(error.code).toBe("INVALID_CREDENTIALS");
      expect(error.statusCode).toBe(401);
    });

    it("SessionExpiredError should have correct defaults", () => {
      const error = new SessionExpiredError();
      expect(error.message).toBe("Session expired");
      expect(error.code).toBe("SESSION_EXPIRED");
      expect(error.statusCode).toBe(401);
    });

    it("TwoFactorRequiredError should include challengeId", () => {
      const error = new TwoFactorRequiredError("2FA required", "challenge-123");
      expect(error.challengeId).toBe("challenge-123");
      expect(error.code).toBe("TWO_FACTOR_REQUIRED");
      expect(error.statusCode).toBe(403);
      expect(error.details?.["challengeId"]).toBe("challenge-123");
    });

    it("AccountLockedError should include lockedUntil", () => {
      const lockedUntil = new Date("2024-01-15T12:00:00Z");
      const error = new AccountLockedError("Account locked", lockedUntil);
      expect(error.lockedUntil).toEqual(lockedUntil);
      expect(error.code).toBe("ACCOUNT_LOCKED");
      expect(error.statusCode).toBe(423);
    });
  });

  describe("Tenant Errors", () => {
    it("TenantError should have correct defaults", () => {
      const error = new TenantError("Tenant error");
      expect(error.code).toBe("TENANT_ERROR");
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe("TenantError");
    });

    it("TenantNotFoundError should have correct defaults", () => {
      const error = new TenantNotFoundError();
      expect(error.message).toBe("Tenant not found");
      expect(error.code).toBe("TENANT_NOT_FOUND");
      expect(error.statusCode).toBe(404);
    });

    it("TenantSuspendedError should have correct defaults", () => {
      const error = new TenantSuspendedError();
      expect(error.message).toBe("Tenant suspended");
      expect(error.code).toBe("TENANT_SUSPENDED");
      expect(error.statusCode).toBe(403);
    });

    it("MembershipError should have correct defaults", () => {
      const error = new MembershipError();
      expect(error.code).toBe("MEMBERSHIP_ERROR");
      expect(error.statusCode).toBe(400);
    });

    it("MembershipNotFoundError should have correct defaults", () => {
      const error = new MembershipNotFoundError();
      expect(error.message).toBe("Membership not found");
      expect(error.code).toBe("MEMBERSHIP_NOT_FOUND");
      expect(error.statusCode).toBe(404);
    });

    it("MembershipExpiredError should have correct defaults", () => {
      const error = new MembershipExpiredError();
      expect(error.message).toBe("Membership expired");
      expect(error.code).toBe("MEMBERSHIP_EXPIRED");
      expect(error.statusCode).toBe(403);
    });
  });

  describe("ValidationError", () => {
    it("should include validation errors", () => {
      const error = new ValidationError("Validation failed", [
        { field: "email", message: "Invalid email" },
        { field: "password", message: "Too short" },
      ]);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.statusCode).toBe(400);
      expect(error.errors).toHaveLength(2);
      expect(error.errors[0]).toEqual({ field: "email", message: "Invalid email" });
    });
  });

  describe("RateLimitError", () => {
    it("should include retryAfter", () => {
      const error = new RateLimitError("Too many requests", 60);
      expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
      expect(error.details?.["retryAfter"]).toBe(60);
    });

    it("should work without retryAfter", () => {
      const error = new RateLimitError();
      expect(error.message).toBe("Rate limit exceeded");
      expect(error.retryAfter).toBeUndefined();
    });
  });

  describe("NotFoundError", () => {
    it("should create with resource name", () => {
      const error = new NotFoundError("User");
      expect(error.message).toBe("User not found");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.statusCode).toBe(404);
      expect(error.details?.["resource"]).toBe("User");
    });

    it("should accept custom message", () => {
      const error = new NotFoundError("User", "User with ID 123 not found");
      expect(error.message).toBe("User with ID 123 not found");
    });
  });

  describe("ConflictError", () => {
    it("should have correct defaults", () => {
      const error = new ConflictError();
      expect(error.message).toBe("Conflict");
      expect(error.code).toBe("CONFLICT");
      expect(error.statusCode).toBe(409);
    });
  });

  describe("DuplicateError", () => {
    it("should create with resource name", () => {
      const error = new DuplicateError("User");
      expect(error.message).toBe("User already exists");
      expect(error.statusCode).toBe(409);
    });

    it("should include field name", () => {
      const error = new DuplicateError("User", "email");
      expect(error.message).toBe("User already exists with this email");
      expect(error.details?.["resource"]).toBe("User");
      expect(error.details?.["field"]).toBe("email");
    });
  });

  describe("Error inheritance", () => {
    it("AuthError should be instance of ParsError", () => {
      const error = new AuthError("Test");
      expect(error).toBeInstanceOf(ParsError);
    });

    it("UnauthorizedError should be instance of AuthError", () => {
      const error = new UnauthorizedError();
      expect(error).toBeInstanceOf(AuthError);
      expect(error).toBeInstanceOf(ParsError);
    });

    it("TenantError should be instance of ParsError", () => {
      const error = new TenantError("Test");
      expect(error).toBeInstanceOf(ParsError);
    });

    it("ValidationError should be instance of ParsError", () => {
      const error = new ValidationError("Test", []);
      expect(error).toBeInstanceOf(ParsError);
    });
  });
});
