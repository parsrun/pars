import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryQueueAdapter, createMemoryQueueAdapter } from "./memory.js";

describe("@parsrun/queue - MemoryQueueAdapter", () => {
  let queue: MemoryQueueAdapter<{ userId: string }>;

  beforeEach(() => {
    queue = new MemoryQueueAdapter({ name: "test-queue" });
  });

  afterEach(async () => {
    await queue.close();
  });

  describe("send", () => {
    it("should send a message and return an ID", async () => {
      const id = await queue.send({ userId: "user-123" });
      expect(id).toBeDefined();
      expect(id).toContain("msg-");
    });

    it("should send multiple messages", async () => {
      const id1 = await queue.send({ userId: "user-1" });
      const id2 = await queue.send({ userId: "user-2" });
      const id3 = await queue.send({ userId: "user-3" });

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);

      const stats = await queue.getStats();
      expect(stats.messageCount).toBe(3);
    });

    it("should support delayed messages", async () => {
      await queue.send({ userId: "delayed" }, { delaySeconds: 10 });

      // Message should not be visible yet
      const messages = await queue.receive(1);
      expect(messages).toHaveLength(0);
    });

    it("should support message deduplication", async () => {
      const id1 = await queue.send(
        { userId: "user-1" },
        { deduplicationId: "unique-1" }
      );
      const id2 = await queue.send(
        { userId: "user-1" },
        { deduplicationId: "unique-1" }
      );

      // Second send should return dedup ID
      expect(id2).toContain("dedup-");
    });

    it("should reject when queue is full", async () => {
      const smallQueue = new MemoryQueueAdapter<string>({
        name: "small-queue",
        maxSize: 2,
      });

      await smallQueue.send("msg1");
      await smallQueue.send("msg2");

      await expect(smallQueue.send("msg3")).rejects.toThrow("full");

      await smallQueue.close();
    });
  });

  describe("sendBatch", () => {
    it("should send multiple messages in batch", async () => {
      const result = await queue.sendBatch([
        { body: { userId: "user-1" } },
        { body: { userId: "user-2" } },
        { body: { userId: "user-3" } },
      ]);

      expect(result.total).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.messageIds).toHaveLength(3);
    });

    it("should report errors in batch", async () => {
      const smallQueue = new MemoryQueueAdapter<string>({
        name: "small",
        maxSize: 2,
      });

      const result = await smallQueue.sendBatch([
        { body: "msg1" },
        { body: "msg2" },
        { body: "msg3" }, // This should fail
      ]);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);

      await smallQueue.close();
    });
  });

  describe("receive", () => {
    it("should receive messages", async () => {
      await queue.send({ userId: "user-1" });
      await queue.send({ userId: "user-2" });

      const messages = await queue.receive(10);
      expect(messages).toHaveLength(2);
      expect(messages[0]?.body).toEqual({ userId: "user-1" });
      expect(messages[1]?.body).toEqual({ userId: "user-2" });
    });

    it("should limit received messages", async () => {
      await queue.send({ userId: "user-1" });
      await queue.send({ userId: "user-2" });
      await queue.send({ userId: "user-3" });

      const messages = await queue.receive(2);
      expect(messages).toHaveLength(2);
    });

    it("should track message attempts", async () => {
      await queue.send({ userId: "user-1" });

      const messages1 = await queue.receive(1);
      expect(messages1[0]?.attempts).toBe(1);

      // Nack to return to queue
      await queue.nack(messages1[0]!.id);

      const messages2 = await queue.receive(1);
      expect(messages2[0]?.attempts).toBe(2);
    });

    it("should include message metadata", async () => {
      await queue.send({ userId: "user-1" }, { metadata: { source: "api" } });

      const messages = await queue.receive(1);
      expect(messages[0]?.metadata).toEqual({ source: "api" });
    });

    it("should return timestamp", async () => {
      const before = new Date();
      await queue.send({ userId: "user-1" });
      const after = new Date();

      const messages = await queue.receive(1);
      expect(messages[0]?.timestamp).toBeInstanceOf(Date);
      expect(messages[0]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(messages[0]!.timestamp.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    });
  });

  describe("ack", () => {
    it("should acknowledge a message", async () => {
      await queue.send({ userId: "user-1" });

      const messages = await queue.receive(1);
      await queue.ack(messages[0]!.id);

      const stats = await queue.getStats();
      expect(stats.messageCount).toBe(0);
      expect(stats.inFlightCount).toBe(0);
    });

    it("should throw error for non-existent message", async () => {
      await expect(queue.ack("invalid-id")).rejects.toThrow("not found");
    });
  });

  describe("ackBatch", () => {
    it("should acknowledge multiple messages", async () => {
      await queue.send({ userId: "user-1" });
      await queue.send({ userId: "user-2" });

      const messages = await queue.receive(2);
      await queue.ackBatch(messages.map((m) => m.id));

      const stats = await queue.getStats();
      expect(stats.inFlightCount).toBe(0);
    });
  });

  describe("nack", () => {
    it("should return message to queue", async () => {
      await queue.send({ userId: "user-1" });

      const messages = await queue.receive(1);
      expect((await queue.getStats()).messageCount).toBe(0);

      await queue.nack(messages[0]!.id);
      expect((await queue.getStats()).messageCount).toBe(1);
    });

    it("should support delay on nack", async () => {
      await queue.send({ userId: "user-1" });

      const messages = await queue.receive(1);
      await queue.nack(messages[0]!.id, 60); // 60 second delay

      // Message should not be visible
      const requeue = await queue.receive(1);
      expect(requeue).toHaveLength(0);
    });

    it("should throw error for non-existent message", async () => {
      await expect(queue.nack("invalid-id")).rejects.toThrow("not found");
    });
  });

  describe("getStats", () => {
    it("should return queue statistics", async () => {
      await queue.send({ userId: "user-1" });
      await queue.send({ userId: "user-2" });

      const stats = await queue.getStats();
      expect(stats.messageCount).toBe(2);
      expect(stats.inFlightCount).toBe(0);
    });

    it("should track in-flight messages", async () => {
      await queue.send({ userId: "user-1" });
      await queue.send({ userId: "user-2" });

      await queue.receive(1);

      const stats = await queue.getStats();
      expect(stats.messageCount).toBe(1);
      expect(stats.inFlightCount).toBe(1);
    });
  });

  describe("purge", () => {
    it("should remove all messages", async () => {
      await queue.send({ userId: "user-1" });
      await queue.send({ userId: "user-2" });

      await queue.purge();

      const stats = await queue.getStats();
      expect(stats.messageCount).toBe(0);
      expect(stats.inFlightCount).toBe(0);
    });
  });

  describe("consume", () => {
    it("should process messages with handler", async () => {
      const processed: string[] = [];

      await queue.send({ userId: "user-1" });
      await queue.send({ userId: "user-2" });

      await queue.consume(async (msg) => {
        processed.push(msg.body.userId);
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      await queue.stopConsuming();

      expect(processed).toContain("user-1");
      expect(processed).toContain("user-2");
    });

    // Note: Full retry testing with consume() is slow due to 5-second nack delays.
    // This test verifies that nack returns messages to the queue for retry.
    it("should return failed messages to queue for retry via nack", async () => {
      await queue.send({ userId: "retry" });

      // First receive
      const messages1 = await queue.receive(1);
      expect(messages1).toHaveLength(1);
      expect(messages1[0]?.attempts).toBe(1);

      // Nack to simulate failed processing (no delay for instant retry)
      await queue.nack(messages1[0]!.id);

      // Second receive - should get same message with incremented attempts
      const messages2 = await queue.receive(1);
      expect(messages2).toHaveLength(1);
      expect(messages2[0]?.attempts).toBe(2);
      expect(messages2[0]?.body.userId).toBe("retry");
    });
  });

  describe("factory function", () => {
    it("should create adapter with createMemoryQueueAdapter", async () => {
      const adapter = createMemoryQueueAdapter<{ data: string }>({
        name: "factory-queue",
      });

      await adapter.send({ data: "test" });
      const messages = await adapter.receive(1);
      expect(messages[0]?.body.data).toBe("test");

      await adapter.close();
    });
  });

  describe("type property", () => {
    it("should have type 'memory'", () => {
      expect(queue.type).toBe("memory");
    });
  });

  describe("visibility timeout", () => {
    it("should use custom visibility timeout", async () => {
      const shortQueue = new MemoryQueueAdapter<string>({
        name: "short-timeout",
        visibilityTimeout: 1, // 1 second
      });

      await shortQueue.send("msg");
      await shortQueue.receive(1);

      // Message is in flight
      expect((await shortQueue.getStats()).inFlightCount).toBe(1);

      // Wait for visibility timeout to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Message should be back in queue after getStats cleans up
      const stats = await shortQueue.getStats();
      expect(stats.messageCount).toBe(1);
      expect(stats.inFlightCount).toBe(0);

      await shortQueue.close();
    });
  });
});
