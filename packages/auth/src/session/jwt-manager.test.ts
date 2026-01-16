import { describe, it, expect, beforeEach } from "vitest";
import {
  JwtManager,
  JwtError,
  parseDuration,
  extractBearerToken,
  createJwtManager,
} from "./jwt-manager.js";

describe("@parsrun/auth - JwtManager", () => {
  let jwtManager: JwtManager;

  const testConfig = {
    secret: "test-secret-key-that-is-long-enough-for-hs256",
    issuer: "test-issuer",
    audience: "test-audience",
    accessTokenTTL: "15m",
    refreshTokenTTL: "7d",
  };

  beforeEach(() => {
    jwtManager = new JwtManager(testConfig);
  });

  describe("parseDuration", () => {
    it("should parse seconds", () => {
      expect(parseDuration("30s")).toBe(30);
      expect(parseDuration("1s")).toBe(1);
    });

    it("should parse minutes", () => {
      expect(parseDuration("15m")).toBe(15 * 60);
      expect(parseDuration("1m")).toBe(60);
    });

    it("should parse hours", () => {
      expect(parseDuration("1h")).toBe(60 * 60);
      expect(parseDuration("24h")).toBe(24 * 60 * 60);
    });

    it("should parse days", () => {
      expect(parseDuration("1d")).toBe(24 * 60 * 60);
      expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60);
    });

    it("should parse weeks", () => {
      expect(parseDuration("1w")).toBe(7 * 24 * 60 * 60);
      expect(parseDuration("2w")).toBe(14 * 24 * 60 * 60);
    });

    it("should throw for invalid format", () => {
      expect(() => parseDuration("invalid")).toThrow("Invalid duration format");
      expect(() => parseDuration("15")).toThrow("Invalid duration format");
      expect(() => parseDuration("m15")).toThrow("Invalid duration format");
    });
  });

  describe("generateAccessToken", () => {
    it("should generate a valid access token", async () => {
      const result = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      expect(result.token).toBeDefined();
      expect(result.token.split(".")).toHaveLength(3); // JWT format
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should include optional claims", async () => {
      const result = await jwtManager.generateAccessToken({
        userId: "user-123",
        tenantId: "tenant-456",
        sessionId: "session-789",
        roles: ["admin", "user"],
        permissions: ["read", "write"],
      });

      const payload = await jwtManager.verifyAccessToken(result.token);

      expect(payload.sub).toBe("user-123");
      expect(payload.tid).toBe("tenant-456");
      expect(payload.sid).toBe("session-789");
      expect(payload.roles).toEqual(["admin", "user"]);
      expect(payload.permissions).toEqual(["read", "write"]);
    });

    it("should include custom claims", async () => {
      const result = await jwtManager.generateAccessToken({
        userId: "user-123",
        claims: { customField: "customValue" },
      });

      const decoded = jwtManager.decodeToken(result.token);
      expect(decoded?.["customField"]).toBe("customValue");
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate a valid refresh token", async () => {
      const result = await jwtManager.generateRefreshToken({
        userId: "user-123",
      });

      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should have longer expiry than access token", async () => {
      const accessResult = await jwtManager.generateAccessToken({
        userId: "user-123",
      });
      const refreshResult = await jwtManager.generateRefreshToken({
        userId: "user-123",
      });

      expect(refreshResult.expiresAt.getTime()).toBeGreaterThan(
        accessResult.expiresAt.getTime()
      );
    });
  });

  describe("generateTokenPair", () => {
    it("should generate both access and refresh tokens", async () => {
      const pair = await jwtManager.generateTokenPair({
        userId: "user-123",
        tenantId: "tenant-456",
      });

      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(pair.accessExpiresAt).toBeInstanceOf(Date);
      expect(pair.refreshExpiresAt).toBeInstanceOf(Date);
      expect(pair.accessToken).not.toBe(pair.refreshToken);
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify a valid token", async () => {
      const { token } = await jwtManager.generateAccessToken({
        userId: "user-123",
        tenantId: "tenant-456",
      });

      const payload = await jwtManager.verifyAccessToken(token);

      expect(payload.sub).toBe("user-123");
      expect(payload.tid).toBe("tenant-456");
      expect(payload.iss).toBe(testConfig.issuer);
      expect(payload.aud).toBe(testConfig.audience);
    });

    it("should reject invalid token", async () => {
      await expect(
        jwtManager.verifyAccessToken("invalid.token.here")
      ).rejects.toThrow(JwtError);
    });

    it("should reject token with wrong signature", async () => {
      const otherManager = new JwtManager({
        ...testConfig,
        secret: "different-secret-key-for-testing-purposes",
      });

      const { token } = await otherManager.generateAccessToken({
        userId: "user-123",
      });

      await expect(jwtManager.verifyAccessToken(token)).rejects.toThrow(
        JwtError
      );
    });
  });

  describe("verifyRefreshToken", () => {
    it("should verify a valid refresh token", async () => {
      const { token } = await jwtManager.generateRefreshToken({
        userId: "user-123",
        tenantId: "tenant-456",
        sessionId: "session-789",
      });

      const result = await jwtManager.verifyRefreshToken(token);

      expect(result.userId).toBe("user-123");
      expect(result.tenantId).toBe("tenant-456");
      expect(result.sessionId).toBe("session-789");
    });

    it("should reject access token as refresh token", async () => {
      const { token } = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      await expect(jwtManager.verifyRefreshToken(token)).rejects.toThrow(
        "Invalid token type"
      );
    });
  });

  describe("key rotation", () => {
    it("should rotate key and increment version", () => {
      const initialVersion = jwtManager.getKeyVersion();

      const result = jwtManager.rotateKey("new-secret-key-for-rotation-test");

      expect(jwtManager.getKeyVersion()).toBe(initialVersion + 1);
      expect(result.keyVersion).toBe(initialVersion + 1);
      expect(result.newSecret).toBe("new-secret-key-for-rotation-test");
      expect(result.rotatedAt).toBeInstanceOf(Date);
    });

    it("should verify tokens signed with previous key after rotation", async () => {
      // Generate token with original key
      const { token } = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      // Rotate key
      jwtManager.rotateKey("new-secret-key-for-rotation-test");

      // Should still verify with previous key
      const payload = await jwtManager.verifyAccessToken(token);
      expect(payload.sub).toBe("user-123");
    });

    it("should sign new tokens with new key after rotation", async () => {
      // Rotate key
      jwtManager.rotateKey("new-secret-key-for-rotation-test");

      // Generate token with new key
      const { token } = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      // Verify with new key
      const payload = await jwtManager.verifyAccessToken(token);
      expect(payload.sub).toBe("user-123");
    });

    it("should limit previous secrets", () => {
      jwtManager.rotateKey("secret-1", { maxPreviousSecrets: 2 });
      jwtManager.rotateKey("secret-2", { maxPreviousSecrets: 2 });
      jwtManager.rotateKey("secret-3", { maxPreviousSecrets: 2 });

      const config = jwtManager.getConfig();
      expect(config.previousSecrets?.length ?? 0).toBeLessThanOrEqual(2);
    });
  });

  describe("decodeToken", () => {
    it("should decode token without verification", async () => {
      const { token } = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      const payload = jwtManager.decodeToken(token);

      expect(payload?.sub).toBe("user-123");
    });

    it("should return null for invalid token", () => {
      const payload = jwtManager.decodeToken("not-a-jwt");
      expect(payload).toBeNull();
    });
  });

  describe("isTokenExpired", () => {
    it("should return false for valid token", async () => {
      const { token } = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      expect(jwtManager.isTokenExpired(token)).toBe(false);
    });

    it("should return true for invalid token", () => {
      expect(jwtManager.isTokenExpired("invalid")).toBe(true);
    });
  });

  describe("getTokenExpiration", () => {
    it("should return expiration date", async () => {
      const { token, expiresAt } = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      const expiration = jwtManager.getTokenExpiration(token);

      // Should be within 1 second of expected
      expect(expiration).toBeInstanceOf(Date);
      expect(Math.abs(expiration!.getTime() - expiresAt.getTime())).toBeLessThan(
        1000
      );
    });

    it("should return null for invalid token", () => {
      expect(jwtManager.getTokenExpiration("invalid")).toBeNull();
    });
  });

  describe("getTokenTTL", () => {
    it("should return remaining TTL in seconds", async () => {
      const { token } = await jwtManager.generateAccessToken({
        userId: "user-123",
      });

      const ttl = jwtManager.getTokenTTL(token);

      // Should be close to 15 minutes (900 seconds)
      expect(ttl).toBeGreaterThan(890);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it("should return 0 for invalid token", () => {
      expect(jwtManager.getTokenTTL("invalid")).toBe(0);
    });
  });

  describe("extractBearerToken", () => {
    it("should extract token from Bearer header", () => {
      const token = extractBearerToken("Bearer my-token-123");
      expect(token).toBe("my-token-123");
    });

    it("should return null for missing header", () => {
      expect(extractBearerToken(null)).toBeNull();
      expect(extractBearerToken(undefined)).toBeNull();
    });

    it("should return null for invalid format", () => {
      expect(extractBearerToken("Basic my-token")).toBeNull();
      expect(extractBearerToken("Bearer")).toBeNull();
      expect(extractBearerToken("my-token")).toBeNull();
    });
  });

  describe("createJwtManager factory", () => {
    it("should create JwtManager instance", async () => {
      const manager = createJwtManager(testConfig);

      const { token } = await manager.generateAccessToken({ userId: "test" });
      expect(token).toBeDefined();
    });
  });

  describe("JwtError", () => {
    it("should have correct properties", () => {
      const error = new JwtError("Test error", "TOKEN_EXPIRED");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TOKEN_EXPIRED");
      expect(error.name).toBe("JwtError");
    });
  });

  describe("getConfig", () => {
    it("should return current configuration", () => {
      const config = jwtManager.getConfig();

      expect(config.secret).toBe(testConfig.secret);
      expect(config.issuer).toBe(testConfig.issuer);
      expect(config.audience).toBe(testConfig.audience);
    });
  });
});
