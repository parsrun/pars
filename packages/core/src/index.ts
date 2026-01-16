/**
 * @module
 * Core utilities and types for the Pars framework.
 * Edge-compatible with zero dependencies - works in Node.js, Deno, Bun, and Cloudflare Workers.
 *
 * @example
 * ```typescript
 * import {
 *   // Runtime detection
 *   runtime, isNode, isDeno, isBun, isCloudflare,
 *   // Environment
 *   getEnv, requireEnv, isDevelopment,
 *   // Logging
 *   createLogger, logger,
 *   // Errors
 *   ParsError, ValidationError, NotFoundError,
 *   // Utilities
 *   generateId, sha256, retry, sleep
 * } from '@parsrun/core';
 *
 * // Create a logger
 * const log = createLogger({ name: 'my-service' });
 * log.info('Service started', { port: 3000 });
 *
 * // Use runtime detection
 * if (isCloudflare()) {
 *   // Cloudflare-specific code
 * }
 * ```
 */

// ============================================
// RUNTIME & ENVIRONMENT
// ============================================

export {
  detectRuntime,
  runtime,
  runtimeInfo,
  isNode,
  isDeno,
  isBun,
  isCloudflare,
  isEdge,
  isBrowser,
  isServer,
  getRuntimeVersion,
  type Runtime,
} from "./runtime.js";

export {
  getEnv,
  requireEnv,
  getEnvNumber,
  getEnvFloat,
  getEnvBoolean,
  getEnvArray,
  getEnvJson,
  setEdgeEnv,
  clearEdgeEnv,
  isDevelopment,
  isProduction,
  isTest,
  getEnvMode,
  createEnvConfig,
  type EnvMode,
} from "./env.js";

// ============================================
// LOGGING
// ============================================

export {
  Logger,
  ConsoleTransport,
  LogLevel,
  createLogger,
  logger,
  logError,
  measureTime,
  createRequestLogger,
  type LogLevelName,
  type LogLevelValue,
  type LogEntry,
  type LogTransport,
  type LoggerConfig,
} from "./logger.js";

// ============================================
// DECIMAL / MATH
// ============================================

export {
  Decimal,
  DecimalUtils,
  decimal,
} from "./decimal.js";

// ============================================
// TYPES
// ============================================

export * from "./types.js";

// ============================================
// ERRORS
// ============================================

export * from "./errors.js";

// ============================================
// ERROR CODES
// ============================================

export {
  ErrorCodes,
  getErrorCode,
  getErrorCodesByCategory,
  isRetryableError,
  getStatusForCode,
  type ErrorCode,
  type ErrorCategory,
  type ErrorCodeDefinition,
} from "./error-codes.js";

// ============================================
// TRANSPORTS (additional - ConsoleTransport already in logger.js)
// ============================================

export {
  // Error transport types (LogTransport is in logger.js)
  type ErrorTransport,
  type CombinedTransport,
  type ErrorContext,
  type ErrorUser,
  type Breadcrumb,
  type BaseTransportOptions,
  type BatchTransportOptions,
  // Axiom
  AxiomTransport,
  createAxiomTransport,
  type AxiomTransportOptions,
  // Sentry
  SentryTransport,
  createSentryTransport,
  type SentryTransportOptions,
  type SentryClient,
  type SentryEvent,
  // Logtape
  LogtapeTransport,
  createLogtapeTransport,
  type LogtapeTransportOptions,
  type LogtapeLogger,
} from "./transports/index.js";

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate a cryptographically secure random string (hex).
 *
 * @param length - Number of random bytes (output will be 2x this length in hex)
 * @returns Promise resolving to a hex string
 *
 * @example
 * ```typescript
 * const token = await generateRandomString(32); // 64 character hex string
 * ```
 */
export async function generateRandomString(length: number): Promise<string> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a UUID v4 using the Web Crypto API.
 *
 * @returns A new UUID v4 string
 *
 * @example
 * ```typescript
 * const id = generateId(); // "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Hash a string using SHA-256 and return as hex string.
 *
 * @param input - The string to hash
 * @returns Promise resolving to the hex-encoded hash
 *
 * @example
 * ```typescript
 * const hash = await sha256('password123');
 * ```
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash a string using SHA-256 and return as ArrayBuffer.
 * Useful when you need the raw bytes for further cryptographic operations.
 *
 * @param input - The string to hash
 * @returns Promise resolving to the raw hash bytes
 *
 * @example
 * ```typescript
 * const hashBytes = await sha256Bytes('data');
 * const key = await crypto.subtle.importKey('raw', hashBytes, 'AES-GCM', false, ['encrypt']);
 * ```
 */
export async function sha256Bytes(input: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  return crypto.subtle.digest("SHA-256", data);
}

/**
 * Constant-time string comparison (timing-safe).
 * Use this for comparing secrets to prevent timing attacks.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal
 *
 * @example
 * ```typescript
 * if (constantTimeEquals(providedToken, storedToken)) {
 *   // Token is valid
 * }
 * ```
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i]! ^ bBytes[i]!;
  }

  return result === 0;
}

/**
 * Sleep for a given number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const data = await retry(
 *   () => fetchFromAPI('/users'),
 *   {
 *     maxRetries: 3,
 *     initialDelayMs: 1000,
 *     shouldRetry: (err) => err.status >= 500
 *   }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      onRetry?.(error, attempt + 1);
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Create a new object with specified keys omitted.
 *
 * @param obj - The source object
 * @param keys - Array of keys to omit
 * @returns A new object without the specified keys
 *
 * @example
 * ```typescript
 * const user = { id: 1, name: 'John', password: 'secret' };
 * const safe = omit(user, ['password']); // { id: 1, name: 'John' }
 * ```
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Create a new object with only the specified keys.
 *
 * @param obj - The source object
 * @param keys - Array of keys to include
 * @returns A new object with only the specified keys
 *
 * @example
 * ```typescript
 * const user = { id: 1, name: 'John', email: 'john@example.com' };
 * const subset = pick(user, ['id', 'name']); // { id: 1, name: 'John' }
 * ```
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Deep merge two objects recursively.
 *
 * @param target - The target object
 * @param source - The source object to merge from
 * @returns A new merged object
 *
 * @example
 * ```typescript
 * const config = deepMerge(defaults, userConfig);
 * ```
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as object,
        sourceValue as object
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Create a deep clone of an object.
 * Handles nested objects, arrays, and Date instances.
 *
 * @param obj - The object to clone
 * @returns A deep copy of the object
 *
 * @example
 * ```typescript
 * const original = { nested: { value: 1 }, date: new Date() };
 * const cloned = deepClone(original);
 * cloned.nested.value = 2; // original.nested.value is still 1
 * ```
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepClone) as T;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }
  const cloned = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    cloned[key] = deepClone(obj[key]);
  }
  return cloned;
}

/**
 * Check if a value is a plain object (not an array, Date, etc.).
 * Useful for type guards and deep merge operations.
 *
 * @param value - The value to check
 * @returns True if the value is a plain object
 *
 * @example
 * ```typescript
 * isPlainObject({});           // true
 * isPlainObject({ a: 1 });     // true
 * isPlainObject([]);           // false
 * isPlainObject(new Date());   // false
 * isPlainObject(null);         // false
 * ```
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Check if a value is null or undefined.
 * Provides a type guard for narrowing types.
 *
 * @param value - The value to check
 * @returns True if the value is null or undefined
 *
 * @example
 * ```typescript
 * if (!isNil(user)) {
 *   console.log(user.name); // TypeScript knows user is not null/undefined
 * }
 * ```
 */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if a value is empty.
 * Considers null, undefined, empty strings (including whitespace-only),
 * empty arrays, and empty objects as empty.
 *
 * @param value - The value to check
 * @returns True if the value is considered empty
 *
 * @example
 * ```typescript
 * isEmpty(null);       // true
 * isEmpty('');         // true
 * isEmpty('  ');       // true
 * isEmpty([]);         // true
 * isEmpty({});         // true
 * isEmpty('hello');    // false
 * isEmpty([1]);        // false
 * ```
 */
export function isEmpty(value: unknown): boolean {
  if (isNil(value)) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/**
 * Normalize an email address by converting to lowercase and trimming whitespace.
 * Use this before storing or comparing email addresses.
 *
 * @param email - The email address to normalize
 * @returns The normalized email address
 *
 * @example
 * ```typescript
 * normalizeEmail('  John.Doe@Example.COM  '); // 'john.doe@example.com'
 * ```
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Validate that a string is a valid email format.
 * Uses a simple regex that covers most common email formats.
 *
 * @param email - The string to validate
 * @returns True if the string is a valid email format
 *
 * @example
 * ```typescript
 * isValidEmail('user@example.com');     // true
 * isValidEmail('user@sub.example.com'); // true
 * isValidEmail('invalid');              // false
 * isValidEmail('user@');                // false
 * ```
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate a URL-friendly slug from a string.
 * Converts to lowercase, replaces non-alphanumeric characters with hyphens,
 * and removes leading/trailing hyphens.
 *
 * @param str - The string to convert
 * @returns A URL-friendly slug
 *
 * @example
 * ```typescript
 * slugify('Hello World!');           // 'hello-world'
 * slugify('My Blog Post Title');     // 'my-blog-post-title'
 * slugify('  Multiple   Spaces  ');  // 'multiple-spaces'
 * ```
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Truncate a string to a maximum length, adding a suffix if truncated.
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length including the suffix
 * @param suffix - String to append when truncated (default: "...")
 * @returns The truncated string or original if within maxLength
 *
 * @example
 * ```typescript
 * truncate('Hello World', 8);           // 'Hello...'
 * truncate('Hello', 10);                // 'Hello'
 * truncate('Long text here', 10, '>>'); // 'Long tex>>'
 * ```
 */
export function truncate(str: string, maxLength: number, suffix: string = "..."): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Create a debounced version of a function.
 * The function will only be called after it stops being called for the specified wait period.
 *
 * @param fn - The function to debounce
 * @param wait - Milliseconds to wait before calling the function
 * @returns A debounced version of the function
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounce((query: string) => {
 *   // API call
 * }, 300);
 *
 * // Rapid calls will only trigger one API call after 300ms of inactivity
 * input.addEventListener('input', (e) => debouncedSearch(e.target.value));
 * ```
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Create a throttled version of a function.
 * The function will be called at most once per wait period.
 *
 * @param fn - The function to throttle
 * @param wait - Minimum milliseconds between function calls
 * @returns A throttled version of the function
 *
 * @example
 * ```typescript
 * const throttledScroll = throttle(() => {
 *   // Handle scroll event
 * }, 100);
 *
 * // Called at most every 100ms during scrolling
 * window.addEventListener('scroll', throttledScroll);
 * ```
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastTime = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn(...args);
    }
  };
}

/**
 * Create a deferred promise with externally accessible resolve/reject functions.
 * Useful when you need to resolve a promise from outside its executor.
 *
 * @returns An object containing the promise and its resolve/reject functions
 *
 * @example
 * ```typescript
 * const { promise, resolve, reject } = createDeferred<string>();
 *
 * // Later, resolve from elsewhere
 * setTimeout(() => resolve('done!'), 1000);
 *
 * const result = await promise; // 'done!'
 * ```
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Run promises with concurrency limit.
 *
 * @param tasks - Array of async functions to execute
 * @param concurrency - Maximum concurrent tasks
 * @returns Promise resolving to array of results in order
 *
 * @example
 * ```typescript
 * const results = await pLimit(
 *   urls.map(url => () => fetch(url)),
 *   5 // Max 5 concurrent requests
 * );
 * ```
 */
export async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const [index, task] of tasks.entries()) {
    const p = Promise.resolve().then(async () => {
      results[index] = await task();
    });

    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((e) => e === p),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}
