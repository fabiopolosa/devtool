import type { CapabilityClass, ProviderName } from "@cp/domain";
import type { ProviderModelDescriptor } from "@cp/domain";
import type { ProviderConfig, ProviderModel } from "@cp/domain";

export interface NormalizedProviderModel {
  id: string;
  provider: ProviderName;
  modelId: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  pricing: {
    input?: number;
    output?: number;
  };
  capabilities: CapabilityClass[];
  enabled: boolean;
  source: "live" | "persisted" | "fallback";
  providerConfigId?: string;
  registryId?: string;
  metadata?: Record<string, unknown>;
}

export interface PersistedProviderModelView {
  providerConfigId: string;
  provider: ProviderName;
  model: ProviderModel;
}

const unique = <T,>(items: T[]): T[] => [...new Set(items)];

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const normalizePricing = (metadata: Record<string, unknown> | undefined, pricingMeta: Record<string, number> | undefined) => {
  const metadataPricing = metadata?.pricing;
  const pricing = metadataPricing && typeof metadataPricing === "object" ? (metadataPricing as Record<string, unknown>) : undefined;
  const input =
    toNumber(pricing?.input) ??
    toNumber(pricing?.prompt) ??
    toNumber(metadata?.inputPrice) ??
    toNumber(metadata?.input_price) ??
    toNumber(pricingMeta?.input);
  const output =
    toNumber(pricing?.output) ??
    toNumber(pricing?.completion) ??
    toNumber(metadata?.outputPrice) ??
    toNumber(metadata?.output_price) ??
    toNumber(pricingMeta?.output);

  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {})
  };
};

const normalizeDescriptorMetadata = (descriptor: ProviderModelDescriptor): Record<string, unknown> => ({
  ...(descriptor.metadata ?? {}),
  source: "live"
});

const normalizeGroup = (group: Array<ProviderModelDescriptor | PersistedProviderModelView>): NormalizedProviderModel => {
  if (group.length === 0) {
    throw new Error("normalizeGroup requires at least one model");
  }

  const liveDescriptors = group.filter((entry): entry is ProviderModelDescriptor => "capabilityClass" in entry && "modelId" in entry && !("model" in entry));
  const persistedEntries = group.filter((entry): entry is PersistedProviderModelView => "model" in entry);
  const firstLive = liveDescriptors[0];
  const firstPersisted = persistedEntries[0];

  const provider = firstLive?.provider ?? firstPersisted?.provider ?? "openai";
  const modelId = firstLive?.modelId ?? firstPersisted?.model.modelId ?? "unknown-model";
  const displayName =
    firstPersisted?.model.modelId ??
    (typeof firstLive?.metadata?.displayName === "string" ? firstLive.metadata.displayName : undefined) ??
    firstLive?.modelId ??
    modelId;

  const capabilities = unique(
    group.flatMap((entry) =>
      "capabilityClass" in entry ? [entry.capabilityClass] : [entry.model.capabilityClass]
    )
  );

  const contextWindow =
    liveDescriptors.map((entry) => entry.contextWindow).find((value): value is number => typeof value === "number" && Number.isFinite(value)) ??
    persistedEntries.map((entry) => entry.model.contextWindow).find((value): value is number => typeof value === "number" && Number.isFinite(value));

  const maxOutputTokens =
    liveDescriptors.map((entry) => entry.maxOutputTokens).find((value): value is number => typeof value === "number" && Number.isFinite(value)) ??
    persistedEntries.map((entry) => entry.model.maxOutputTokens).find((value): value is number => typeof value === "number" && Number.isFinite(value));

  const metadata = {
    ...(firstLive?.metadata ?? {}),
    ...(firstPersisted?.model.pricingMeta ? { pricing: firstPersisted.model.pricingMeta } : {})
  };

  const pricing = normalizePricing(metadata, firstPersisted?.model.pricingMeta);
  const source = persistedEntries.length > 0 ? "persisted" : "live";

  return {
    id: `${provider}:${modelId}`,
    provider,
    modelId,
    displayName,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    pricing,
    capabilities,
    enabled: firstPersisted?.model.enabled ?? true,
    source,
    ...(firstPersisted?.providerConfigId ? { providerConfigId: firstPersisted.providerConfigId } : {}),
    ...(firstPersisted?.model.id ? { registryId: firstPersisted.model.id } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {})
  };
};

export const normalizeLiveProviderModels = (models: ProviderModelDescriptor[]): NormalizedProviderModel[] => {
  const groups = new Map<string, ProviderModelDescriptor[]>();

  for (const model of models) {
    const key = `${model.provider}:${model.modelId}`;
    const bucket = groups.get(key) ?? [];
    bucket.push({
      ...model,
      metadata: normalizeDescriptorMetadata(model)
    });
    groups.set(key, bucket);
  }

  return [...groups.values()].map((group) => normalizeGroup(group));
};

export const normalizePersistedProviderModels = (
  configs: ProviderConfig[],
  models: ProviderModel[]
): NormalizedProviderModel[] => {
  const providerByConfigId = new Map(configs.map((config) => [config.id, config.providerId ?? config.provider]));
  const grouped = new Map<string, PersistedProviderModelView[]>();

  for (const model of models) {
    const provider = providerByConfigId.get(model.providerConfigId);
    if (!provider) continue;

    const key = `${provider}:${model.modelId}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push({
      providerConfigId: model.providerConfigId,
      provider,
      model
    });
    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((group) => normalizeGroup(group));
};

export const mergeNormalizedProviderModels = (items: NormalizedProviderModel[]): NormalizedProviderModel[] => {
  const grouped = new Map<string, NormalizedProviderModel>();

  for (const item of items) {
    const key = `${item.provider}:${item.modelId}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, item);
      continue;
    }

    grouped.set(key, {
      ...existing,
      id: existing.id ?? item.id,
      ...(existing.contextWindow !== undefined
        ? { contextWindow: existing.contextWindow }
        : item.contextWindow !== undefined
          ? { contextWindow: item.contextWindow }
          : {}),
      ...(existing.maxOutputTokens !== undefined
        ? { maxOutputTokens: existing.maxOutputTokens }
        : item.maxOutputTokens !== undefined
          ? { maxOutputTokens: item.maxOutputTokens }
          : {}),
      pricing: {
        ...(existing.pricing.input !== undefined ? { input: existing.pricing.input } : item.pricing.input !== undefined ? { input: item.pricing.input } : {}),
        ...(existing.pricing.output !== undefined ? { output: existing.pricing.output } : item.pricing.output !== undefined ? { output: item.pricing.output } : {})
      },
      capabilities: unique([...existing.capabilities, ...item.capabilities]),
      enabled: existing.enabled || item.enabled,
      source: existing.source === "live" ? existing.source : item.source,
      ...(existing.providerConfigId ?? item.providerConfigId ? { providerConfigId: existing.providerConfigId ?? item.providerConfigId } : {}),
      ...(existing.registryId ?? item.registryId ? { registryId: existing.registryId ?? item.registryId } : {}),
      metadata: {
        ...(item.metadata ?? {}),
        ...(existing.metadata ?? {})
      }
    });
  }

  return [...grouped.values()].sort((left, right) => {
    const providerCompare = left.provider.localeCompare(right.provider);
    if (providerCompare !== 0) return providerCompare;
    return left.modelId.localeCompare(right.modelId);
  });
};
