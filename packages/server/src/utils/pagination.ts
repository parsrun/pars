/**
 * @parsrun/server - Pagination Utilities
 * Helpers for paginated API responses
 */

import type { HonoContext } from "../context.js";

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  /** Default page size */
  defaultLimit?: number;
  /** Maximum page size */
  maxLimit?: number;
  /** Page query parameter name */
  pageParam?: string;
  /** Limit query parameter name */
  limitParam?: string;
}

const defaultOptions: Required<PaginationOptions> = {
  defaultLimit: 20,
  maxLimit: 100,
  pageParam: "page",
  limitParam: "limit",
};

/**
 * Parse pagination from request query
 *
 * @example
 * ```typescript
 * app.get('/users', async (c) => {
 *   const { page, limit, offset } = parsePagination(c);
 *
 *   const users = await db.query.users.findMany({
 *     limit,
 *     offset,
 *   });
 *
 *   const total = await db.query.users.count();
 *
 *   return c.json(paginate(users, { page, limit, total }));
 * });
 * ```
 */
export function parsePagination(
  c: HonoContext,
  options: PaginationOptions = {}
): PaginationParams {
  const opts = { ...defaultOptions, ...options };

  const pageStr = c.req.query(opts.pageParam);
  const limitStr = c.req.query(opts.limitParam);

  let page = pageStr ? parseInt(pageStr, 10) : 1;
  let limit = limitStr ? parseInt(limitStr, 10) : opts.defaultLimit;

  // Validate and clamp values
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = opts.defaultLimit;
  if (limit > opts.maxLimit) limit = opts.maxLimit;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(params: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta {
  const { page, limit, total } = params;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Create paginated response
 *
 * @example
 * ```typescript
 * const users = await getUsers({ limit, offset });
 * const total = await countUsers();
 *
 * return c.json(paginate(users, { page, limit, total }));
 * ```
 */
export function paginate<T>(
  data: T[],
  params: { page: number; limit: number; total: number }
): PaginatedResponse<T> {
  return {
    data,
    pagination: createPaginationMeta(params),
  };
}

/**
 * Cursor-based pagination params
 */
export interface CursorPaginationParams {
  cursor?: string | undefined;
  limit: number;
  direction: "forward" | "backward";
}

/**
 * Cursor pagination metadata
 */
export interface CursorPaginationMeta {
  cursor?: string | undefined;
  nextCursor?: string | undefined;
  prevCursor?: string | undefined;
  hasMore: boolean;
  limit: number;
}

/**
 * Cursor paginated response
 */
export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: CursorPaginationMeta;
}

/**
 * Parse cursor pagination from request
 *
 * @example
 * ```typescript
 * app.get('/feed', async (c) => {
 *   const { cursor, limit, direction } = parseCursorPagination(c);
 *
 *   const items = await db.query.posts.findMany({
 *     where: cursor ? { id: { gt: cursor } } : undefined,
 *     limit: limit + 1, // Fetch one extra to check hasMore
 *     orderBy: { createdAt: 'desc' },
 *   });
 *
 *   return c.json(cursorPaginate(items, { cursor, limit }));
 * });
 * ```
 */
export function parseCursorPagination(
  c: HonoContext,
  options: PaginationOptions = {}
): CursorPaginationParams {
  const opts = { ...defaultOptions, ...options };

  const cursor = c.req.query("cursor") ?? undefined;
  const limitStr = c.req.query(opts.limitParam);
  const direction = c.req.query("direction") === "backward" ? "backward" : "forward";

  let limit = limitStr ? parseInt(limitStr, 10) : opts.defaultLimit;
  if (isNaN(limit) || limit < 1) limit = opts.defaultLimit;
  if (limit > opts.maxLimit) limit = opts.maxLimit;

  return { cursor, limit, direction };
}

/**
 * Create cursor paginated response
 *
 * @example
 * ```typescript
 * // Fetch limit + 1 items
 * const items = await fetchItems(limit + 1);
 * return c.json(cursorPaginate(items, { cursor, limit }));
 * ```
 */
export function cursorPaginate<T extends { id: string }>(
  data: T[],
  params: { cursor?: string; limit: number }
): CursorPaginatedResponse<T> {
  const { cursor, limit } = params;
  const hasMore = data.length > limit;

  // Remove the extra item if we have more
  const items = hasMore ? data.slice(0, limit) : data;

  const lastItem = items[items.length - 1];
  const firstItem = items[0];

  return {
    data: items,
    pagination: {
      cursor,
      nextCursor: hasMore && lastItem ? lastItem.id : undefined,
      prevCursor: cursor && firstItem ? firstItem.id : undefined,
      hasMore,
      limit,
    },
  };
}

/**
 * Add pagination headers to response
 */
export function setPaginationHeaders(
  c: HonoContext,
  meta: PaginationMeta
): void {
  c.header("X-Total-Count", String(meta.total));
  c.header("X-Total-Pages", String(meta.totalPages));
  c.header("X-Page", String(meta.page));
  c.header("X-Per-Page", String(meta.limit));
  c.header("X-Has-Next", String(meta.hasNext));
  c.header("X-Has-Prev", String(meta.hasPrev));
}
