/**
 * @parsrun/payments - Provider Strategy
 * Region-based provider routing and selection
 */

import type { PaymentProvider, PaymentProviderType } from "../types.js";
import type {
  BillingRegion,
  ProviderStrategyConfig,
  ProviderRoutingRule,
  RegionDetectionContext,
  RegionDetector,
  ProviderSelection,
  BillingLogger,
} from "./types.js";
import { BillingError } from "./types.js";

/**
 * Default region detector
 * Uses countryCode from context, maps to region
 */
const defaultRegionDetector: RegionDetector = (context) => {
  if (!context.countryCode) {
    return "GLOBAL";
  }

  const countryToRegion: Record<string, BillingRegion> = {
    // Turkey
    TR: "TR",
    // EU countries
    DE: "EU", FR: "EU", IT: "EU", ES: "EU", NL: "EU", BE: "EU",
    AT: "EU", PT: "EU", GR: "EU", PL: "EU", CZ: "EU", RO: "EU",
    HU: "EU", SE: "EU", DK: "EU", FI: "EU", IE: "EU", SK: "EU",
    BG: "EU", HR: "EU", LT: "EU", LV: "EU", SI: "EU", EE: "EU",
    CY: "EU", LU: "EU", MT: "EU",
    // UK
    GB: "UK", UK: "UK",
    // US
    US: "US",
    // APAC
    JP: "APAC", CN: "APAC", KR: "APAC", AU: "APAC", NZ: "APAC",
    SG: "APAC", HK: "APAC", TW: "APAC", IN: "APAC", ID: "APAC",
    MY: "APAC", TH: "APAC", PH: "APAC", VN: "APAC",
    // LATAM
    BR: "LATAM", MX: "LATAM", AR: "LATAM", CL: "LATAM", CO: "LATAM",
    PE: "LATAM", VE: "LATAM", EC: "LATAM", UY: "LATAM", PY: "LATAM",
  };

  return countryToRegion[context.countryCode.toUpperCase()] ?? "GLOBAL";
};

/**
 * Provider Strategy
 * Handles region-based provider routing and selection
 */
export class ProviderStrategy {
  private readonly defaultProvider: PaymentProvider;
  private readonly regionProviders: Map<BillingRegion, PaymentProvider>;
  private readonly rules: ProviderRoutingRule[];
  private readonly regionDetector: RegionDetector;
  private readonly logger: BillingLogger | undefined;

  constructor(config: ProviderStrategyConfig, logger?: BillingLogger) {
    this.defaultProvider = config.default;
    this.regionProviders = new Map();
    this.rules = config.rules ?? [];
    this.regionDetector = config.regionDetector ?? defaultRegionDetector;
    this.logger = logger ?? undefined;

    // Build region provider map
    if (config.regions) {
      for (const [region, provider] of Object.entries(config.regions)) {
        this.regionProviders.set(region as BillingRegion, provider);
      }
    }

    // Sort rules by priority
    this.rules.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  /**
   * Select provider for given context
   */
  async selectProvider(
    context: RegionDetectionContext,
    forceProvider?: PaymentProviderType
  ): Promise<ProviderSelection> {
    // Forced provider
    if (forceProvider) {
      const provider = this.findProviderByType(forceProvider);
      if (provider) {
        this.logger?.debug("Provider forced", { provider: forceProvider });
        return {
          provider,
          type: forceProvider,
          region: await this.detectRegion(context),
          reason: "forced",
        };
      }
      throw new BillingError(
        `Forced provider "${forceProvider}" not configured`,
        "NO_PROVIDER_CONFIGURED",
        forceProvider
      );
    }

    // Detect region
    const region = await this.detectRegion(context);
    this.logger?.debug("Region detected", { region, context });

    // Check rules first (higher priority)
    for (const rule of this.rules) {
      if (rule.regions.includes(region)) {
        // Check additional condition if provided
        if (rule.condition && !rule.condition(context)) {
          continue;
        }

        this.logger?.debug("Rule matched", {
          regions: rule.regions,
          provider: rule.provider.type,
        });

        return {
          provider: rule.provider,
          type: rule.provider.type,
          region,
          reason: "rule",
        };
      }
    }

    // Check region providers
    const regionProvider = this.regionProviders.get(region);
    if (regionProvider) {
      this.logger?.debug("Region provider selected", {
        region,
        provider: regionProvider.type,
      });

      return {
        provider: regionProvider,
        type: regionProvider.type,
        region,
        reason: "region",
      };
    }

    // Fall back to default
    this.logger?.debug("Using default provider", {
      region,
      provider: this.defaultProvider.type,
    });

    return {
      provider: this.defaultProvider,
      type: this.defaultProvider.type,
      region,
      reason: "default",
    };
  }

  /**
   * Detect region from context
   */
  async detectRegion(context: RegionDetectionContext): Promise<BillingRegion> {
    try {
      return await this.regionDetector(context);
    } catch (error) {
      this.logger?.warn("Region detection failed, using GLOBAL", {
        error: error instanceof Error ? error.message : String(error),
      });
      return "GLOBAL";
    }
  }

  /**
   * Get all configured providers
   */
  getAllProviders(): PaymentProvider[] {
    const providers = new Set<PaymentProvider>();
    providers.add(this.defaultProvider);

    for (const provider of this.regionProviders.values()) {
      providers.add(provider);
    }

    for (const rule of this.rules) {
      providers.add(rule.provider);
    }

    return Array.from(providers);
  }

  /**
   * Get provider by type
   */
  getProviderByType(type: PaymentProviderType): PaymentProvider | undefined {
    return this.findProviderByType(type);
  }

  /**
   * Get default provider
   */
  getDefaultProvider(): PaymentProvider {
    return this.defaultProvider;
  }

  /**
   * Get provider for region
   */
  getProviderForRegion(region: BillingRegion): PaymentProvider {
    return this.regionProviders.get(region) ?? this.defaultProvider;
  }

  /**
   * Check if region is supported
   */
  isRegionSupported(region: BillingRegion): boolean {
    // GLOBAL is always supported via default provider
    if (region === "GLOBAL") return true;

    // Check if any rule matches
    for (const rule of this.rules) {
      if (rule.regions.includes(region)) return true;
    }

    // Check if region has explicit provider
    return this.regionProviders.has(region);
  }

  /**
   * Get supported regions
   */
  getSupportedRegions(): BillingRegion[] {
    const regions = new Set<BillingRegion>(["GLOBAL"]);

    for (const region of this.regionProviders.keys()) {
      regions.add(region);
    }

    for (const rule of this.rules) {
      for (const region of rule.regions) {
        regions.add(region);
      }
    }

    return Array.from(regions);
  }

  /**
   * Find provider by type across all configured providers
   */
  private findProviderByType(type: PaymentProviderType): PaymentProvider | undefined {
    if (this.defaultProvider.type === type) {
      return this.defaultProvider;
    }

    for (const provider of this.regionProviders.values()) {
      if (provider.type === type) {
        return provider;
      }
    }

    for (const rule of this.rules) {
      if (rule.provider.type === type) {
        return rule.provider;
      }
    }

    return undefined;
  }
}

/**
 * Create provider strategy
 */
export function createProviderStrategy(
  config: ProviderStrategyConfig,
  logger?: BillingLogger
): ProviderStrategy {
  return new ProviderStrategy(config, logger);
}
