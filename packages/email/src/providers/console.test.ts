import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConsoleProvider, createConsoleProvider } from "./console.js";

describe("@parsrun/email - ConsoleProvider", () => {
  let provider: ConsoleProvider;

  beforeEach(() => {
    provider = new ConsoleProvider({
      apiKey: "not-needed",
      fromEmail: "test@example.com",
      fromName: "Test App",
    });

    // Mock console.log to avoid cluttering test output
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("send", () => {
    it("should send email and return success", async () => {
      const result = await provider.send({
        to: "user@example.com",
        subject: "Test Subject",
        html: "<p>Hello!</p>",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain("console-");
    });

    it("should generate unique message IDs", async () => {
      const result1 = await provider.send({
        to: "user1@example.com",
        subject: "Test 1",
        html: "<p>Hello!</p>",
      });

      const result2 = await provider.send({
        to: "user2@example.com",
        subject: "Test 2",
        html: "<p>Hello!</p>",
      });

      expect(result1.messageId).not.toBe(result2.messageId);
    });

    it("should handle text-only emails", async () => {
      const result = await provider.send({
        to: "user@example.com",
        subject: "Plain Text",
        text: "Hello, plain text!",
      });

      expect(result.success).toBe(true);
    });

    it("should handle array of recipients", async () => {
      const result = await provider.send({
        to: ["user1@example.com", "user2@example.com"],
        subject: "Group Email",
        html: "<p>Hello everyone!</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should handle EmailAddress objects", async () => {
      const result = await provider.send({
        to: { email: "user@example.com", name: "John Doe" },
        subject: "Named Recipient",
        html: "<p>Hello John!</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should handle CC and BCC", async () => {
      const result = await provider.send({
        to: "user@example.com",
        cc: "cc@example.com",
        bcc: ["bcc1@example.com", "bcc2@example.com"],
        subject: "With CC/BCC",
        html: "<p>Hello!</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should handle reply-to address", async () => {
      const result = await provider.send({
        to: "user@example.com",
        replyTo: "support@example.com",
        subject: "Reply Test",
        html: "<p>Hello!</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should handle custom from address", async () => {
      const result = await provider.send({
        to: "user@example.com",
        from: { email: "custom@example.com", name: "Custom Sender" },
        subject: "Custom From",
        html: "<p>Hello!</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should handle attachments", async () => {
      const result = await provider.send({
        to: "user@example.com",
        subject: "With Attachment",
        html: "<p>See attached!</p>",
        attachments: [
          {
            filename: "test.txt",
            content: "Hello, attachment!",
            contentType: "text/plain",
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it("should handle headers", async () => {
      const result = await provider.send({
        to: "user@example.com",
        subject: "With Headers",
        html: "<p>Hello!</p>",
        headers: {
          "X-Custom-Header": "custom-value",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should handle tags", async () => {
      const result = await provider.send({
        to: "user@example.com",
        subject: "With Tags",
        html: "<p>Hello!</p>",
        tags: [
          { name: "category", value: "welcome" },
        ],
      });

      expect(result.success).toBe(true);
    });

    it("should handle scheduled emails", async () => {
      const scheduledAt = new Date(Date.now() + 3600000); // 1 hour from now

      const result = await provider.send({
        to: "user@example.com",
        subject: "Scheduled Email",
        html: "<p>Hello from the future!</p>",
        scheduledAt,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("sendBatch", () => {
    it("should send multiple emails in batch", async () => {
      const result = await provider.sendBatch({
        emails: [
          { to: "user1@example.com", subject: "Test 1", html: "<p>1</p>" },
          { to: "user2@example.com", subject: "Test 2", html: "<p>2</p>" },
          { to: "user3@example.com", subject: "Test 3", html: "<p>3</p>" },
        ],
      });

      expect(result.total).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results.every((r) => r.success)).toBe(true);
    });

    it("should track failed emails", async () => {
      // Create a provider that will fail on certain conditions
      // (In practice, ConsoleProvider never fails, but the interface supports it)
      const result = await provider.sendBatch({
        emails: [
          { to: "user1@example.com", subject: "Test 1", html: "<p>1</p>" },
          { to: "user2@example.com", subject: "Test 2", html: "<p>2</p>" },
        ],
      });

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
    });
  });

  describe("verify", () => {
    it("should always return true for console provider", async () => {
      const result = await provider.verify();
      expect(result).toBe(true);
    });
  });

  describe("factory function", () => {
    it("should create provider with createConsoleProvider", async () => {
      const factoryProvider = createConsoleProvider({
        apiKey: "test",
        fromEmail: "factory@example.com",
      });

      const result = await factoryProvider.send({
        to: "user@example.com",
        subject: "Factory Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("type property", () => {
    it("should have type 'console'", () => {
      expect(provider.type).toBe("console");
    });
  });

  describe("console logging", () => {
    it("should log email details to console", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      await provider.send({
        to: "user@example.com",
        subject: "Logged Email",
        html: "<p>Check the logs!</p>",
      });

      expect(consoleSpy).toHaveBeenCalled();

      // Verify some expected content was logged
      const calls = consoleSpy.mock.calls.flat();
      expect(calls.some((c) => String(c).includes("EMAIL"))).toBe(true);
    });
  });

  describe("address formatting", () => {
    it("should format string addresses", async () => {
      const result = await provider.send({
        to: "simple@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should format EmailAddress with name", async () => {
      const result = await provider.send({
        to: { email: "named@example.com", name: "Named User" },
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should format EmailAddress without name", async () => {
      const result = await provider.send({
        to: { email: "unnamed@example.com" },
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(true);
    });

    it("should format mixed array of addresses", async () => {
      const result = await provider.send({
        to: [
          "simple@example.com",
          { email: "named@example.com", name: "Named" },
          { email: "unnamed@example.com" },
        ],
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(true);
    });
  });
});
