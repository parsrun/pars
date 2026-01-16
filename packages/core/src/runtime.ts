/**
 * @parsrun/core - Runtime Detection
 * Edge-compatible runtime detection for Node.js, Deno, Bun, and Cloudflare Workers
 */

export type Runtime = "node" | "deno" | "bun" | "cloudflare" | "edge" | "browser" | "unknown";

/**
 * Detect the current JavaScript runtime
 */
export function detectRuntime(): Runtime {
  // Bun check (must be before Node since Bun also has process)
  if (typeof globalThis !== "undefined" && "Bun" in globalThis) {
    return "bun";
  }

  // Deno check
  if (typeof globalThis !== "undefined" && "Deno" in globalThis) {
    return "deno";
  }

  // Cloudflare Workers check (has caches but no process)
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as any).caches !== "undefined" &&
    typeof (globalThis as any).process === "undefined"
  ) {
    return "cloudflare";
  }

  // Generic Edge runtime check (Vercel Edge, etc.)
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as any).EdgeRuntime !== "undefined"
  ) {
    return "edge";
  }

  // Browser check
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as any).window !== "undefined" &&
    typeof (globalThis as any).document !== "undefined"
  ) {
    return "browser";
  }

  // Node.js check
  if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    return "node";
  }

  return "unknown";
}

/**
 * Current runtime (cached)
 */
export const runtime = detectRuntime();

/**
 * Runtime information helpers
 */
export const runtimeInfo = {
  runtime,
  isNode: runtime === "node",
  isDeno: runtime === "deno",
  isBun: runtime === "bun",
  isCloudflare: runtime === "cloudflare",
  isEdge: runtime === "cloudflare" || runtime === "edge" || runtime === "deno",
  isBrowser: runtime === "browser",
  isServer: runtime !== "browser",
  supportsWebCrypto: typeof globalThis.crypto?.subtle !== "undefined",
  supportsStreams: typeof globalThis.ReadableStream !== "undefined",
} as const;

/**
 * Check if running in Node.js
 */
export function isNode(): boolean {
  return runtime === "node";
}

/**
 * Check if running in Deno
 */
export function isDeno(): boolean {
  return runtime === "deno";
}

/**
 * Check if running in Bun
 */
export function isBun(): boolean {
  return runtime === "bun";
}

/**
 * Check if running in Cloudflare Workers
 */
export function isCloudflare(): boolean {
  return runtime === "cloudflare";
}

/**
 * Check if running in any edge environment
 */
export function isEdge(): boolean {
  return runtimeInfo.isEdge;
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
  return runtime === "browser";
}

/**
 * Check if running on server (not browser)
 */
export function isServer(): boolean {
  return runtimeInfo.isServer;
}

/**
 * Get runtime version string
 */
export function getRuntimeVersion(): string {
  switch (runtime) {
    case "node":
      return `Node.js ${process?.versions?.node ?? "unknown"}`;
    case "bun":
      return `Bun ${(globalThis as any).Bun.version}`;
    case "deno":
      return `Deno ${(globalThis as any).Deno.version.deno}`;
    case "cloudflare":
      return "Cloudflare Workers";
    case "edge":
      return "Edge Runtime";
    case "browser":
      return typeof navigator !== "undefined" ? navigator.userAgent : "Browser";
    default:
      return "Unknown";
  }
}
