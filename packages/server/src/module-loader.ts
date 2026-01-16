/**
 * @parsrun/server - Module Loader
 * Dynamic module loading system for Pars server
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createLogger, type Logger } from "@parsrun/core";
import type {
  CorsConfig,
  DatabaseAdapter,
  HonoApp,
  ModuleManifest,
  ServerConfig,
  ServerContextVariables,
} from "./context.js";
import { generateRequestId } from "./context.js";

/**
 * Module Loader options
 */
export interface ModuleLoaderOptions {
  /** Server configuration */
  config: ServerConfig;
  /** Cookie prefix */
  cookiePrefix?: string;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Module Loader
 * Manages dynamic module registration and lifecycle
 *
 * @example
 * ```typescript
 * const loader = new ModuleLoader({
 *   config: {
 *     database: drizzleDb,
 *     cors: { origin: '*' },
 *   },
 * });
 *
 * await loader.initialize();
 *
 * // Register modules
 * loader.registerModule(itemsModule);
 * loader.registerModule(usersModule);
 *
 * // Enable modules
 * await loader.enableModule('items');
 * await loader.enableModule('users');
 *
 * // Get Hono app
 * export default loader.getApp();
 * ```
 */
export class ModuleLoader {
  private app: HonoApp;
  private db: DatabaseAdapter;
  private enabledModules: Set<string> = new Set();
  private moduleRegistry: Map<string, ModuleManifest> = new Map();
  private logger: Logger;
  private config: ServerConfig;
  private cookiePrefix: string | undefined;
  private initialized = false;

  constructor(options: ModuleLoaderOptions) {
    this.config = options.config;
    this.db = options.config.database;
    this.cookiePrefix = options.cookiePrefix;
    this.logger = options.logger ?? createLogger({ name: "ModuleLoader" });

    // Create Hono app with typed context
    this.app = new Hono<{ Variables: ServerContextVariables }>();

    this.setupMiddleware();
    this.setupCoreRoutes();
  }

  /**
   * Initialize the module loader
   * Checks database connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn("ModuleLoader already initialized");
      return;
    }

    this.logger.info("Initializing ModuleLoader...");

    // Check database connection
    try {
      if (this.db.ping) {
        const ok = await this.db.ping();
        if (!ok) throw new Error("Database ping returned false");
      } else {
        await this.db.execute("SELECT 1");
      }
      this.logger.info("Database connection: OK");
    } catch (error) {
      this.logger.error("Database connection failed", error);
      throw new Error("Database connection failed");
    }

    this.initialized = true;
    this.logger.info("ModuleLoader initialized successfully");
  }

  /**
   * Setup core middleware
   */
  private setupMiddleware(): void {
    // Request ID and logging
    this.app.use("*", async (c, next) => {
      const requestId = generateRequestId();
      const requestLogger = this.logger.child({ requestId });

      // Set context variables
      c.set("db", this.db);
      c.set("config", this.config);
      c.set("enabledModules", this.enabledModules);
      c.set("logger", requestLogger);
      c.set("requestId", requestId);
      c.set("cookiePrefix", this.cookiePrefix);
      c.set("custom", this.config.custom ?? {});
      c.set("user", undefined);
      c.set("tenant", undefined);

      const start = Date.now();

      await next();

      const duration = Date.now() - start;
      requestLogger.debug("Request completed", {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: duration,
      });
    });

    // CORS
    if (this.config.cors) {
      this.app.use("*", cors(this.normalizeCorsConfig(this.config.cors)));
    }
  }

  /**
   * Normalize CORS config for Hono
   */
  private normalizeCorsConfig(config: CorsConfig): Parameters<typeof cors>[0] {
    const result: Parameters<typeof cors>[0] = {
      origin: typeof config.origin === "function"
        ? (origin) => (config.origin as (origin: string) => boolean)(origin) ? origin : null
        : config.origin,
    };

    if (config.credentials !== undefined) {
      result.credentials = config.credentials;
    }
    if (config.methods !== undefined) {
      result.allowMethods = config.methods;
    }
    if (config.allowedHeaders !== undefined) {
      result.allowHeaders = config.allowedHeaders;
    }
    if (config.exposedHeaders !== undefined) {
      result.exposeHeaders = config.exposedHeaders;
    }
    if (config.maxAge !== undefined) {
      result.maxAge = config.maxAge;
    }

    return result;
  }

  /**
   * Setup core routes
   */
  private setupCoreRoutes(): void {
    const basePath = this.config.basePath ?? "/api/v1";

    // Health check
    this.app.get("/health", (c) => {
      return c.json({
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    });

    // Health check with details
    this.app.get("/health/details", async (c) => {
      let dbStatus = "unknown";
      try {
        if (this.db.ping) {
          dbStatus = (await this.db.ping()) ? "ok" : "error";
        } else {
          await this.db.execute("SELECT 1");
          dbStatus = "ok";
        }
      } catch {
        dbStatus = "error";
      }

      return c.json({
        status: dbStatus === "ok" ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        services: {
          database: dbStatus,
        },
        modules: {
          enabled: Array.from(this.enabledModules),
          registered: Array.from(this.moduleRegistry.keys()),
        },
      });
    });

    // API info
    this.app.get(basePath, (c) => {
      const endpoints: Record<string, string> = {
        health: "/health",
        features: `${basePath}/features`,
      };

      // Add module endpoints
      for (const moduleName of this.enabledModules) {
        endpoints[moduleName] = `${basePath}/${moduleName}`;
      }

      return c.json({
        name: "Pars API",
        version: "1.0.0",
        endpoints,
      });
    });

    // Feature discovery
    this.app.get(`${basePath}/features`, (c) => {
      const features = Array.from(this.enabledModules).map((name) => {
        const module = this.moduleRegistry.get(name);
        return {
          name,
          version: module?.version ?? "1.0.0",
          description: module?.description ?? "",
          permissions: module?.permissions ?? {},
        };
      });

      return c.json({
        enabled: Array.from(this.enabledModules),
        features,
      });
    });
  }

  /**
   * Register a module
   */
  registerModule(manifest: ModuleManifest): void {
    if (this.moduleRegistry.has(manifest.name)) {
      this.logger.warn(`Module already registered: ${manifest.name}`);
      return;
    }

    this.moduleRegistry.set(manifest.name, manifest);
    this.logger.info(`Registered module: ${manifest.name}`);
  }

  /**
   * Enable a registered module
   */
  async enableModule(moduleName: string): Promise<boolean> {
    const module = this.moduleRegistry.get(moduleName);

    if (!module) {
      this.logger.error(`Module not found: ${moduleName}`);
      return false;
    }

    if (this.enabledModules.has(moduleName)) {
      this.logger.warn(`Module already enabled: ${moduleName}`);
      return true;
    }

    // Check dependencies
    if (module.dependencies) {
      for (const dep of module.dependencies) {
        if (!this.enabledModules.has(dep)) {
          this.logger.error(
            `Module ${moduleName} requires ${dep} to be enabled first`
          );
          return false;
        }
      }
    }

    try {
      this.logger.info(`Enabling module: ${moduleName}`);

      // Run onEnable hook
      if (module.onEnable) {
        await module.onEnable();
      }

      // Register routes
      module.registerRoutes(this.app);

      // Mark as enabled
      this.enabledModules.add(moduleName);

      this.logger.info(`Enabled module: ${moduleName}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to enable module ${moduleName}`, error);
      return false;
    }
  }

  /**
   * Disable an enabled module
   */
  async disableModule(moduleName: string): Promise<boolean> {
    if (!this.enabledModules.has(moduleName)) {
      this.logger.warn(`Module not enabled: ${moduleName}`);
      return true;
    }

    const module = this.moduleRegistry.get(moduleName);
    if (!module) {
      this.logger.error(`Module not found: ${moduleName}`);
      return false;
    }

    // Check if other modules depend on this one
    for (const [name, m] of this.moduleRegistry) {
      if (this.enabledModules.has(name) && m.dependencies?.includes(moduleName)) {
        this.logger.error(
          `Cannot disable ${moduleName}: ${name} depends on it`
        );
        return false;
      }
    }

    try {
      // Run onDisable hook
      if (module.onDisable) {
        await module.onDisable();
      }

      // Note: Routes cannot be easily unregistered in Hono
      // The module will remain registered but marked as disabled
      this.enabledModules.delete(moduleName);

      this.logger.info(`Disabled module: ${moduleName}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to disable module ${moduleName}`, error);
      return false;
    }
  }

  /**
   * Get the Hono app instance
   */
  getApp(): HonoApp {
    return this.app;
  }

  /**
   * Get enabled modules
   */
  getEnabledModules(): string[] {
    return Array.from(this.enabledModules);
  }

  /**
   * Get registered modules
   */
  getRegisteredModules(): string[] {
    return Array.from(this.moduleRegistry.keys());
  }

  /**
   * Check if module is enabled
   */
  isModuleEnabled(moduleName: string): boolean {
    return this.enabledModules.has(moduleName);
  }

  /**
   * Check if module is registered
   */
  isModuleRegistered(moduleName: string): boolean {
    return this.moduleRegistry.has(moduleName);
  }

  /**
   * Get database adapter
   */
  getDatabase(): DatabaseAdapter {
    return this.db;
  }

  /**
   * Get logger
   */
  getLogger(): Logger {
    return this.logger;
  }
}

/**
 * Create a module loader
 */
export function createModuleLoader(options: ModuleLoaderOptions): ModuleLoader {
  return new ModuleLoader(options);
}

/**
 * Create a module manifest helper
 */
export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest;
}
