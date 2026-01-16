import { describe, it, expect } from "vitest";
import {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
} from "./error-handler.js";

describe("@parsrun/server - Error Classes", () => {
  describe("ApiError", () => {
    it("should create error with all properties", () => {
      const error = new ApiError(400, "TEST_ERROR", "Test message", {
        field: "value",
      });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("TEST_ERROR");
      expect(error.message).toBe("Test message");
      expect(error.details).toEqual({ field: "value" });
      expect(error.name).toBe("ApiError");
    });

    it("should generate response object", () => {
      const error = new ApiError(400, "TEST_ERROR", "Test message");
      const response = error.toResponse();

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("TEST_ERROR");
      expect(response.error?.message).toBe("Test message");
    });

    it("should work without details", () => {
      const error = new ApiError(500, "ERROR", "Error message");

      expect(error.details).toBeUndefined();
    });
  });

  describe("BadRequestError", () => {
    it("should have status 400", () => {
      const error = new BadRequestError();

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("BAD_REQUEST");
      expect(error.name).toBe("BadRequestError");
    });

    it("should use default message", () => {
      const error = new BadRequestError();
      expect(error.message).toBe("Bad request");
    });

    it("should accept custom message", () => {
      const error = new BadRequestError("Invalid input");
      expect(error.message).toBe("Invalid input");
    });

    it("should accept details", () => {
      const error = new BadRequestError("Invalid input", { field: "email" });
      expect(error.details).toEqual({ field: "email" });
    });
  });

  describe("UnauthorizedError", () => {
    it("should have status 401", () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.name).toBe("UnauthorizedError");
      expect(error.message).toBe("Unauthorized");
    });

    it("should accept custom message", () => {
      const error = new UnauthorizedError("Invalid token");
      expect(error.message).toBe("Invalid token");
    });
  });

  describe("ForbiddenError", () => {
    it("should have status 403", () => {
      const error = new ForbiddenError();

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("FORBIDDEN");
      expect(error.name).toBe("ForbiddenError");
      expect(error.message).toBe("Forbidden");
    });

    it("should accept custom message", () => {
      const error = new ForbiddenError("Access denied");
      expect(error.message).toBe("Access denied");
    });
  });

  describe("NotFoundError", () => {
    it("should have status 404", () => {
      const error = new NotFoundError();

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("NOT_FOUND");
      expect(error.name).toBe("NotFoundError");
      expect(error.message).toBe("Not found");
    });

    it("should accept custom message", () => {
      const error = new NotFoundError("User not found");
      expect(error.message).toBe("User not found");
    });
  });

  describe("ConflictError", () => {
    it("should have status 409", () => {
      const error = new ConflictError();

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe("CONFLICT");
      expect(error.name).toBe("ConflictError");
      expect(error.message).toBe("Conflict");
    });

    it("should accept custom message", () => {
      const error = new ConflictError("Email already exists");
      expect(error.message).toBe("Email already exists");
    });
  });

  describe("ValidationError", () => {
    it("should have status 422", () => {
      const error = new ValidationError();

      expect(error.statusCode).toBe(422);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.name).toBe("ValidationError");
      expect(error.message).toBe("Validation failed");
    });

    it("should accept validation details", () => {
      const error = new ValidationError("Validation failed", {
        errors: [
          { field: "email", message: "Invalid email" },
          { field: "password", message: "Too short" },
        ],
      });

      expect(error.details).toEqual({
        errors: [
          { field: "email", message: "Invalid email" },
          { field: "password", message: "Too short" },
        ],
      });
    });
  });

  describe("RateLimitError", () => {
    it("should have status 429", () => {
      const error = new RateLimitError();

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(error.name).toBe("RateLimitError");
      expect(error.message).toBe("Too many requests");
    });

    it("should include retryAfter", () => {
      const error = new RateLimitError("Too many requests", 60);

      expect(error.retryAfter).toBe(60);
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe("InternalError", () => {
    it("should have status 500", () => {
      const error = new InternalError();

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.name).toBe("InternalError");
      expect(error.message).toBe("Internal server error");
    });
  });

  describe("ServiceUnavailableError", () => {
    it("should have status 503", () => {
      const error = new ServiceUnavailableError();

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe("SERVICE_UNAVAILABLE");
      expect(error.name).toBe("ServiceUnavailableError");
      expect(error.message).toBe("Service unavailable");
    });

    it("should accept custom message", () => {
      const error = new ServiceUnavailableError("Database is down");
      expect(error.message).toBe("Database is down");
    });
  });

  describe("inheritance", () => {
    it("all errors should be instances of Error", () => {
      expect(new BadRequestError()).toBeInstanceOf(Error);
      expect(new UnauthorizedError()).toBeInstanceOf(Error);
      expect(new ForbiddenError()).toBeInstanceOf(Error);
      expect(new NotFoundError()).toBeInstanceOf(Error);
      expect(new ConflictError()).toBeInstanceOf(Error);
      expect(new ValidationError()).toBeInstanceOf(Error);
      expect(new RateLimitError()).toBeInstanceOf(Error);
      expect(new InternalError()).toBeInstanceOf(Error);
      expect(new ServiceUnavailableError()).toBeInstanceOf(Error);
    });

    it("all errors should be instances of ApiError", () => {
      expect(new BadRequestError()).toBeInstanceOf(ApiError);
      expect(new UnauthorizedError()).toBeInstanceOf(ApiError);
      expect(new ForbiddenError()).toBeInstanceOf(ApiError);
      expect(new NotFoundError()).toBeInstanceOf(ApiError);
      expect(new ConflictError()).toBeInstanceOf(ApiError);
      expect(new ValidationError()).toBeInstanceOf(ApiError);
      expect(new RateLimitError()).toBeInstanceOf(ApiError);
      expect(new InternalError()).toBeInstanceOf(ApiError);
      expect(new ServiceUnavailableError()).toBeInstanceOf(ApiError);
    });
  });
});
