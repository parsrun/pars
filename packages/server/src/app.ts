/**
 * @parsrun/server - App Factory
 * Create and configure Hono server instances
 */

import { Hono } from "hono";
import { createLogger } from "@parsrun/core";
import type {
  ServerConfig,
  ServerContextVariables,
  HonoApp,
} from "./context.js";
import { generateRequestId } from "./context.js";

/**
 * Extended server options
 */
export interface CreateServerOptions extends ServerConfig {
  /** Enable request logging */
  logging?: boolean;
  /** Enable request ID generation */
  requestId?: boolean;
  /** Base path for all routes */
  basePath?: string;
  /** Strict mode - trailing slashes matter */
  strict?: boolean;
}

/**
 * Create a new Pars server instance
 *
 * @example
 * ```typescript
 * const app = createServer({
 *   database: db,
 *   cors: { origin: '*' },
 *   logging: true,
 * });
 *
 * app.get('/health', (c) => c.json({ status: 'ok' }));
 *
 * export default app;
 * ```
 */
export function createServer(options: CreateServerOptions): HonoApp {
  const app = new Hono<{ Variables: ServerContextVariables }>({
    strict: options.strict ?? false,
  });

  const logger = options.logger ?? createLogger({ name: "pars-server" });

  // Initialize context for all requests
  app.use("*", async (c, next) => {
    // Set core context variables
    c.set("db", options.database);
    c.set("config", options);
    c.set("logger", logger);
    c.set("enabledModules", new Set<string>());
    c.set("cookiePrefix", options.cookiePrefix);
    c.set("custom", options.custom ?? {});

    // Generate request ID if enabled
    if (options.requestId !== false) {
      const requestId = c.req.header("x-request-id") ?? generateRequestId();
      c.set("requestId", requestId);
      c.header("x-request-id", requestId);
    }

    await next();
  });

  return app;
}

/**
 * Create a router (sub-app) with shared context
 *
 * @example
 * ```typescript
 * const usersRouter = createRouter();
 *
 * usersRouter.get('/', async (c) => {
 *   const users = await getUsers(c.get('db'));
 *   return c.json(success(users));
 * });
 *
 * usersRouter.post('/', async (c) => {
 *   // ...
 * });
 *
 * app.route('/api/users', usersRouter);
 * ```
 */
export function createRouter(): HonoApp {
  return new Hono<{ Variables: ServerContextVariables }>();
}

/**
 * Create a versioned API router
 *
 * @example
 * ```typescript
 * const v1 = createVersionedRouter('v1');
 * v1.get('/users', handler);
 *
 * app.route('/api', v1); // Results in /api/v1/users
 * ```
 */
export function createVersionedRouter(version: string): HonoApp {
  const router = new Hono<{ Variables: ServerContextVariables }>();

  // Add version to all routes
  const versionedRouter = new Hono<{ Variables: ServerContextVariables }>();
  versionedRouter.route(`/${version}`, router);

  return versionedRouter;
}

/**
 * Create a module router with prefix
 *
 * @example
 * ```typescript
 * const inventoryModule = createModuleRouter('inventory', {
 *   routes: (router) => {
 *     router.get('/items', listItems);
 *     router.post('/items', createItem);
 *   },
 * });
 *
 * app.route('/api', inventoryModule);
 * ```
 */
export function createModuleRouter(
  moduleName: string,
  options: {
    routes: (router: HonoApp) => void;
    middleware?: Array<(c: import("hono").Context, next: () => Promise<void>) => Promise<Response | void>>;
  }
): HonoApp {
  const moduleRouter = new Hono<{ Variables: ServerContextVariables }>();

  // Apply module-specific middleware
  if (options.middleware) {
    for (const mw of options.middleware) {
      moduleRouter.use("*", mw);
    }
  }

  // Register routes
  options.routes(moduleRouter);

  // Wrap in module path
  const wrappedRouter = new Hono<{ Variables: ServerContextVariables }>();
  wrappedRouter.route(`/${moduleName}`, moduleRouter);

  return wrappedRouter;
}
