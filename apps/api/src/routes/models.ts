import type { FastifyPluginAsync } from "fastify";
import {
  buildFallbackNormalizedModels,
  createDefaultProviderRegistry,
  discoverNormalizedModels
} from "@cp/providers";
import { apiStore } from "../services/api-store.js";

const parseTruthy = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

export const modelsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { refresh?: string } }>(
    "/models",
    { schema: { tags: ["providers"], summary: "List normalized provider models" } },
    async (request) => {
      const strictMode = parseTruthy(process.env.MODELS_STRICT);
      const [providerConfigs, providerModels] = await Promise.all([
        apiStore.listProviderConfigs(),
        apiStore.listProviderModels()
      ]);
      const enabledProviders = new Set(
        providerConfigs.filter((config) => config.enabled).map((config) => config.providerId ?? config.provider)
      );
      const useEnabledFilter = enabledProviders.size > 0;
      const visibleProviderConfigs = useEnabledFilter
        ? providerConfigs.filter((config) => enabledProviders.has(config.providerId ?? config.provider))
        : providerConfigs;
      const visibleProviderConfigIds = new Set(visibleProviderConfigs.map((config) => config.id));
      const visibleProviderModels = providerModels.filter(
        (model) => visibleProviderConfigIds.has(model.providerConfigId) && model.enabled
      );
      const scopedFallbackModels = buildFallbackNormalizedModels(visibleProviderConfigs, visibleProviderModels);

      const registry = createDefaultProviderRegistry();
      const discovery = await discoverNormalizedModels({
        source: async () => {
          const discovered = await registry.discoverAllModels();
          if (!useEnabledFilter) return discovered;
          return discovered.filter((model) => enabledProviders.has(model.provider));
        },
        fallbackModels: scopedFallbackModels,
        refresh: parseTruthy(request.query.refresh),
        cacheKey: request.tenantId ?? "tenant_default"
      });

      const source: "live" | "mock" =
        discovery.source === "live" || discovery.source === "cache" ? "live" : "mock";
      const models = discovery.items;

      return {
        source,
        models,
        // Backward-compatible shape for existing consumers.
        items: models,
        meta: {
          strictMode,
          source: discovery.source,
          cached: discovery.cached,
          refreshed: discovery.refreshed,
          discoveredAt: discovery.discoveredAt,
          error: discovery.error
        }
      };
    }
  );
};
