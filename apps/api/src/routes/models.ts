import type { FastifyPluginAsync } from "fastify";
import type { ProviderConfig, ProviderModelDescriptor, ProviderName } from "@cp/domain";
import {
  buildFallbackNormalizedModels,
  createDefaultProviderRegistry,
  discoverNormalizedModels
} from "@cp/providers";
import { apiStore } from "../services/api-store.js";
import { resolveProviderApiKeyFromAuthRef } from "../services/provider-config-service.js";

const parseTruthy = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const defaultEndpointByProvider: Partial<Record<ProviderName, string>> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1"
};

const resolveProviderEndpoint = (config: ProviderConfig): string => {
  const provider = config.providerId ?? config.provider;
  const fallback = defaultEndpointByProvider[provider];
  return (config.endpoint?.trim() || fallback || "").replace(/\/$/, "");
};

const createAbortSignal = (timeoutMs: number): { signal: AbortSignal; cancel: () => void } => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer)
  };
};

const extractModelIds = (payload: unknown): string[] => {
  const data = payload && typeof payload === "object" && "data" in payload
    ? (payload as { data?: unknown }).data
    : undefined;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const id = "id" in entry ? (entry as { id?: unknown }).id : undefined;
      return typeof id === "string" ? id.trim() : "";
    })
    .filter((id) => id.length > 0);
};

const discoverProviderModelsLive = async (
  config: ProviderConfig
): Promise<ProviderModelDescriptor[]> => {
  const provider = config.providerId ?? config.provider;
  if (provider !== "openai" && provider !== "openrouter") return [];
  if (!config.enabled) return [];

  const tenantId = config.tenantId ?? "tenant_default";
  let apiKey: string | undefined;
  try {
    apiKey = await resolveProviderApiKeyFromAuthRef(provider, config.authRef, tenantId);
  } catch {
    apiKey = undefined;
  }
  if (!apiKey) return [];

  const endpoint = resolveProviderEndpoint(config);
  if (!endpoint) return [];

  const timeout = Math.max(3_000, config.timeoutMs ?? 30_000);
  const { signal, cancel } = createAbortSignal(timeout);
  try {
    const response = await fetch(`${endpoint}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal
    });
    if (!response.ok) return [];
    const body = await response.json();
    const modelIds = extractModelIds(body);
    if (modelIds.length === 0) return [];

    const descriptors: ProviderModelDescriptor[] = [];
    for (const modelId of modelIds) {
      descriptors.push({
        id: `${provider}:chat_reasoning:${modelId}`,
        provider,
        modelId,
        capabilityClass: "chat_reasoning",
        metadata: {
          providerDiscovery: "config_live"
        }
      });
      descriptors.push({
        id: `${provider}:coding:${modelId}`,
        provider,
        modelId,
        capabilityClass: "coding",
        metadata: {
          providerDiscovery: "config_live"
        }
      });
    }
    return descriptors;
  } catch {
    return [];
  } finally {
    cancel();
  }
};

const discoverLiveModelsFromConfigs = async (configs: ProviderConfig[]): Promise<ProviderModelDescriptor[]> => {
  const batches = await Promise.all(configs.map((config) => discoverProviderModelsLive(config)));
  return batches.flat();
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

      const configLiveModels = await discoverLiveModelsFromConfigs(visibleProviderConfigs);
      const registry = createDefaultProviderRegistry();
      const discovery = await discoverNormalizedModels({
        source: async () => {
          if (configLiveModels.length > 0) {
            return configLiveModels;
          }
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
