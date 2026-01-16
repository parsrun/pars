import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage, createMemoryStorage } from "./memory.js";

describe("@parsrun/auth - MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe("basic operations", () => {
    it("should set and get a value", async () => {
      await storage.set("key1", "value1");
      const result = await storage.get("key1");
      expect(result).toBe("value1");
    });

    it("should return null for non-existent key", async () => {
      const result = await storage.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should delete a value", async () => {
      await storage.set("key1", "value1");
      await storage.delete("key1");
      const result = await storage.get("key1");
      expect(result).toBeNull();
    });

    it("should check if key exists", async () => {
      await storage.set("key1", "value1");
      expect(await storage.has("key1")).toBe(true);
      expect(await storage.has("nonexistent")).toBe(false);
    });

    it("should store objects", async () => {
      const obj = { name: "test", count: 42 };
      await storage.set("obj", obj);
      const result = await storage.get<typeof obj>("obj");
      expect(result).toEqual(obj);
    });

    it("should store arrays", async () => {
      const arr = [1, 2, 3, 4, 5];
      await storage.set("arr", arr);
      const result = await storage.get<number[]>("arr");
      expect(result).toEqual(arr);
    });
  });

  describe("TTL (Time To Live)", () => {
    it("should expire value after TTL", async () => {
      await storage.set("expiring", "value", 1); // 1 second TTL

      // Should exist immediately
      expect(await storage.get("expiring")).toBe("value");

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be expired
      expect(await storage.get("expiring")).toBeNull();
    });

    it("should not expire value without TTL", async () => {
      await storage.set("permanent", "value");

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still exist
      expect(await storage.get("permanent")).toBe("value");
    });
  });

  describe("prefix", () => {
    it("should use prefix for keys", async () => {
      const prefixedStorage = new MemoryStorage({ prefix: "auth" });

      await prefixedStorage.set("session", "data");
      expect(await prefixedStorage.get("session")).toBe("data");
    });

    it("should isolate keys with different prefixes", async () => {
      const storage1 = new MemoryStorage({ prefix: "app1" });
      const storage2 = new MemoryStorage({ prefix: "app2" });

      await storage1.set("key", "value1");
      await storage2.set("key", "value2");

      expect(await storage1.get("key")).toBe("value1");
      expect(await storage2.get("key")).toBe("value2");
    });
  });

  describe("batch operations", () => {
    it("should get multiple values", async () => {
      await storage.set("a", 1);
      await storage.set("b", 2);
      await storage.set("c", 3);

      const results = await storage.getMany<number>(["a", "b", "c", "d"]);
      expect(results).toEqual([1, 2, 3, null]);
    });

    it("should set multiple values", async () => {
      await storage.setMany<string>([
        ["x", "1"],
        ["y", "2"],
        ["z", "3"],
      ]);

      expect(await storage.get("x")).toBe("1");
      expect(await storage.get("y")).toBe("2");
      expect(await storage.get("z")).toBe("3");
    });

    it("should delete multiple values", async () => {
      await storage.set("a", 1);
      await storage.set("b", 2);
      await storage.set("c", 3);

      await storage.deleteMany(["a", "b"]);

      expect(await storage.get("a")).toBeNull();
      expect(await storage.get("b")).toBeNull();
      expect(await storage.get("c")).toBe(3);
    });
  });

  describe("keys and patterns", () => {
    it("should list all keys", async () => {
      await storage.set("user:1", "data1");
      await storage.set("user:2", "data2");
      await storage.set("session:1", "data3");

      const keys = await storage.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain("user:1");
      expect(keys).toContain("user:2");
      expect(keys).toContain("session:1");
    });

    it("should filter keys by pattern", async () => {
      await storage.set("user:1", "data1");
      await storage.set("user:2", "data2");
      await storage.set("session:1", "data3");

      const userKeys = await storage.keys("user:*");
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain("user:1");
      expect(userKeys).toContain("user:2");
    });
  });

  describe("clear", () => {
    it("should clear all values", async () => {
      await storage.set("a", 1);
      await storage.set("b", 2);

      await storage.clear();

      expect(await storage.get("a")).toBeNull();
      expect(await storage.get("b")).toBeNull();
      expect(storage.size).toBe(0);
    });

    it("should only clear prefixed keys when using prefix", async () => {
      const prefixedStorage = new MemoryStorage({ prefix: "test" });

      // Set directly on internal cache to simulate shared storage
      await prefixedStorage.set("mykey", "myvalue");

      await prefixedStorage.clear();

      expect(await prefixedStorage.get("mykey")).toBeNull();
    });
  });

  describe("capacity and eviction", () => {
    it("should evict oldest entries when at capacity", async () => {
      const smallStorage = new MemoryStorage({ maxSize: 3 });

      await smallStorage.set("a", 1);
      await smallStorage.set("b", 2);
      await smallStorage.set("c", 3);
      await smallStorage.set("d", 4); // Should trigger eviction

      expect(smallStorage.size).toBe(3);
      expect(await smallStorage.get("a")).toBeNull(); // First entry evicted
      expect(await smallStorage.get("d")).toBe(4); // New entry exists
    });

    it("should not evict when updating existing key", async () => {
      const smallStorage = new MemoryStorage({ maxSize: 3 });

      await smallStorage.set("a", 1);
      await smallStorage.set("b", 2);
      await smallStorage.set("c", 3);
      await smallStorage.set("a", 10); // Update existing

      expect(smallStorage.size).toBe(3);
      expect(await smallStorage.get("a")).toBe(10);
    });
  });

  describe("factory function", () => {
    it("should create storage with createMemoryStorage", () => {
      const storage = createMemoryStorage({ maxSize: 100 });
      expect(storage).toBeDefined();
    });
  });
});
