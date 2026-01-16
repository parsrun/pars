/**
 * @parsrun/service - Configuration
 * Default configuration and config utilities
 */

import type {
  ServiceConfig,
  EventFormatConfig,
  SerializationConfig,
  TracingConfig,
  VersioningConfig,
  ResilienceConfig,
  DeadLetterConfig,
} from "./types.js";

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Default event format configuration.
 * Uses CloudEvents format with compact internal communication.
 */
export const DEFAULT_EVENT_CONFIG: Required<EventFormatConfig> = {
  format: "cloudevents",
  internalCompact: true,
};

/**
 * Default serialization configuration.
 * Uses JSON format for data encoding.
 */
export const DEFAULT_SERIALIZATION_CONFIG: Required<SerializationConfig> = {
  format: "json",
};

/**
 * Default tracing configuration.
 * Enables tracing with 10% sampling ratio and console exporter.
 */
export const DEFAULT_TRACING_CONFIG: Required<TracingConfig> = {
  enabled: true,
  sampler: { ratio: 0.1 },
  exporter: "console",
  endpoint: "",
  serviceName: "pars-service",
};

/**
 * Default versioning configuration.
 * Uses header-based versioning with "1.x" as the default version.
 */
export const DEFAULT_VERSIONING_CONFIG: Required<VersioningConfig> = {
  strategy: "header",
  defaultVersion: "1.x",
};

/**
 * Default resilience configuration.
 * Configures circuit breaker, bulkhead, timeout, and retry settings.
 */
export const DEFAULT_RESILIENCE_CONFIG: Required<ResilienceConfig> = {
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 30_000,
    successThreshold: 2,
  },
  bulkhead: {
    maxConcurrent: 100,
    maxQueue: 50,
  },
  timeout: 5_000,
  retry: {
    attempts: 3,
    backoff: "exponential",
    initialDelay: 100,
    maxDelay: 10_000,
  },
};

/**
 * Default dead letter queue configuration.
 * Enables DLQ with 30-day retention and alerting at 10 messages.
 */
export const DEFAULT_DEAD_LETTER_CONFIG: Required<DeadLetterConfig> = {
  enabled: true,
  retention: "30d",
  onFail: "alert",
  alertThreshold: 10,
};

/**
 * Default complete service configuration.
 * Combines all default sub-configurations.
 */
export const DEFAULT_SERVICE_CONFIG: Required<ServiceConfig> = {
  events: DEFAULT_EVENT_CONFIG,
  serialization: DEFAULT_SERIALIZATION_CONFIG,
  tracing: DEFAULT_TRACING_CONFIG,
  versioning: DEFAULT_VERSIONING_CONFIG,
  resilience: DEFAULT_RESILIENCE_CONFIG,
  deadLetter: DEFAULT_DEAD_LETTER_CONFIG,
};

// ============================================================================
// CONFIG UTILITIES
// ============================================================================

/**
 * Merge user config with defaults.
 * Deep merges the user configuration with default values.
 *
 * @param userConfig - Optional partial service configuration
 * @returns Complete service configuration with all required fields
 */
export function mergeConfig(userConfig?: Partial<ServiceConfig>): Required<ServiceConfig> {
  if (!userConfig) {
    return { ...DEFAULT_SERVICE_CONFIG };
  }

  return {
    events: {
      ...DEFAULT_EVENT_CONFIG,
      ...userConfig.events,
    },
    serialization: {
      ...DEFAULT_SERIALIZATION_CONFIG,
      ...userConfig.serialization,
    },
    tracing: {
      ...DEFAULT_TRACING_CONFIG,
      ...userConfig.tracing,
    },
    versioning: {
      ...DEFAULT_VERSIONING_CONFIG,
      ...userConfig.versioning,
    },
    resilience: {
      ...DEFAULT_RESILIENCE_CONFIG,
      ...userConfig.resilience,
      circuitBreaker: {
        ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
        ...userConfig.resilience?.circuitBreaker,
      },
      bulkhead: {
        ...DEFAULT_RESILIENCE_CONFIG.bulkhead,
        ...userConfig.resilience?.bulkhead,
      },
      retry: {
        ...DEFAULT_RESILIENCE_CONFIG.retry,
        ...userConfig.resilience?.retry,
      },
    },
    deadLetter: {
      ...DEFAULT_DEAD_LETTER_CONFIG,
      ...userConfig.deadLetter,
    },
  };
}

/**
 * Create configuration optimized for development.
 * Enables full tracing, disables circuit breaker, and uses longer timeouts.
 *
 * @param overrides - Optional configuration overrides
 * @returns Complete service configuration for development
 */
export function createDevConfig(overrides?: Partial<ServiceConfig>): Required<ServiceConfig> {
  return mergeConfig({
    tracing: {
      enabled: true,
      sampler: "always",
      exporter: "console",
    },
    resilience: {
      circuitBreaker: { enabled: false },
      timeout: 30_000,
    },
    ...overrides,
  });
}

/**
 * Create configuration optimized for production.
 * Uses 10% sampling ratio, OTLP exporter, and enables circuit breaker.
 *
 * @param overrides - Optional configuration overrides
 * @returns Complete service configuration for production
 */
export function createProdConfig(overrides?: Partial<ServiceConfig>): Required<ServiceConfig> {
  return mergeConfig({
    tracing: {
      enabled: true,
      sampler: { ratio: 0.1 },
      exporter: "otlp",
    },
    resilience: {
      circuitBreaker: { enabled: true },
      timeout: 5_000,
    },
    ...overrides,
  });
}

/**
 * Validate service configuration.
 * Checks for valid ranges and values in the configuration.
 *
 * @param config - Service configuration to validate
 * @returns Object containing validation result and any error messages
 */
export function validateConfig(config: ServiceConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate tracing
  if (config.tracing?.sampler && typeof config.tracing.sampler === "object") {
    const ratio = config.tracing.sampler.ratio;
    if (ratio < 0 || ratio > 1) {
      errors.push("tracing.sampler.ratio must be between 0 and 1");
    }
  }

  // Validate resilience
  if (config.resilience?.timeout !== undefined && config.resilience.timeout < 0) {
    errors.push("resilience.timeout must be non-negative");
  }

  if (config.resilience?.circuitBreaker?.failureThreshold !== undefined) {
    if (config.resilience.circuitBreaker.failureThreshold < 1) {
      errors.push("resilience.circuitBreaker.failureThreshold must be at least 1");
    }
  }

  if (config.resilience?.bulkhead?.maxConcurrent !== undefined) {
    if (config.resilience.bulkhead.maxConcurrent < 1) {
      errors.push("resilience.bulkhead.maxConcurrent must be at least 1");
    }
  }

  if (config.resilience?.retry?.attempts !== undefined) {
    if (config.resilience.retry.attempts < 0) {
      errors.push("resilience.retry.attempts must be non-negative");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
