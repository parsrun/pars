import { describe, it, expect } from "vitest";
import { type } from "arktype";
import {
  uuid,
  timestamp,
  email,
  url,
  nonEmptyString,
  positiveInt,
  nonNegativeInt,
  status,
  sessionStatus,
  pagination,
  paginationMeta,
  cursorPagination,
  cursorPaginationMeta,
  errorResponse,
  parsError,
} from "./common.js";

describe("@parsrun/types - Common Schemas", () => {
  describe("uuid", () => {
    it("should accept valid UUID v4", () => {
      const result = uuid("550e8400-e29b-41d4-a716-446655440000");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid UUID", () => {
      const result = uuid("not-a-uuid");
      expect(result instanceof type.errors).toBe(true);
    });

    it("should reject empty string", () => {
      const result = uuid("");
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("timestamp", () => {
    it("should accept valid ISO 8601 timestamp", () => {
      const result = timestamp("2024-01-15T10:30:00.000Z");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept date-only ISO format", () => {
      const result = timestamp("2024-01-15");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid timestamp", () => {
      const result = timestamp("not-a-timestamp");
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("email", () => {
    it("should accept valid email", () => {
      const result = email("test@example.com");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept email with subdomain", () => {
      const result = email("user@mail.example.com");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid email", () => {
      const result = email("not-an-email");
      expect(result instanceof type.errors).toBe(true);
    });

    it("should reject email without domain", () => {
      const result = email("test@");
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("url", () => {
    it("should accept valid HTTP URL", () => {
      const result = url("https://example.com");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept URL with path", () => {
      const result = url("https://example.com/path/to/resource");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid URL", () => {
      const result = url("not-a-url");
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("nonEmptyString", () => {
    it("should accept non-empty string", () => {
      const result = nonEmptyString("hello");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept single character", () => {
      const result = nonEmptyString("a");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject empty string", () => {
      const result = nonEmptyString("");
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("positiveInt", () => {
    it("should accept positive integer", () => {
      const result = positiveInt(5);
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept 1", () => {
      const result = positiveInt(1);
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject 0", () => {
      const result = positiveInt(0);
      expect(result instanceof type.errors).toBe(true);
    });

    it("should reject negative integer", () => {
      const result = positiveInt(-5);
      expect(result instanceof type.errors).toBe(true);
    });

    it("should reject float", () => {
      const result = positiveInt(1.5);
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("nonNegativeInt", () => {
    it("should accept 0", () => {
      const result = nonNegativeInt(0);
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept positive integer", () => {
      const result = nonNegativeInt(10);
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject negative integer", () => {
      const result = nonNegativeInt(-1);
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("status", () => {
    it("should accept 'active'", () => {
      const result = status("active");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept 'inactive'", () => {
      const result = status("inactive");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept 'suspended'", () => {
      const result = status("suspended");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept 'deleted'", () => {
      const result = status("deleted");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid status", () => {
      const result = status("unknown");
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("sessionStatus", () => {
    it("should accept 'active'", () => {
      const result = sessionStatus("active");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept 'expired'", () => {
      const result = sessionStatus("expired");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept 'revoked'", () => {
      const result = sessionStatus("revoked");
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject invalid session status", () => {
      const result = sessionStatus("pending");
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("pagination", () => {
    it("should accept valid pagination params", () => {
      const result = pagination({ page: 1, limit: 10 });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept with optional orderBy", () => {
      const result = pagination({
        page: 1,
        limit: 10,
        orderBy: "createdAt",
        orderDirection: "desc",
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject page < 1", () => {
      const result = pagination({ page: 0, limit: 10 });
      expect(result instanceof type.errors).toBe(true);
    });

    it("should reject limit < 1", () => {
      const result = pagination({ page: 1, limit: 0 });
      expect(result instanceof type.errors).toBe(true);
    });
  });

  describe("paginationMeta", () => {
    it("should accept valid pagination meta", () => {
      const result = paginationMeta({
        page: 1,
        limit: 10,
        total: 100,
        totalPages: 10,
        hasNext: true,
        hasPrev: false,
      });
      expect(result instanceof type.errors).toBe(false);
    });
  });

  describe("cursorPagination", () => {
    it("should accept without cursor (first page)", () => {
      const result = cursorPagination({ limit: 10 });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept with cursor", () => {
      const result = cursorPagination({
        cursor: "abc123",
        limit: 10,
        direction: "forward",
      });
      expect(result instanceof type.errors).toBe(false);
    });
  });

  describe("cursorPaginationMeta", () => {
    it("should accept valid cursor pagination meta", () => {
      const result = cursorPaginationMeta({
        nextCursor: "next123",
        hasMore: true,
        limit: 10,
      });
      expect(result instanceof type.errors).toBe(false);
    });
  });

  describe("errorResponse", () => {
    it("should accept valid error response", () => {
      const result = errorResponse({
        success: "false",
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
        },
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept with optional details", () => {
      const result = errorResponse({
        success: "false",
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: { field: "email" },
        },
        message: "Please fix the errors",
      });
      expect(result instanceof type.errors).toBe(false);
    });
  });

  describe("parsError", () => {
    it("should accept valid pars error", () => {
      const result = parsError({
        message: "Something went wrong",
        statusCode: 500,
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should accept with optional code and details", () => {
      const result = parsError({
        message: "Validation error",
        statusCode: 400,
        code: "VALIDATION_ERROR",
        details: { fields: ["email", "name"] },
      });
      expect(result instanceof type.errors).toBe(false);
    });

    it("should reject statusCode < 100", () => {
      const result = parsError({
        message: "Error",
        statusCode: 50,
      });
      expect(result instanceof type.errors).toBe(true);
    });
  });
});
