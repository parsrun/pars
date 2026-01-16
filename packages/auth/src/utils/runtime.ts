/**
 * Runtime detection utilities for multi-runtime support
 * Supports: Node.js, Deno, Cloudflare Workers, Bun
 */

export type Runtime = 'node' | 'deno' | 'cloudflare' | 'bun' | 'unknown';

/**
 * Detect the current JavaScript runtime environment
 */
export function detectRuntime(): Runtime {
  // Cloudflare Workers
  if (
    typeof globalThis !== 'undefined' &&
    // @ts-expect-error - Cloudflare specific global
    typeof globalThis.caches !== 'undefined' &&
    // @ts-expect-error - Cloudflare specific
    typeof globalThis.WebSocketPair !== 'undefined'
  ) {
    return 'cloudflare';
  }

  // Deno
  // @ts-expect-error - Deno specific global
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }

  // Bun
  // @ts-expect-error - Bun specific global
  if (typeof Bun !== 'undefined') {
    return 'bun';
  }

  // Node.js
  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node
  ) {
    return 'node';
  }

  return 'unknown';
}

/**
 * Check if running in a specific runtime
 */
export function isRuntime(runtime: Runtime): boolean {
  return detectRuntime() === runtime;
}

/**
 * Check if running in Node.js
 */
export function isNode(): boolean {
  return isRuntime('node');
}

/**
 * Check if running in Deno
 */
export function isDeno(): boolean {
  return isRuntime('deno');
}

/**
 * Check if running in Cloudflare Workers
 */
export function isCloudflare(): boolean {
  return isRuntime('cloudflare');
}

/**
 * Check if running in Bun
 */
export function isBun(): boolean {
  return isRuntime('bun');
}

/**
 * Check if running in an edge runtime (CF Workers, Deno Deploy, etc.)
 */
export function isEdge(): boolean {
  const runtime = detectRuntime();
  return runtime === 'cloudflare' || runtime === 'deno';
}

/**
 * Get environment variable across runtimes
 */
export function getEnv(key: string): string | undefined {
  const runtime = detectRuntime();

  switch (runtime) {
    case 'deno':
      // @ts-expect-error - Deno specific
      return Deno.env.get(key);
    case 'node':
    case 'bun':
      return process.env[key];
    case 'cloudflare':
      // In CF Workers, env is passed to the handler
      // This is a fallback for global env
      return undefined;
    default:
      return undefined;
  }
}
