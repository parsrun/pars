import { describe, expect, it } from "vitest";
import {
  SMSService,
  createSMSService,
  createSMSProvider,
  ConsoleProvider,
  SMSError,
  SMSErrorCodes,
} from "./index.js";

describe("SMSService", () => {
  it("creates service with console provider", () => {
    const sms = createSMSService({
      provider: "console",
      from: "TEST",
    });

    expect(sms).toBeInstanceOf(SMSService);
    expect(sms.providerType).toBe("console");
  });

  it("sends SMS via console provider", async () => {
    const sms = createSMSService({
      provider: "console",
      from: "TEST",
    });

    const result = await sms.send({
      to: "905551234567",
      message: "Test message",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });

  it("sends batch SMS", async () => {
    const sms = createSMSService({
      provider: "console",
      from: "TEST",
    });

    const result = await sms.sendBatch({
      messages: [
        { to: "905551234567", message: "Message 1" },
        { to: "905559876543", message: "Message 2" },
      ],
    });

    expect(result.total).toBe(2);
    expect(result.successful).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("sends OTP", async () => {
    const sms = createSMSService({
      provider: "console",
      from: "TEST",
    });

    const result = await sms.sendOTP("905551234567", "123456", 5);

    expect(result.success).toBe(true);
  });

  it("throws on unknown provider", () => {
    expect(() =>
      createSMSService({
        provider: "unknown" as any,
        from: "TEST",
      })
    ).toThrow(SMSError);
  });
});

describe("createSMSProvider", () => {
  it("creates console provider", () => {
    const provider = createSMSProvider("console", { from: "TEST" });
    expect(provider).toBeInstanceOf(ConsoleProvider);
  });

  it("throws on unknown provider type", () => {
    expect(() => createSMSProvider("unknown" as any, {})).toThrow(SMSError);
  });
});

describe("SMSError", () => {
  it("has correct properties", () => {
    const error = new SMSError("Test error", SMSErrorCodes.SEND_FAILED);

    expect(error.message).toBe("Test error");
    expect(error.code).toBe(SMSErrorCodes.SEND_FAILED);
    expect(error.name).toBe("SMSError");
  });
});
