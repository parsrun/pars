import { describe, it, expect } from "vitest";
import { type } from "arktype";
import {
  user,
  authMethod,
  session,
  requestOTPRequest,
  verifyOTPRequest,
  jwtPayload,
  permission,
  role,
  sessionConfig,
  passwordConfig,
} from "./auth.js";

describe("@parsrun/types - Auth Schemas", () => {
  describe("user", () => {
    it("should accept valid user", () => {
      const result = user({
        id: "550e8400-e29b-41d4-a716-446655440000",
        twoFactorEnabled: false,
        status: "active",
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept user with optional fields", () => {
      const result = user({
        id: "550e8400-e29b-41d4-a716-446655440000",
        displayName: "John Doe",
        twoFactorEnabled: true,
        twoFactorSecret: "secret123",
        status: "active",
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
        deletedAt: "2024-01-20T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid status", () => {
      const result = user({
        id: "550e8400-e29b-41d4-a716-446655440000",
        twoFactorEnabled: false,
        status: "unknown",
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("authMethod", () => {
    it("should accept valid email auth method", () => {
      const result = authMethod({
        id: "550e8400-e29b-41d4-a716-446655440001",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        provider: "email",
        providerId: "test@example.com",
        verified: true,
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept OAuth provider", () => {
      const result = authMethod({
        id: "550e8400-e29b-41d4-a716-446655440001",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        provider: "google",
        providerId: "google-oauth-id-123",
        verified: true,
        metadata: { name: "John Doe" },
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid provider", () => {
      const result = authMethod({
        id: "550e8400-e29b-41d4-a716-446655440001",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        provider: "facebook",
        providerId: "fb-id-123",
        verified: true,
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("session", () => {
    it("should accept valid session", () => {
      const result = session({
        id: "550e8400-e29b-41d4-a716-446655440002",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        csrfTokenHash: "hashed-csrf-token",
        expiresAt: "2024-01-16T10:30:00.000Z",
        status: "active",
        lastActivityAt: "2024-01-15T10:30:00.000Z",
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept session with device info", () => {
      const result = session({
        id: "550e8400-e29b-41d4-a716-446655440002",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        csrfTokenHash: "hashed-csrf-token",
        expiresAt: "2024-01-16T10:30:00.000Z",
        deviceType: "mobile",
        deviceName: "iPhone 15",
        userAgent: "Mozilla/5.0...",
        ipAddress: "192.168.1.1",
        status: "active",
        lastActivityAt: "2024-01-15T10:30:00.000Z",
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept revoked session", () => {
      const result = session({
        id: "550e8400-e29b-41d4-a716-446655440002",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        csrfTokenHash: "hashed-csrf-token",
        expiresAt: "2024-01-16T10:30:00.000Z",
        status: "revoked",
        revokedAt: "2024-01-15T12:00:00.000Z",
        revokedReason: "user_logout",
        lastActivityAt: "2024-01-15T10:30:00.000Z",
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T12:00:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });
  });

  describe("requestOTPRequest", () => {
    it("should accept email OTP request", () => {
      const result = requestOTPRequest({
        email: "test@example.com",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept phone OTP request", () => {
      const result = requestOTPRequest({
        phone: "+905551234567",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept with tenantId", () => {
      const result = requestOTPRequest({
        email: "test@example.com",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid email", () => {
      const result = requestOTPRequest({
        email: "not-an-email",
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("verifyOTPRequest", () => {
    it("should accept valid verification request", () => {
      const result = verifyOTPRequest({
        email: "test@example.com",
        code: "123456",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject short code", () => {
      const result = verifyOTPRequest({
        email: "test@example.com",
        code: "123",
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("jwtPayload", () => {
    it("should accept valid JWT payload", () => {
      const result = jwtPayload({
        sub: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "550e8400-e29b-41d4-a716-446655440001",
        iat: 1705315800,
        exp: 1705316700,
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept with optional fields", () => {
      const result = jwtPayload({
        sub: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "550e8400-e29b-41d4-a716-446655440001",
        sessionId: "550e8400-e29b-41d4-a716-446655440002",
        roles: ["admin", "user"],
        permissions: ["users:read", "users:create"],
        iat: 1705315800,
        exp: 1705316700,
        aud: "pars-app",
        iss: "pars-auth",
      });
      expect(result instanceof type.errors).toBe(false);
    });
  });

  describe("permission", () => {
    it("should accept valid permission", () => {
      const result = permission({
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "users:read",
        resource: "users",
        action: "read",
        scope: "tenant",
        isSystem: true,
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid action", () => {
      const result = permission({
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "users:view",
        resource: "users",
        action: "view",
        scope: "tenant",
        isSystem: false,
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("role", () => {
    it("should accept valid role", () => {
      const result = role({
        id: "550e8400-e29b-41d4-a716-446655440000",
        tenantId: "550e8400-e29b-41d4-a716-446655440001",
        name: "admin",
        description: "Administrator role",
        isSystem: true,
        isActive: true,
        color: "#FF5733",
        insertedAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
      expect(result instanceof type.errors).toBe(false);
    });
  });

  describe("sessionConfig", () => {
    it("should accept valid session config", () => {
      const result = sessionConfig({
        accessTokenExpiry: 900,
        refreshTokenExpiry: 604800,
        slidingWindow: true,
        maxSessions: 5,
        invalidateOnPasswordChange: true,
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept empty config (all optional)", () => {
      const result = sessionConfig({});
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject accessTokenExpiry <= 0", () => {
      const result = sessionConfig({
        accessTokenExpiry: 0,
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("passwordConfig", () => {
    it("should accept valid password config", () => {
      const result = passwordConfig({
        enabled: true,
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSymbols: false,
        checkCommonPasswords: true,
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject minLength < 6", () => {
      const result = passwordConfig({
        minLength: 4,
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });
});
