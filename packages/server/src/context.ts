/**
 * @parsrun/server - Server Context
 * Type definitions for server context and configuration
 */

import type { Logger } from "@parsrun/core";

/**
 * Database adapter interface
 * Implement this for your database (Drizzle, Prisma, etc.)
 */
export interface DatabaseAdapter {
  /** Execute raw SQL query */
  execute(sql: string): Promise<unknown>;
  /** Check connection */
  ping?(): Promise<boolean>;
}

/**
 * Module manifest for registering modules
 */
export interface ModuleManifest {
  /** Unique module name */
  name: string;
  /** Module version */
  version: string;
  /** Module description */
  description: string;
  /** Required permissions for this module */
  permissions: Record<string, string[]>;
  /** Module dependencies (other module names) */
  dependencies?: string[];
  /** Register routes for this module */
  registerRoutes: (app: HonoApp) => void;
  /** Called when module is enabled */
  onEnable?: () => Promise<void>;
  /** Called when module is disabled */
  onDisable?: () => Promise<void>;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Database adapter */
  database: DatabaseAdapter;
  /** CORS configuration */
  cors?: CorsConfig;
  /** Base path for API */
  basePath?: string;
  /** Cookie prefix for all cookies */
  cookiePrefix?: string;
  /** Logger instance */
  logger?: Logger;
  /** Custom context data */
  custom?: Record<string, unknown>;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  /** Allowed origins */
  origin: string | string[] | ((origin: string) => boolean);
  /** Allow credentials */
  credentials?: boolean;
  /** Allowed methods */
  methods?: string[];
  /** Allowed headers */
  allowedHeaders?: string[];
  /** Exposed headers */
  exposedHeaders?: string[];
  /** Max age in seconds */
  maxAge?: number;
}

/**
 * User information in context
 */
export interface ContextUser {
  id: string;
  email: string | undefined;
  tenantId: string | undefined;
  role: string | undefined;
  permissions: string[];
}

/**
 * Tenant information in context
 */
export interface ContextTenant {
  id: string;
  slug: string | undefined;
  name: string | undefined;
  status: string;
}

/**
 * Server context variables
 * Available in Hono context via c.get()
 */
export interface ServerContextVariables {
  /** Database adapter */
  db: DatabaseAdapter;
  /** Server configuration */
  config: ServerConfig;
  /** Enabled modules set */
  enabledModules: Set<string>;
  /** Current user (if authenticated) */
  user: ContextUser | undefined;
  /** Current tenant (if resolved) */
  tenant: ContextTenant | undefined;
  /** Request logger */
  logger: Logger;
  /** Request ID */
  requestId: string;
  /** Cookie prefix */
  cookiePrefix: string | undefined;
  /** Custom context data */
  custom: Record<string, unknown>;
}

/**
 * Hono app type with server context
 */
export type HonoApp = import("hono").Hono<{ Variables: ServerContextVariables }>;

/**
 * Hono context type with server context
 */
export type HonoContext = import("hono").Context<{ Variables: ServerContextVariables }>;

/**
 * Middleware next function
 */
export type HonoNext = () => Promise<void>;

/**
 * Middleware function type
 */
export type Middleware = (c: HonoContext, next: HonoNext) => Promise<Response | void>;

/**
 * Route handler function type
 */
export type RouteHandler = (c: HonoContext) => Promise<Response> | Response;

/**
 * Permission check input
 */
export interface PermissionCheck {
  /** Resource name (e.g., "users", "items") */
  resource: string;
  /** Action name (e.g., "read", "create", "update", "delete") */
  action: string;
  /** Permission scope */
  scope?: "tenant" | "global" | "own";
}

/**
 * Permission definition
 */
export interface PermissionDefinition {
  /** Permission name (e.g., "users:read") */
  name: string;
  /** Resource part */
  resource: string;
  /** Action part */
  action: string;
  /** Description */
  description?: string;
  /** Scope */
  scope?: "tenant" | "global" | "own";
}

/**
 * Role definition
 */
export interface RoleDefinition {
  /** Role name */
  name: string;
  /** Display name */
  displayName?: string;
  /** Description */
  description?: string;
  /** Permissions assigned to this role */
  permissions: string[];
  /** Is this a system role */
  isSystem?: boolean;
}

/**
 * Standard API response structure
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown> | undefined;
  };
  meta?: {
    page?: number | undefined;
    limit?: number | undefined;
    total?: number | undefined;
    requestId?: string | undefined;
  } | undefined;
}

/**
 * Create a success response
 */
export function success<T>(data: T, meta?: ApiResponse["meta"]): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: meta ?? undefined,
  };
}

/**
 * Create an error response
 */
export function error(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiResponse<never> {
  return {
    success: false,
    error: { code, message, details: details ?? undefined },
  };
}

/**
 * Generate a request ID
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
