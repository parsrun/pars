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

export const DEFAULT_EVENT_CONFIG: Required<EventFormatConfig> = {
  format: "cloudevents",
  internalCompact: true,
};

export const DEFAULT_SERIALIZATION_CONFIG: Required<SerializationConfig> = {
  format: "json",
};

export const DEFAULT_TRACING_CONFIG: Required<TracingConfig> = {
  enabled: true,
  sampler: { ratio: 0.1 },
  exporter: "console",
  endpoint: "",
  serviceName: "pars-service",
};

export const DEFAULT_VERSIONING_CONFIG: Required<VersioningConfig> = {
  strategy: "header",
  defaultVersion: "1.x",
};

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

export const DEFAULT_DEAD_LETTER_CONFIG: Required<DeadLetterConfig> = {
  enabled: true,
  retention: "30d",
  onFail: "alert",
  alertThreshold: 10,
};

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
 * Merge user config with defaults
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
 * Create config for development
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
 * Create config for production
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
 * Validate config
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
