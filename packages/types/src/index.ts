/**
 * @module
 * Core types and validation schemas for the Pars framework.
 * Uses ArkType for runtime validation with automatic TypeScript type inference.
 *
 * @example
 * ```typescript
 * import { user, validateWithSchema, safeValidate, type User } from '@parsrun/types';
 *
 * // Runtime validation (throws on error)
 * const userData = validateWithSchema(user, input);
 *
 * // Safe validation (returns result object)
 * const result = safeValidate(user, input);
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.errors);
 * }
 *
 * // Type guard
 * if (isValid(user, input)) {
 *   // input is typed as User
 * }
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
 * Validate data against an ArkType schema.
 * Returns the validated data or throws an error.
 *
 * @param schema - The ArkType schema to validate against
 * @param data - The data to validate
 * @returns The validated and typed data
 * @throws Error if validation fails
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
 * Safely validate data against an ArkType schema.
 * Returns a result object instead of throwing.
 *
 * @param schema - The ArkType schema to validate against
 * @param data - The data to validate
 * @returns Object with success status and either data or errors
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
 * Check if data matches an ArkType schema (type guard).
 *
 * @param schema - The ArkType schema to validate against
 * @param data - The data to check
 * @returns True if data matches schema, with TypeScript type narrowing
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
 * Format ArkType errors to a user-friendly object.
 *
 * @param errors - The ArkType errors to format
 * @returns Object mapping field paths to error messages
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
