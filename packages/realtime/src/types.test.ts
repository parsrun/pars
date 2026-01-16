/**
 * Types and Utilities Tests
 */

import { describe, expect, it } from "vitest";
import {
  createMessage,
  formatSSEEvent,
  parseSSEEvent,
  RealtimeError,
  RealtimeErrorCodes,
} from "./types.js";

describe("createMessage", () => {
  it("should create a message with all required fields", () => {
    const message = createMessage({
      event: "test",
      channel: "channel1",
      data: { key: "value" },
    });

    expect(message.event).toBe("test");
    expect(message.channel).toBe("channel1");
    expect(message.data).toEqual({ key: "value" });
    expect(message.id).toBeDefined();
    expect(message.timestamp).toBeDefined();
  });

  it("should generate unique IDs", () => {
    const message1 = createMessage({ event: "test", channel: "ch", data: {} });
    const message2 = createMessage({ event: "test", channel: "ch", data: {} });

    expect(message1.id).not.toBe(message2.id);
  });

  it("should include metadata if provided", () => {
    const message = createMessage({
      event: "test",
      channel: "ch",
      data: {},
      metadata: { custom: "value" },
    });

    expect(message.metadata).toEqual({ custom: "value" });
  });

  it("should include senderId if provided", () => {
    const message = createMessage({
      event: "test",
      channel: "ch",
      data: {},
      senderId: "user-123",
    });

    expect(message.senderId).toBe("user-123");
  });
});

describe("formatSSEEvent", () => {
  it("should format a simple event", () => {
    const message = createMessage({
      event: "test",
      channel: "ch",
      data: { hello: "world" },
    });

    const sse = formatSSEEvent(message);

    expect(sse).toContain(`id:${message.id}`);
    expect(sse).toContain("event:test");
    expect(sse).toContain("data:");
    expect(sse).toContain('"hello":"world"');
    expect(sse.endsWith("\n\n")).toBe(true);
  });

  it("should include channel in event data", () => {
    const message = createMessage({
      event: "order:created",
      channel: "orders",
      data: { orderId: "123" },
    });

    const sse = formatSSEEvent(message);

    expect(sse).toContain("event:order:created");
    expect(sse).toContain('"channel":"orders"');
  });
});

describe("parseSSEEvent", () => {
  it("should parse a valid SSE event", () => {
    const message = createMessage({
      event: "test",
      channel: "ch",
      data: { value: 123 },
    });
    const sse = formatSSEEvent(message);

    const parsed = parseSSEEvent(sse);

    expect(parsed).not.toBeNull();
    expect(parsed?.event).toBe("test");
    expect(parsed?.channel).toBe("ch");
    expect(parsed?.data).toEqual({ value: 123 });
  });

  it("should return null for invalid SSE", () => {
    const parsed = parseSSEEvent("invalid data");

    expect(parsed).toBeNull();
  });

  it("should return null for empty string", () => {
    const parsed = parseSSEEvent("");

    expect(parsed).toBeNull();
  });

  it("should default to 'message' event type when not specified", () => {
    const sse = "data:{\"test\":true}\n\n";
    const parsed = parseSSEEvent(sse);

    // Should parse with default event type "message"
    expect(parsed).not.toBeNull();
    expect(parsed?.event).toBe("message");
    expect(parsed?.data).toEqual({ test: true });
  });
});

describe("RealtimeError", () => {
  it("should create error with message and code", () => {
    const error = new RealtimeError(
      "Connection failed",
      RealtimeErrorCodes.CONNECTION_FAILED
    );

    expect(error.message).toBe("Connection failed");
    expect(error.code).toBe(RealtimeErrorCodes.CONNECTION_FAILED);
    expect(error.name).toBe("RealtimeError");
  });

  it("should be an instance of Error", () => {
    const error = new RealtimeError(
      "Test error",
      RealtimeErrorCodes.INVALID_MESSAGE
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RealtimeError);
  });
});

describe("RealtimeErrorCodes", () => {
  it("should have expected error codes", () => {
    expect(RealtimeErrorCodes.CONNECTION_FAILED).toBe("CONNECTION_FAILED");
    expect(RealtimeErrorCodes.CHANNEL_NOT_FOUND).toBe("CHANNEL_NOT_FOUND");
    expect(RealtimeErrorCodes.INVALID_MESSAGE).toBe("INVALID_MESSAGE");
    expect(RealtimeErrorCodes.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(RealtimeErrorCodes.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(RealtimeErrorCodes.ADAPTER_ERROR).toBe("ADAPTER_ERROR");
    expect(RealtimeErrorCodes.MESSAGE_TOO_LARGE).toBe("MESSAGE_TOO_LARGE");
  });
});
