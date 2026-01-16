/**
 * @parsrun/database - Utilities
 * Database utility functions
 */

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a database operation with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 100,
    maxDelay = 5000,
    shouldRetry = isRetryableError,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Connection errors
    if (
      message.includes("connection") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("etimedout")
    ) {
      return true;
    }

    // Serialization errors (can retry)
    if (
      message.includes("could not serialize") ||
      message.includes("deadlock detected")
    ) {
      return true;
    }

    // Pool exhaustion
    if (message.includes("too many clients")) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a PostgreSQL connection string
 */
export function parseConnectionString(connectionString: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  params: Record<string, string>;
} {
  const url = new URL(connectionString);

  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return {
    host: url.hostname,
    port: parseInt(url.port || "5432", 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl:
      url.searchParams.get("sslmode") === "require" ||
      url.searchParams.get("ssl") === "true",
    params,
  };
}

/**
 * Build a PostgreSQL connection string
 */
export function buildConnectionString(config: {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  params?: Record<string, string>;
}): string {
  const url = new URL(`postgresql://${config.host}`);
  url.port = String(config.port ?? 5432);
  url.username = encodeURIComponent(config.user);
  url.password = encodeURIComponent(config.password);
  url.pathname = `/${config.database}`;

  if (config.ssl) {
    url.searchParams.set("sslmode", "require");
  }

  if (config.params) {
    for (const [key, value] of Object.entries(config.params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Transform object keys from snake_case to camelCase
 */
export function transformToCamelCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = snakeToCamel(key);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[newKey] = transformToCamelCase(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[newKey] = value.map((item) =>
        item && typeof item === "object"
          ? transformToCamelCase(item as Record<string, unknown>)
          : item
      );
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * Transform object keys from camelCase to snake_case
 */
export function transformToSnakeCase<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = camelToSnake(key);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[newKey] = transformToSnakeCase(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[newKey] = value.map((item) =>
        item && typeof item === "object"
          ? transformToSnakeCase(item as Record<string, unknown>)
          : item
      );
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a short ID (8 characters)
 */
export function generateShortId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Paginate results
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  maxLimit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Calculate pagination offset
 */
export function getPaginationOffset(options: PaginationOptions): {
  offset: number;
  limit: number;
} {
  const page = Math.max(1, options.page ?? 1);
  const maxLimit = options.maxLimit ?? 100;
  const limit = Math.min(Math.max(1, options.limit ?? 20), maxLimit);
  const offset = (page - 1) * limit;

  return { offset, limit };
}

/**
 * Create paginated result
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  options: PaginationOptions
): PaginatedResult<T> {
  const { offset, limit } = getPaginationOffset(options);
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

/**
 * Escape special characters for LIKE queries
 */
export function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

/**
 * Build a search pattern for LIKE queries
 */
export function buildSearchPattern(
  value: string,
  mode: "contains" | "startsWith" | "endsWith" = "contains"
): string {
  const escaped = escapeLike(value);

  switch (mode) {
    case "startsWith":
      return `${escaped}%`;
    case "endsWith":
      return `%${escaped}`;
    case "contains":
    default:
      return `%${escaped}%`;
  }
}
