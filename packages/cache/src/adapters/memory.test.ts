import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryCacheAdapter, createMemoryCacheAdapter } from "./memory.js";

describe("@parsrun/cache - MemoryCacheAdapter", () => {
  let cache: MemoryCacheAdapter;

  beforeEach(() => {
    cache = new MemoryCacheAdapter({ cleanupInterval: 0 }); // Disable auto cleanup for tests
  });

  afterEach(async () => {
    await cache.close();
  });

  describe("basic operations", () => {
    it("should set and get a value", async () => {
      await cache.set("key1", "value1");
      const result = await cache.get("key1");
      expect(result).toBe("value1");
    });

    it("should return null for non-existent key", async () => {
      const result = await cache.get("nonexistent");
      expect(result).toBeNull();
    });

    it("should delete a value", async () => {
      await cache.set("key1", "value1");
      await cache.delete("key1");
      const result = await cache.get("key1");
      expect(result).toBeNull();
    });

    it("should check if key exists", async () => {
      await cache.set("key1", "value1");
      expect(await cache.has("key1")).toBe(true);
      expect(await cache.has("nonexistent")).toBe(false);
    });

    it("should store objects", async () => {
      const obj = { name: "test", count: 42 };
      await cache.set("obj", obj);
      const result = await cache.get<typeof obj>("obj");
      expect(result).toEqual(obj);
    });

    it("should clear all values", async () => {
      await cache.set("a", 1);
      await cache.set("b", 2);
      await cache.clear();
      expect(await cache.get("a")).toBeNull();
      expect(await cache.get("b")).toBeNull();
    });
  });

  describe("TTL (Time To Live)", () => {
    it("should expire value after TTL", async () => {
      await cache.set("expiring", "value", { ttl: 1 }); // 1 second

      expect(await cache.get("expiring")).toBe("value");

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await cache.get("expiring")).toBeNull();
    });

    it("should not expire value without TTL", async () => {
      await cache.set("permanent", "value");

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(await cache.get("permanent")).toBe("value");
    });

    it("should return TTL for key", async () => {
      await cache.set("key", "value", { ttl: 10 });

      const ttl = await cache.ttl("key");
      expect(ttl).toBeGreaterThan(8);
      expect(ttl).toBeLessThanOrEqual(10);
    });

    it("should return -1 for key without expiry", async () => {
      await cache.set("key", "value");

      const ttl = await cache.ttl("key");
      expect(ttl).toBe(-1);
    });

    it("should return -2 for non-existent key", async () => {
      const ttl = await cache.ttl("nonexistent");
      expect(ttl).toBe(-2);
    });

    it("should refresh TTL when requested", async () => {
      await cache.set("key", "value", { ttl: 2 });

      // Wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get with refresh
      await cache.get("key", { refresh: true });

      // Wait another 1.5 seconds (would have expired without refresh)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(await cache.get("key")).toBe("value");
    });
  });

  describe("tags", () => {
    it("should store value with tags", async () => {
      await cache.set("user:1", { name: "John" }, { tags: ["users"] });
      const result = await cache.get("user:1");
      expect(result).toEqual({ name: "John" });
    });

    it("should invalidate by tag", async () => {
      await cache.set("user:1", "data1", { tags: ["users"] });
      await cache.set("user:2", "data2", { tags: ["users"] });
      await cache.set("post:1", "data3", { tags: ["posts"] });

      await cache.invalidateByTags(["users"]);

      expect(await cache.get("user:1")).toBeNull();
      expect(await cache.get("user:2")).toBeNull();
      expect(await cache.get("post:1")).toBe("data3");
    });

    it("should invalidate by multiple tags", async () => {
      await cache.set("key1", "val1", { tags: ["tag1"] });
      await cache.set("key2", "val2", { tags: ["tag2"] });
      await cache.set("key3", "val3", { tags: ["tag1", "tag2"] });

      await cache.invalidateByTags(["tag1", "tag2"]);

      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
      expect(await cache.get("key3")).toBeNull();
    });
  });

  describe("metadata", () => {
    it("should store value with metadata", async () => {
      await cache.set("key", "value", { metadata: { source: "api" } });
      const result = await cache.get("key");
      expect(result).toBe("value");
    });
  });

  describe("batch operations", () => {
    it("should get multiple values", async () => {
      await cache.set("a", 1);
      await cache.set("b", 2);
      await cache.set("c", 3);

      const results = await cache.getMany<number>(["a", "b", "c", "d"]);

      expect(results.get("a")).toBe(1);
      expect(results.get("b")).toBe(2);
      expect(results.get("c")).toBe(3);
      expect(results.get("d")).toBeNull();
    });

    it("should set multiple values", async () => {
      const entries = new Map<string, string>([
        ["x", "1"],
        ["y", "2"],
        ["z", "3"],
      ]);

      await cache.setMany(entries);

      expect(await cache.get("x")).toBe("1");
      expect(await cache.get("y")).toBe("2");
      expect(await cache.get("z")).toBe("3");
    });

    it("should delete multiple values", async () => {
      await cache.set("a", 1);
      await cache.set("b", 2);
      await cache.set("c", 3);

      await cache.deleteMany(["a", "b"]);

      expect(await cache.get("a")).toBeNull();
      expect(await cache.get("b")).toBeNull();
      expect(await cache.get("c")).toBe(3);
    });
  });

  describe("capacity", () => {
    it("should evict oldest entry when at capacity", async () => {
      const smallCache = new MemoryCacheAdapter({ maxEntries: 3, cleanupInterval: 0 });

      await smallCache.set("a", 1);
      await smallCache.set("b", 2);
      await smallCache.set("c", 3);
      await smallCache.set("d", 4); // Should evict 'a'

      expect(await smallCache.get("a")).toBeNull();
      expect(await smallCache.get("d")).toBe(4);

      await smallCache.close();
    });

    it("should report stats", async () => {
      await cache.set("a", 1);
      await cache.set("b", 2);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe("factory function", () => {
    it("should create adapter with createMemoryCacheAdapter", async () => {
      const adapter = createMemoryCacheAdapter({ maxEntries: 100 });
      await adapter.set("test", "value");
      expect(await adapter.get("test")).toBe("value");
      await adapter.close();
    });
  });

  describe("type property", () => {
    it("should have type 'memory'", () => {
      expect(cache.type).toBe("memory");
    });
  });
});
