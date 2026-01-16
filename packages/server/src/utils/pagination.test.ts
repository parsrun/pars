import { describe, it, expect, vi } from "vitest";
import { createPaginationMeta, paginate, cursorPaginate } from "./pagination.js";

describe("@parsrun/server - Pagination Utilities", () => {
  describe("createPaginationMeta", () => {
    it("should create pagination meta for first page", () => {
      const meta = createPaginationMeta({ page: 1, limit: 10, total: 100 });

      expect(meta).toEqual({
        page: 1,
        limit: 10,
        total: 100,
        totalPages: 10,
        hasNext: true,
        hasPrev: false,
      });
    });

    it("should create pagination meta for middle page", () => {
      const meta = createPaginationMeta({ page: 5, limit: 10, total: 100 });

      expect(meta).toEqual({
        page: 5,
        limit: 10,
        total: 100,
        totalPages: 10,
        hasNext: true,
        hasPrev: true,
      });
    });

    it("should create pagination meta for last page", () => {
      const meta = createPaginationMeta({ page: 10, limit: 10, total: 100 });

      expect(meta).toEqual({
        page: 10,
        limit: 10,
        total: 100,
        totalPages: 10,
        hasNext: false,
        hasPrev: true,
      });
    });

    it("should handle single page", () => {
      const meta = createPaginationMeta({ page: 1, limit: 10, total: 5 });

      expect(meta).toEqual({
        page: 1,
        limit: 10,
        total: 5,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it("should handle empty results", () => {
      const meta = createPaginationMeta({ page: 1, limit: 10, total: 0 });

      expect(meta).toEqual({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it("should calculate totalPages correctly with remainder", () => {
      const meta = createPaginationMeta({ page: 1, limit: 10, total: 95 });

      expect(meta.totalPages).toBe(10); // 95/10 = 9.5, ceil = 10
    });
  });

  describe("paginate", () => {
    it("should create paginated response", () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = paginate(data, { page: 1, limit: 10, total: 100 });

      expect(result.data).toEqual(data);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(100);
    });

    it("should work with empty data", () => {
      const result = paginate([], { page: 1, limit: 10, total: 0 });

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe("cursorPaginate", () => {
    it("should create cursor paginated response with hasMore", () => {
      const data = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
        { id: "4", name: "Extra" }, // Extra item indicates hasMore
      ];

      const result = cursorPaginate(data, { limit: 3 });

      expect(result.data).toHaveLength(3);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe("3");
    });

    it("should handle last page without hasMore", () => {
      const data = [
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
      ];

      const result = cursorPaginate(data, { limit: 3 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeUndefined();
    });

    it("should include cursor in response", () => {
      const data = [{ id: "5", name: "Item 5" }];

      const result = cursorPaginate(data, { cursor: "abc123", limit: 10 });

      expect(result.pagination.cursor).toBe("abc123");
    });

    it("should set prevCursor when cursor is provided", () => {
      const data = [{ id: "5", name: "Item 5" }];

      const result = cursorPaginate(data, { cursor: "prev", limit: 10 });

      expect(result.pagination.prevCursor).toBe("5");
    });

    it("should handle empty data", () => {
      const result = cursorPaginate([], { limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeUndefined();
    });
  });
});
