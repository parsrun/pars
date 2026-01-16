/**
 * @parsrun/types
 * Core types and validation schemas for Pars framework
 *
 * Uses ArkType for runtime validation + type inference
 *
 * @example
 * ```typescript
 * import { user, User, validateWithSchema } from '@parsrun/types';
 *
 * // Runtime validation
 * const result = user(data);
 * if (result instanceof type.errors) {
 *   console.error(result.summary);
 * }
 *
 * // Type inference
 * const userData: User = result;
 * ```
 */

// Re-export ArkType for convenience
export { type } from "arktype";
export type { Type } from "arktype";

// ============================================================================
// Common Schemas & Types
// ============================================================================
export * from "./common";

// ============================================================================
// Auth Schemas & Types
// ============================================================================
export * from "./auth";

// ============================================================================
// Tenant Schemas & Types
// ============================================================================
export * from "./tenant";

// ============================================================================
// Email Schemas & Types
// ============================================================================
export * from "./email";

// ============================================================================
// Storage Schemas & Types
// ============================================================================
export * from "./storage";

// ============================================================================
// Queue Schemas & Types
// ============================================================================
export * from "./queue";

// ============================================================================
// Cache Schemas & Types
// ============================================================================
export * from "./cache";

// ============================================================================
// Payments Schemas & Types
// ============================================================================
export * from "./payments";

// ============================================================================
// Server Schemas & Types
// ============================================================================
export * from "./server";

// ============================================================================
// Validation Helpers
// ============================================================================

import { type, type Type } from "arktype";

/**
 * Validate data against an ArkType schema
 * Returns the validated data or throws an error
 *
 * @example
 * ```typescript
 * const userData = validateWithSchema(user, input);
 * ```
 */
export function validateWithSchema<T extends Type>(
  schema: T,
  data: unknown
): T["infer"] {
  const result = schema(data);

  if (result instanceof type.errors) {
    const errors = result.map((e) => `${String(e.path)}: ${e.message}`).join("\n");
    throw new Error(`Validation failed:\n${errors}`);
  }

  return result;
}

/**
 * Safely validate data against an ArkType schema
 * Returns a result object with success/error
 *
 * @example
 * ```typescript
 * const result = safeValidate(user, input);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.errors);
 * }
 * ```
 */
export function safeValidate<T extends Type>(
  schema: T,
  data: unknown
): { success: true; data: T["infer"] } | { success: false; errors: string[] } {
  const result = schema(data);

  if (result instanceof type.errors) {
    return {
      success: false,
      errors: result.map((e) => `${String(e.path)}: ${e.message}`),
    };
  }

  return {
    success: true,
    data: result,
  };
}

/**
 * Check if data matches an ArkType schema (type guard)
 *
 * @example
 * ```typescript
 * if (isValid(user, input)) {
 *   // input is typed as User
 * }
 * ```
 */
export function isValid<T extends Type>(
  schema: T,
  data: unknown
): data is T["infer"] {
  const result = schema(data);
  return !(result instanceof type.errors);
}

/**
 * Format ArkType errors to a user-friendly object
 *
 * @example
 * ```typescript
 * const result = user(input);
 * if (result instanceof type.errors) {
 *   const formatted = formatErrors(result);
 *   // { email: "must be a valid email", ... }
 * }
 * ```
 */
export function formatErrors(
  errors: type.errors
): Record<string, string> {
  const formatted: Record<string, string> = {};

  for (const error of errors) {
    const path = String(error.path) || "root";
    formatted[path] = error.message;
  }

  return formatted;
}
