/**
 * @module
 * Multi-tenant validation schemas for SaaS applications.
 * Includes tenant entity, membership, and invitation types.
 *
 * @example
 * ```typescript
 * import { tenant, createTenantRequest, type Tenant } from '@parsrun/types';
 *
 * // Validate tenant creation
 * const result = createTenantRequest({ name: 'Acme Corp' });
 * ```
 */

import { type } from "arktype";
import { status, timestamp, uuid } from "./common";

// ============================================================================
// Tenant Schemas
// ============================================================================

/** Tenant entity */
export const tenant = type({
  id: uuid,
  name: "string >= 1",
  "slug?": "string",
  "description?": "string",
  status,
  "settings?": "object",
  "metadata?": "object",
  "logoUrl?": "string",
  "primaryColor?": "string",
  "timezone?": "string",
  "locale?": "string",
  "currency?": "string",
  insertedAt: timestamp,
  updatedAt: timestamp,
  "deletedAt?": timestamp,
});

/** Tenant creation request */
export const createTenantRequest = type({
  name: "string >= 1",
  "slug?": "string",
  "description?": "string",
  "settings?": "object",
  "logoUrl?": "string",
  "primaryColor?": "string",
  "timezone?": "string",
  "locale?": "string",
  "currency?": "string",
});

/** Tenant update request */
export const updateTenantRequest = type({
  "name?": "string >= 1",
  "slug?": "string",
  "description?": "string",
  "settings?": "object",
  "logoUrl?": "string",
  "primaryColor?": "string",
  "timezone?": "string",
  "locale?": "string",
  "currency?": "string",
  "status?": status,
});

/** Tenant invite request */
export const inviteTenantMemberRequest = type({
  email: "string.email",
  roleId: uuid,
  "accessLevel?": "'full' | 'limited' | 'read_only'",
  "expiresAt?": timestamp,
  "message?": "string",
});

/** Tenant member list query */
export const tenantMemberListQuery = type({
  "page?": "number >= 1",
  "limit?": "number >= 1",
  "status?": "'active' | 'inactive' | 'invited' | 'suspended'",
  "roleId?": uuid,
  "search?": "string",
});

/** Tenant switch request */
export const switchTenantRequest = type({
  tenantId: uuid,
});

// ============================================================================
// Type Exports
// ============================================================================

export type Tenant = typeof tenant.infer;
export type CreateTenantRequest = typeof createTenantRequest.infer;
export type UpdateTenantRequest = typeof updateTenantRequest.infer;
export type InviteTenantMemberRequest = typeof inviteTenantMemberRequest.infer;
export type TenantMemberListQuery = typeof tenantMemberListQuery.infer;
export type SwitchTenantRequest = typeof switchTenantRequest.infer;
