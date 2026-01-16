/**
 * @parsrun/service - Service Definition
 * Factory function for defining services
 */

import type {
  ServiceDefinition,
  QueryDefinition,
  MutationDefinition,
  EventDefinition,
} from "./types.js";

// ============================================================================
// SERVICE DEFINITION FACTORY
// ============================================================================

/**
 * Define a service with type-safe queries, mutations, and events
 *
 * @example
 * ```typescript
 * const paymentsService = defineService({
 *   name: 'payments',
 *   version: '1.0.0',
 *
 *   queries: {
 *     getSubscription: {
 *       input: { subscriptionId: 'string' },
 *       output: { status: 'string', plan: 'string' },
 *     },
 *   },
 *
 *   mutations: {
 *     subscribe: {
 *       input: { email: 'string', planId: 'string' },
 *       output: { checkoutUrl: 'string' },
 *     },
 *   },
 *
 *   events: {
 *     emits: {
 *       'subscription.created': {
 *         data: { customerId: 'string', planId: 'string' },
 *         delivery: 'at-least-once',
 *       },
 *     },
 *     handles: ['user.deleted', 'tenant.suspended'],
 *   },
 * });
 * ```
 */
export function defineService<
  TQueries extends Record<string, QueryDefinition> = Record<string, QueryDefinition>,
  TMutations extends Record<string, MutationDefinition> = Record<string, MutationDefinition>,
  TEmits extends Record<string, EventDefinition> = Record<string, EventDefinition>,
  THandles extends string[] = string[],
>(
  definition: ServiceDefinition<TQueries, TMutations, TEmits, THandles>
): ServiceDefinition<TQueries, TMutations, TEmits, THandles> {
  // Validate service definition
  validateServiceDefinition(definition);

  // Freeze the definition to prevent mutation
  return Object.freeze({
    ...definition,
    queries: definition.queries ? Object.freeze({ ...definition.queries }) : undefined,
    mutations: definition.mutations ? Object.freeze({ ...definition.mutations }) : undefined,
    events: definition.events
      ? Object.freeze({
          emits: definition.events.emits
            ? Object.freeze({ ...definition.events.emits })
            : undefined,
          handles: definition.events.handles
            ? Object.freeze([...definition.events.handles])
            : undefined,
        })
      : undefined,
  }) as ServiceDefinition<TQueries, TMutations, TEmits, THandles>;
}

/**
 * Validate service definition
 */
function validateServiceDefinition(definition: ServiceDefinition): void {
  if (!definition.name) {
    throw new Error("Service name is required");
  }

  if (!definition.version) {
    throw new Error("Service version is required");
  }

  // Validate version format (semver-like)
  const versionRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
  if (!versionRegex.test(definition.version)) {
    throw new Error(`Invalid version format: ${definition.version}. Expected semver (e.g., 1.0.0)`);
  }

  // Validate query/mutation names (no dots or special chars)
  const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;

  if (definition.queries) {
    for (const name of Object.keys(definition.queries)) {
      if (!nameRegex.test(name)) {
        throw new Error(
          `Invalid query name: ${name}. Must start with letter and contain only alphanumeric and underscore`
        );
      }
    }
  }

  if (definition.mutations) {
    for (const name of Object.keys(definition.mutations)) {
      if (!nameRegex.test(name)) {
        throw new Error(
          `Invalid mutation name: ${name}. Must start with letter and contain only alphanumeric and underscore`
        );
      }
    }
  }

  // Validate event names (dot notation allowed)
  const eventNameRegex = /^[a-zA-Z][a-zA-Z0-9_.]*$/;

  if (definition.events?.emits) {
    for (const name of Object.keys(definition.events.emits)) {
      if (!eventNameRegex.test(name)) {
        throw new Error(
          `Invalid event name: ${name}. Must start with letter and contain only alphanumeric, underscore, and dot`
        );
      }
    }
  }

  if (definition.events?.handles) {
    for (const name of definition.events.handles) {
      if (!eventNameRegex.test(name)) {
        throw new Error(
          `Invalid handled event name: ${name}. Must start with letter and contain only alphanumeric, underscore, and dot`
        );
      }
    }
  }
}

// ============================================================================
// SERVICE DEFINITION UTILITIES
// ============================================================================

/**
 * Get all method names from a service definition.
 *
 * @param definition - The service definition
 * @returns Object containing arrays of query and mutation names
 */
export function getServiceMethods(definition: ServiceDefinition): {
  queries: string[];
  mutations: string[];
} {
  return {
    queries: definition.queries ? Object.keys(definition.queries) : [],
    mutations: definition.mutations ? Object.keys(definition.mutations) : [],
  };
}

/**
 * Get all event types from a service definition.
 *
 * @param definition - The service definition
 * @returns Object containing arrays of emitted and handled event types
 */
export function getServiceEvents(definition: ServiceDefinition): {
  emits: string[];
  handles: string[];
} {
  return {
    emits: definition.events?.emits ? Object.keys(definition.events.emits) : [],
    handles: definition.events?.handles ?? [],
  };
}

/**
 * Check if a service version satisfies a version requirement.
 * Supports wildcards (x or *) in version requirements.
 *
 * @param version - The actual version to check
 * @param requirement - The version requirement with optional wildcards
 * @returns True if the version satisfies the requirement
 *
 * @example
 * ```typescript
 * satisfiesVersion('1.2.3', '1.x')   // true
 * satisfiesVersion('1.2.3', '1.2.x') // true
 * satisfiesVersion('2.0.0', '1.x')   // false
 * ```
 */
export function satisfiesVersion(version: string, requirement: string): boolean {
  const versionParts = version.split(".").map((p) => parseInt(p, 10));
  const requirementParts = requirement.split(".");

  for (let i = 0; i < requirementParts.length; i++) {
    const req = requirementParts[i];
    if (req === "x" || req === "*") {
      continue;
    }

    const reqNum = parseInt(req ?? "0", 10);
    const verNum = versionParts[i] ?? 0;

    if (verNum !== reqNum) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a method is deprecated in the service definition.
 *
 * @param definition - The service definition
 * @param methodName - Name of the method to check
 * @param type - Type of method ("query" or "mutation")
 * @returns Object with deprecation status and optional metadata
 */
export function isMethodDeprecated(
  definition: ServiceDefinition,
  methodName: string,
  type: "query" | "mutation"
): { deprecated: boolean; since?: string; replacement?: string } {
  const methods = type === "query" ? definition.queries : definition.mutations;
  const method = methods?.[methodName];

  if (!method?.deprecated) {
    return { deprecated: false };
  }

  const result: { deprecated: boolean; since?: string; replacement?: string } = {
    deprecated: true,
    since: method.deprecated,
  };

  if (method.replacement) {
    result.replacement = method.replacement;
  }

  return result;
}

/**
 * Get method timeout from the service definition.
 * Uses method-specific timeout if defined, otherwise falls back to default.
 *
 * @param definition - The service definition
 * @param methodName - Name of the method
 * @param type - Type of method ("query" or "mutation")
 * @param defaultTimeout - Default timeout to use if not specified
 * @returns Timeout value in milliseconds
 */
export function getMethodTimeout(
  definition: ServiceDefinition,
  methodName: string,
  type: "query" | "mutation",
  defaultTimeout: number
): number {
  const methods = type === "query" ? definition.queries : definition.mutations;
  const method = methods?.[methodName];

  return method?.timeout ?? defaultTimeout;
}
