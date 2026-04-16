import type { ProviderModelDescriptor } from "@cp/domain";
import type { ProviderConfig, ProviderModel } from "@cp/domain";
import { mergeNormalizedProviderModels, normalizeLiveProviderModels, normalizePersistedProviderModels, type NormalizedProviderModel } from "./normalized-model.js";

export interface DiscoverySource {
  (): Promise<ProviderModelDescriptor[]>;
}

export interface NormalizedModelDiscoveryOptions {
  source: DiscoverySource;
  fallbackModels?: NormalizedProviderModel[];
  refresh?: boolean;
  ttlMs?: number;
  now?: () => number;
  cacheKey?: string;
}

export interface NormalizedModelDiscoveryResult {
  items: NormalizedProviderModel[];
  source: "live" | "cache" | "fallback";
  cached: boolean;
  refreshed: boolean;
  discoveredAt: string;
  error?: string;
}

type CacheEntry = {
  items: NormalizedProviderModel[];
  expiresAt: number;
  discoveredAt: string;
};

const cacheByKey = new Map<string, CacheEntry>();
const defaultCacheKey = "__global__";

export const DEFAULT_MODEL_DISCOVERY_TTL_MS = 5 * 60 * 1000;

export const resetNormalizedModelDiscoveryCache = (cacheKey?: string): void => {
  if (!cacheKey) {
    cacheByKey.clear();
    return;
  }
  cacheByKey.delete(cacheKey);
};

export const buildFallbackNormalizedModels = (configs: ProviderConfig[], models: ProviderModel[]): NormalizedProviderModel[] =>
  normalizePersistedProviderModels(configs, models);

export const discoverNormalizedModels = async ({
  source,
  fallbackModels = [],
  refresh = false,
  ttlMs = DEFAULT_MODEL_DISCOVERY_TTL_MS,
  now = () => Date.now(),
  cacheKey = defaultCacheKey
}: NormalizedModelDiscoveryOptions): Promise<NormalizedModelDiscoveryResult> => {
  const currentTime = now();
  const cache = cacheByKey.get(cacheKey) ?? null;

  if (!refresh && cache && cache.expiresAt > currentTime) {
    return {
      items: cache.items,
      source: "cache",
      cached: true,
      refreshed: false,
      discoveredAt: cache.discoveredAt
    };
  }

  try {
    const raw = await source();
    const normalized = mergeNormalizedProviderModels(normalizeLiveProviderModels(raw));
    const hasLiveModels = normalized.some((item) => item.source === "live");

    if (normalized.length > 0 && hasLiveModels) {
      const discoveredAt = new Date(currentTime).toISOString();
      cacheByKey.set(cacheKey, {
        items: normalized,
        expiresAt: currentTime + ttlMs,
        discoveredAt
      });
      return {
        items: normalized,
        source: "live",
        cached: false,
        refreshed: refresh,
        discoveredAt
      };
    }

    if (normalized.length > 0) {
      return {
        items: fallbackModels.length > 0 ? fallbackModels : normalized,
        source: "fallback",
        cached: false,
        refreshed: refresh,
        discoveredAt: new Date(currentTime).toISOString()
      };
    }
  } catch (error) {
    if (fallbackModels.length > 0) {
      return {
        items: fallbackModels,
        source: "fallback",
        cached: false,
        refreshed: refresh,
        discoveredAt: new Date(currentTime).toISOString(),
        error: error instanceof Error ? error.message : "Model discovery failed"
      };
    }

    if (cache && !refresh) {
      return {
        items: cache.items,
        source: "cache",
        cached: true,
        refreshed: false,
        discoveredAt: cache.discoveredAt,
        error: error instanceof Error ? error.message : "Model discovery failed"
      };
    }

    return {
      items: [],
      source: "fallback",
      cached: false,
      refreshed: refresh,
      discoveredAt: new Date(currentTime).toISOString(),
      error: error instanceof Error ? error.message : "Model discovery failed"
    };
  }

  if (fallbackModels.length > 0) {
    return {
      items: fallbackModels,
      source: "fallback",
      cached: false,
      refreshed: refresh,
      discoveredAt: new Date(currentTime).toISOString()
    };
  }

  return {
    items: [],
    source: "fallback",
    cached: false,
    refreshed: refresh,
    discoveredAt: new Date(currentTime).toISOString()
  };
};
