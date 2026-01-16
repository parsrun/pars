import { describe, it, expect, beforeEach } from "vitest";
import { MemoryAdapter, createMemoryAdapter } from "./memory.js";

describe("@parsrun/storage - MemoryAdapter", () => {
  let storage: MemoryAdapter;

  beforeEach(() => {
    storage = new MemoryAdapter({ type: "memory", bucket: "test-bucket" });
  });

  describe("upload and download", () => {
    it("should upload and download a string", async () => {
      await storage.upload("test.txt", "Hello, World!");
      const data = await storage.download("test.txt");
      expect(new TextDecoder().decode(data)).toBe("Hello, World!");
    });

    it("should upload and download a Uint8Array", async () => {
      const input = new Uint8Array([1, 2, 3, 4, 5]);
      await storage.upload("binary.dat", input);
      const data = await storage.download("binary.dat");
      expect(data).toEqual(input);
    });

    it("should return file metadata on upload", async () => {
      const metadata = await storage.upload("doc.txt", "Content", {
        contentType: "text/plain",
        metadata: { author: "test" },
      });

      expect(metadata.key).toBe("doc.txt");
      expect(metadata.size).toBe(7);
      expect(metadata.contentType).toBe("text/plain");
      expect(metadata.lastModified).toBeInstanceOf(Date);
      expect(metadata.etag).toBeDefined();
      expect(metadata.metadata).toEqual({ author: "test" });
    });

    it("should throw error for non-existent file", async () => {
      await expect(storage.download("nonexistent.txt")).rejects.toThrow(
        "File not found"
      );
    });

    it("should auto-detect content type from extension", async () => {
      const metadata = await storage.upload("image.png", "fake-png-data");
      expect(metadata.contentType).toBe("image/png");
    });

    it("should use default content type for unknown extension", async () => {
      const metadata = await storage.upload("file.xyz", "data");
      expect(metadata.contentType).toBe("application/octet-stream");
    });
  });

  describe("exists and head", () => {
    it("should check if file exists", async () => {
      expect(await storage.exists("test.txt")).toBe(false);

      await storage.upload("test.txt", "Content");

      expect(await storage.exists("test.txt")).toBe(true);
    });

    it("should return null for head on non-existent file", async () => {
      const metadata = await storage.head("nonexistent.txt");
      expect(metadata).toBeNull();
    });

    it("should return metadata for head on existing file", async () => {
      await storage.upload("test.txt", "Content");
      const metadata = await storage.head("test.txt");

      expect(metadata).not.toBeNull();
      expect(metadata?.key).toBe("test.txt");
      expect(metadata?.size).toBe(7);
    });
  });

  describe("delete", () => {
    it("should delete a file", async () => {
      await storage.upload("test.txt", "Content");
      expect(await storage.exists("test.txt")).toBe(true);

      const result = await storage.delete("test.txt");
      expect(result.success).toBe(true);
      expect(await storage.exists("test.txt")).toBe(false);
    });

    it("should handle deleting non-existent file", async () => {
      const result = await storage.delete("nonexistent.txt");
      expect(result.success).toBe(true);
    });

    it("should delete multiple files", async () => {
      await storage.upload("a.txt", "A");
      await storage.upload("b.txt", "B");
      await storage.upload("c.txt", "C");

      const result = await storage.deleteMany(["a.txt", "b.txt"]);
      expect(result.deleted).toContain("a.txt");
      expect(result.deleted).toContain("b.txt");
      expect(result.errors).toHaveLength(0);

      expect(await storage.exists("a.txt")).toBe(false);
      expect(await storage.exists("b.txt")).toBe(false);
      expect(await storage.exists("c.txt")).toBe(true);
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      await storage.upload("file1.txt", "1");
      await storage.upload("file2.txt", "2");
      await storage.upload("folder/file3.txt", "3");
      await storage.upload("folder/file4.txt", "4");
    });

    it("should list all files", async () => {
      const result = await storage.list();
      expect(result.files.length).toBeGreaterThanOrEqual(2);
    });

    it("should list files with prefix", async () => {
      const result = await storage.list({ prefix: "folder/" });
      expect(result.files).toHaveLength(2);
      expect(result.files.every((f) => f.key.startsWith("folder/"))).toBe(true);
    });
  });

  describe("copy and move", () => {
    it("should copy a file", async () => {
      await storage.upload("source.txt", "Original Content");
      const metadata = await storage.copy("source.txt", "dest.txt");

      expect(metadata.key).toBe("dest.txt");
      expect(await storage.exists("source.txt")).toBe(true);
      expect(await storage.exists("dest.txt")).toBe(true);

      const destData = await storage.download("dest.txt");
      expect(new TextDecoder().decode(destData)).toBe("Original Content");
    });

    it("should copy with new metadata", async () => {
      await storage.upload("source.txt", "Content", {
        contentType: "text/plain",
        metadata: { version: "1" },
      });

      const metadata = await storage.copy("source.txt", "dest.txt", {
        metadataDirective: "REPLACE",
        contentType: "application/octet-stream",
        metadata: { version: "2" },
      });

      expect(metadata.contentType).toBe("application/octet-stream");
      expect(metadata.metadata).toEqual({ version: "2" });
    });

    it("should throw error when copying non-existent file", async () => {
      await expect(storage.copy("nonexistent.txt", "dest.txt")).rejects.toThrow(
        "Source file not found"
      );
    });

    it("should move a file", async () => {
      await storage.upload("source.txt", "Content");
      const metadata = await storage.move("source.txt", "dest.txt");

      expect(metadata.key).toBe("dest.txt");
      expect(await storage.exists("source.txt")).toBe(false);
      expect(await storage.exists("dest.txt")).toBe(true);
    });
  });

  describe("presigned URLs", () => {
    it("should generate presigned download URL", async () => {
      await storage.upload("test.txt", "Content");
      const url = await storage.getPresignedUrl("test.txt", { expiresIn: 3600 });

      expect(url).toContain("memory://");
      expect(url).toContain("test-bucket");
      expect(url).toContain("test.txt");
      expect(url).toContain("expires=");
    });

    it("should generate upload URL", async () => {
      const url = await storage.getUploadUrl("newfile.txt");
      expect(url).toContain("memory://");
    });
  });

  describe("streaming", () => {
    it("should download as stream", async () => {
      await storage.upload("stream.txt", "Stream Content");
      const stream = await storage.downloadStream("stream.txt");

      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const data = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }

      expect(new TextDecoder().decode(data)).toBe("Stream Content");
    });
  });

  describe("quota and limits", () => {
    it("should enforce storage quota", async () => {
      const limitedStorage = new MemoryAdapter({
        type: "memory",
        bucket: "limited",
        maxSize: 10,
      });

      await limitedStorage.upload("small.txt", "12345");
      await expect(
        limitedStorage.upload("big.txt", "This is too long!")
      ).rejects.toThrow("quota exceeded");
    });

    it("should track storage size", async () => {
      expect(storage.getSize()).toBe(0);

      await storage.upload("file1.txt", "Hello");
      expect(storage.getSize()).toBe(5);

      await storage.upload("file2.txt", "World");
      expect(storage.getSize()).toBe(10);

      await storage.delete("file1.txt");
      expect(storage.getSize()).toBe(5);
    });

    it("should track file count", async () => {
      expect(storage.getFileCount()).toBe(0);

      await storage.upload("a.txt", "A");
      await storage.upload("b.txt", "B");
      expect(storage.getFileCount()).toBe(2);
    });
  });

  describe("key validation", () => {
    it("should reject invalid keys", async () => {
      await expect(storage.upload("../etc/passwd", "hack")).rejects.toThrow(
        "Invalid key"
      );
      await expect(storage.upload("/absolute/path", "data")).rejects.toThrow(
        "Invalid key"
      );
      await expect(storage.upload("", "data")).rejects.toThrow("Invalid key");
    });
  });

  describe("basePath", () => {
    it("should prepend basePath to keys", async () => {
      const prefixedStorage = new MemoryAdapter({
        type: "memory",
        bucket: "test",
        basePath: "uploads",
      });

      const metadata = await prefixedStorage.upload("file.txt", "Content");
      expect(metadata.key).toBe("uploads/file.txt");
    });
  });

  describe("clear", () => {
    it("should clear all files", async () => {
      await storage.upload("a.txt", "A");
      await storage.upload("b.txt", "B");
      expect(storage.getFileCount()).toBe(2);

      storage.clear();

      expect(storage.getFileCount()).toBe(0);
      expect(storage.getSize()).toBe(0);
    });
  });

  describe("factory function", () => {
    it("should create adapter with createMemoryAdapter", async () => {
      const adapter = createMemoryAdapter({ bucket: "factory-bucket" });
      await adapter.upload("test.txt", "Factory Test");
      expect(await adapter.exists("test.txt")).toBe(true);
    });
  });

  describe("type property", () => {
    it("should have type 'memory'", () => {
      expect(storage.type).toBe("memory");
    });
  });
});
