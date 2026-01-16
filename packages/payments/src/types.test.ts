import { describe, it, expect } from "vitest";
import { PaymentError, PaymentErrorCodes } from "./types.js";

describe("@parsrun/payments - Types", () => {
  describe("PaymentError", () => {
    it("should create error with message and code", () => {
      const error = new PaymentError("Test error", "TEST_CODE");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("PaymentError");
    });

    it("should create error with cause", () => {
      const cause = new Error("Original error");
      const error = new PaymentError("Wrapped error", "WRAPPED", cause);

      expect(error.message).toBe("Wrapped error");
      expect(error.code).toBe("WRAPPED");
      expect(error.cause).toBe(cause);
    });

    it("should be instance of Error", () => {
      const error = new PaymentError("Test", "CODE");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("PaymentErrorCodes", () => {
    it("should have all expected error codes", () => {
      expect(PaymentErrorCodes.INVALID_CONFIG).toBe("INVALID_CONFIG");
      expect(PaymentErrorCodes.CUSTOMER_NOT_FOUND).toBe("CUSTOMER_NOT_FOUND");
      expect(PaymentErrorCodes.SUBSCRIPTION_NOT_FOUND).toBe("SUBSCRIPTION_NOT_FOUND");
      expect(PaymentErrorCodes.CHECKOUT_FAILED).toBe("CHECKOUT_FAILED");
      expect(PaymentErrorCodes.PAYMENT_FAILED).toBe("PAYMENT_FAILED");
      expect(PaymentErrorCodes.WEBHOOK_VERIFICATION_FAILED).toBe("WEBHOOK_VERIFICATION_FAILED");
      expect(PaymentErrorCodes.API_ERROR).toBe("API_ERROR");
      expect(PaymentErrorCodes.RATE_LIMITED).toBe("RATE_LIMITED");
    });
  });
});
