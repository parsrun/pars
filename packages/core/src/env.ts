/**
 * @parsrun/core - Environment Variables
 * Runtime-agnostic environment variable access
 * Works in Node.js, Deno, Bun, and Cloudflare Workers
 */

import { runtime } from "./runtime.js";

/**
 * Environment variable store for edge runtimes
 * Must be set from the request handler's env parameter
 */
let edgeEnvStore: Record<string, string | undefined> = {};

/**
 * Set environment variables for edge runtimes (Cloudflare Workers, etc.)
 * Call this from your worker's fetch handler with the env parameter
 *
 * @example
 * ```typescript
 * export default {
 *   async fetch(request, env) {
 *     setEdgeEnv(env);
 *     // ... rest of handler
 *   }
 * }
 * ```
 */
export function setEdgeEnv(env: Record<string, string | undefined>): void {
  edgeEnvStore = { ...edgeEnvStore, ...env };
}

/**
 * Clear edge environment store
 */
export function clearEdgeEnv(): void {
  edgeEnvStore = {};
}

/**
 * Get an environment variable value
 * Works across all runtimes
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  // Edge runtimes (Cloudflare Workers, etc.)
  if (runtime === "cloudflare" || runtime === "edge") {
    return edgeEnvStore[key] ?? defaultValue;
  }

  // Deno
  if (runtime === "deno") {
    try {
      return (globalThis as any).Deno.env.get(key) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }

  // Node.js / Bun (both use process.env)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] ?? defaultValue;
  }

  // Browser - check for injected env
  if (runtime === "browser" && typeof (globalThis as any).__ENV__ !== "undefined") {
    return (globalThis as any).__ENV__[key] ?? defaultValue;
  }

  return defaultValue;
}

/**
 * Get an environment variable, throwing if not found
 */
export function requireEnv(key: string): string {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    throw new Error(`Required environment variable "${key}" is not set`);
  }
  return value;
}

/**
 * Get an environment variable as a number
 */
export function getEnvNumber(key: string, defaultValue?: number): number | undefined {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get an environment variable as a float
 */
export function getEnvFloat(key: string, defaultValue?: number): number | undefined {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get an environment variable as a boolean
 */
export function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value === "true" || value === "1" || value === "yes";
}

/**
 * Get an environment variable as an array (comma-separated)
 */
export function getEnvArray(key: string, defaultValue: string[] = []): string[] {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Get an environment variable as JSON
 */
export function getEnvJson<T>(key: string, defaultValue?: T): T | undefined {
  const value = getEnv(key);
  if (value === undefined || value === "") {
    return defaultValue;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  const env = getEnv("NODE_ENV");
  return env === "development" || env === undefined;
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return getEnv("NODE_ENV") === "production";
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return getEnv("NODE_ENV") === "test";
}

/**
 * Environment mode
 */
export type EnvMode = "development" | "production" | "test";

/**
 * Get current environment mode
 */
export function getEnvMode(): EnvMode {
  const env = getEnv("NODE_ENV");
  if (env === "production") return "production";
  if (env === "test") return "test";
  return "development";
}

/**
 * Create a typed environment configuration object
 *
 * @example
 * ```typescript
 * const env = createEnvConfig({
 *   DATABASE_URL: { required: true },
 *   PORT: { type: 'number', default: 3000 },
 *   DEBUG: { type: 'boolean', default: false },
 * });
 *
 * env.DATABASE_URL // string
 * env.PORT // number
 * env.DEBUG // boolean
 * ```
 */
export function createEnvConfig<T extends EnvSchema>(schema: T): EnvResult<T> {
  const result: Record<string, unknown> = {};

  for (const [key, config] of Object.entries(schema)) {
    const envConfig = config as EnvConfigItem;
    let value: unknown;

    switch (envConfig.type) {
      case "number":
        value = getEnvNumber(key, envConfig.default as number | undefined);
        break;
      case "boolean":
        value = getEnvBoolean(key, envConfig.default as boolean | undefined);
        break;
      case "array":
        value = getEnvArray(key, envConfig.default as string[] | undefined);
        break;
      case "json":
        value = getEnvJson(key, envConfig.default);
        break;
      default:
        value = getEnv(key, envConfig.default as string | undefined);
    }

    if (envConfig.required && (value === undefined || value === "")) {
      throw new Error(`Required environment variable "${key}" is not set`);
    }

    result[key] = value;
  }

  return result as EnvResult<T>;
}

// Type helpers for createEnvConfig
type EnvConfigItem = {
  type?: "string" | "number" | "boolean" | "array" | "json";
  required?: boolean;
  default?: unknown;
};

type EnvSchema = Record<string, EnvConfigItem>;

type EnvResult<T extends EnvSchema> = {
  [K in keyof T]: T[K]["type"] extends "number"
    ? number
    : T[K]["type"] extends "boolean"
      ? boolean
      : T[K]["type"] extends "array"
        ? string[]
        : T[K]["type"] extends "json"
          ? unknown
          : string;
};
