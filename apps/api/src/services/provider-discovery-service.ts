import { randomUUID } from "node:crypto";
import type {
  CapabilityClass,
  ProviderConfig,
  ProviderDiscoveryLog,
  ProviderHealthcheck,
  ProviderModel,
  ProviderName
} from "@cp/domain";
import { capabilityClasses } from "@cp/domain";
import {
  ProviderAutoDiscoveryService,
  createDefaultProviderRegistry
} from "@cp/providers";
import { apiStore } from "./api-store.js";

export interface ProviderDiscoveryExecutionResult {
  log: ProviderDiscoveryLog;
  createdProviderConfigs: number;
  createdCapabilities: number;
  createdModels: number;
  updatedModels: number;
  healthchecksUpdated: number;
}

const boolFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const defaultAuthRef = (provider: ProviderName): string => `secret://${provider}/api-key`;

const unknownHealthStatus = (): ProviderHealthcheck["status"] => "unknown";

async function ensureProviderConfig(
  provider: ProviderName,
  actor: string
): Promise<{ item: ProviderConfig; created: boolean }> {
  const existing = (await apiStore.listProviderConfigs()).find(
    (entry) => (entry.providerId ?? entry.provider) === provider
  );
  if (existing) return { item: existing, created: false };

  const now = new Date().toISOString();
  const created = await apiStore.createProviderConfig({
    id: randomUUID(),
    providerId: provider,
    provider,
    authRef: defaultAuthRef(provider),
    secretRef: defaultAuthRef(provider),
    enabled: true,
    timeoutMs: 30000,
    validationStatus: "unknown",
    metadata: { source: "auto_discovery" },
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor
  });
  return { item: created, created: true };
}

async function ensureCapability(
  providerConfigId: string,
  capabilityClass: CapabilityClass,
  actor: string
): Promise<{ created: boolean }> {
  const existing = (await apiStore.listProviderCapabilities()).find(
    (entry) =>
      entry.providerConfigId === providerConfigId && entry.capabilityClass === capabilityClass
  );
  if (existing) {
    if (!existing.supported) {
      await apiStore.updateProviderCapability(existing.id, {
        supported: true,
        updatedAt: new Date().toISOString(),
        updatedBy: actor
      });
    }
    return { created: false };
  }

  const now = new Date().toISOString();
  await apiStore.createProviderCapability({
    id: randomUUID(),
    providerConfigId,
    capabilityClass,
    supported: true,
    notes: "Discovered by provider auto-discovery",
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor
  });
  return { created: true };
}

async function upsertModel(
  providerConfigId: string,
  model: {
    modelId: string;
    capabilityClass: CapabilityClass;
    contextWindow?: number;
    maxOutputTokens?: number;
  },
  actor: string
): Promise<{ created: boolean; updated: boolean; item: ProviderModel }> {
  const existing = (await apiStore.listProviderModels()).find(
    (entry) =>
      entry.providerConfigId === providerConfigId &&
      entry.capabilityClass === model.capabilityClass &&
      entry.modelId === model.modelId
  );
  const now = new Date().toISOString();

  if (existing) {
    const updated = await apiStore.updateProviderModel(existing.id, {
      ...(model.contextWindow !== undefined
        ? { contextWindow: model.contextWindow }
        : existing.contextWindow !== undefined
          ? { contextWindow: existing.contextWindow }
          : {}),
      ...(model.maxOutputTokens !== undefined
        ? { maxOutputTokens: model.maxOutputTokens }
        : existing.maxOutputTokens !== undefined
          ? { maxOutputTokens: existing.maxOutputTokens }
          : {}),
      enabled: true,
      updatedAt: now,
      updatedBy: actor
    });
    return { created: false, updated: true, item: updated };
  }

  const created = await apiStore.createProviderModel({
    id: randomUUID(),
    providerConfigId,
    modelId: model.modelId,
    capabilityClass: model.capabilityClass,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}),
    pricingMeta: {},
    enabled: true,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor
  });
  return { created: true, updated: false, item: created };
}

async function upsertHealthcheck(
  providerConfigId: string,
  modelId: string | undefined,
  actor: string
): Promise<void> {
  const existing = (await apiStore.listProviderHealthchecks()).find(
    (entry) => entry.providerConfigId === providerConfigId && entry.modelId === modelId
  );
  const now = new Date().toISOString();
  if (existing) {
    await apiStore.updateProviderHealthcheck(existing.id, {
      status: unknownHealthStatus(),
      checkedAt: now,
      details: "Updated during provider auto-discovery",
      updatedAt: now,
      updatedBy: actor
    });
    return;
  }

  await apiStore.createProviderHealthcheck({
    id: randomUUID(),
    providerConfigId,
    ...(modelId ? { modelId } : {}),
    status: unknownHealthStatus(),
    details: "Created during provider auto-discovery",
    checkedAt: now,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor
  });
}

export async function runProviderAutoDiscovery(
  source: "startup" | "manual",
  actor = "provider_discovery_service"
): Promise<ProviderDiscoveryExecutionResult> {
  const discovery = new ProviderAutoDiscoveryService();
  const discoveryResult = await discovery.run();
  const providerConfigs = await apiStore.listProviderConfigs();
  const enabledProviderSet = new Set<ProviderName>(
    providerConfigs
      .filter((config) => config.enabled)
      .map((config) => config.providerId ?? config.provider)
  );

  const registry = createDefaultProviderRegistry();
  const discoveredModels = await registry.discoverAllModels();
  const discoveredProviderSet = new Set<ProviderName>(discoveryResult.discoveredProviders);
  const effectiveProviderSet =
    enabledProviderSet.size > 0
      ? new Set<ProviderName>(
          [...discoveredProviderSet].filter((provider) => enabledProviderSet.has(provider))
        )
      : discoveredProviderSet;

  if (enabledProviderSet.size > 0 && effectiveProviderSet.size === 0) {
    for (const provider of enabledProviderSet) {
      effectiveProviderSet.add(provider);
    }
  }

  const filteredModels = discoveredModels.filter((model) => effectiveProviderSet.has(model.provider));

  let createdProviderConfigs = 0;
  let createdCapabilities = 0;
  let createdModels = 0;
  let updatedModels = 0;
  let healthchecksUpdated = 0;

  const capabilitiesByProvider = new Map<ProviderName, Set<CapabilityClass>>();
  for (const model of filteredModels) {
    if (!capabilitiesByProvider.has(model.provider)) {
      capabilitiesByProvider.set(model.provider, new Set<CapabilityClass>());
    }
    capabilitiesByProvider.get(model.provider)?.add(model.capabilityClass);
  }

  for (const provider of effectiveProviderSet) {
    const ensured = await ensureProviderConfig(provider, actor);
    if (ensured.created) createdProviderConfigs += 1;

    const capabilities = capabilitiesByProvider.get(provider);
    if (capabilities && capabilities.size > 0) {
      for (const capability of capabilities) {
        const capabilityUpsert = await ensureCapability(ensured.item.id, capability, actor);
        if (capabilityUpsert.created) createdCapabilities += 1;
      }
    } else {
      for (const fallbackCapability of capabilityClasses) {
        const upsert = await ensureCapability(ensured.item.id, fallbackCapability, actor);
        if (upsert.created) createdCapabilities += 1;
      }
    }
  }

  for (const model of filteredModels) {
    const providerConfig = (await apiStore.listProviderConfigs()).find(
      (item) => (item.providerId ?? item.provider) === model.provider
    );
    if (!providerConfig) continue;

    const modelResult = await upsertModel(
      providerConfig.id,
      {
        modelId: model.modelId,
        capabilityClass: model.capabilityClass,
        ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {})
      },
      actor
    );
    if (modelResult.created) createdModels += 1;
    if (modelResult.updated) updatedModels += 1;

    await upsertHealthcheck(providerConfig.id, modelResult.item.id, actor);
    healthchecksUpdated += 1;
  }

  const now = new Date().toISOString();
  const log = await apiStore.createProviderDiscoveryLog({
    id: randomUUID(),
    source,
    queries: discoveryResult.queries,
    discoveredProviders: [...effectiveProviderSet],
    discoveredModels: discoveryResult.discoveredModels,
    status: discoveryResult.status,
    searchStartedAt: discoveryResult.startedAt,
    searchFinishedAt: discoveryResult.finishedAt,
    ...(discoveryResult.notes ? { notes: discoveryResult.notes } : {}),
    rawResults: {
      rawResults: discoveryResult.rawResults,
      registryModelCount: discoveredModels.length
    },
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor
  });

  return {
    log,
    createdProviderConfigs,
    createdCapabilities,
    createdModels,
    updatedModels,
    healthchecksUpdated
  };
}

export async function maybeRunStartupProviderDiscovery(): Promise<void> {
  const defaultEnabled = process.env.NODE_ENV !== "test";
  const enabled = boolFlag(process.env.PROVIDER_AUTO_DISCOVERY_ENABLED, defaultEnabled);
  if (!enabled) return;

  try {
    await runProviderAutoDiscovery("startup");
  } catch {
    // Startup discovery must never block API boot.
  }
}
