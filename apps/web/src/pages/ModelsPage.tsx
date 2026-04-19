import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProviderConfig, ProviderModel } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type ModelTier = "cheap" | "balanced" | "premium" | "vision" | "image" | "long-context";

type ModelsApiItem = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  pricing?: {
    input?: number;
    output?: number;
  };
  capabilities: string[];
  enabled: boolean;
  source: "live" | "persisted" | "fallback";
};

type ModelPolicy = {
  alias: string;
  locale: string;
  tiers: ModelTier[];
  enabled?: boolean;
};

type PersistedModelPolicy = Record<string, ModelPolicy>;

type ProviderBucket = {
  provider: string;
  modelCount: number;
  connectedCount: number;
};

const modelPolicyStorageKey = "cp.models.policy.v1";
const tierOptions: ModelTier[] = ["cheap", "balanced", "premium", "vision", "image", "long-context"];

const modelKeyFor = (model: Pick<ModelsApiItem, "id" | "provider" | "modelId">): string => {
  return model.id?.trim().length ? model.id : `${model.provider}:${model.modelId}`;
};

const readPolicies = (): PersistedModelPolicy => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(modelPolicyStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PersistedModelPolicy;
  } catch {
    return {};
  }
};

const writePolicies = (policies: PersistedModelPolicy): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(modelPolicyStorageKey, JSON.stringify(policies));
  } catch {
    // ignore storage failures in restricted environments
  }
};

const buildFallbackModels = (
  configuredProviders: ProviderConfig[],
  persistedModels: ProviderModel[]
): ModelsApiItem[] => {
  const providerByConfig = new Map(configuredProviders.map((provider) => [provider.id, provider.providerId ?? provider.provider]));

  return persistedModels.flatMap((model) => {
    const provider = providerByConfig.get(model.providerConfigId);
    if (!provider) return [];

    return [
      {
        id: model.id,
        provider,
        modelId: model.modelId,
        displayName: model.modelId,
        ...(model.contextWindow !== undefined ? { contextWindow: model.contextWindow } : {}),
        ...(model.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
        pricing: {
          ...(typeof model.pricingMeta?.input === "number" ? { input: model.pricingMeta.input } : {}),
          ...(typeof model.pricingMeta?.output === "number" ? { output: model.pricingMeta.output } : {})
        },
        capabilities: [model.capabilityClass],
        enabled: model.enabled,
        source: "persisted" as const
      }
    ];
  });
};

const formatContextWindow = (value?: number): string => {
  if (!value) return "n/a";
  return `${value.toLocaleString()} tokens`;
};

const formatPricing = (value?: { input?: number; output?: number }): string => {
  if (!value) return "n/a";
  const input = typeof value.input === "number" ? `$${value.input}` : "n/a";
  const output = typeof value.output === "number" ? `$${value.output}` : "n/a";
  return `${input} / ${output}`;
};

export function ModelsPage() {
  const { authActions } = useAppStore();

  const [models, setModels] = useState<ModelsApiItem[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [policies, setPolicies] = useState<PersistedModelPolicy>(() => readPolicies());

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [capabilityFilter, setCapabilityFilter] = useState<string>("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [source, setSource] = useState<"live" | "persisted" | "fallback">("fallback");

  useEffect(() => {
    writePolicies(policies);
  }, [policies]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setNotice(undefined);

    try {
      const [providersResult, persistedModelsResult] = await Promise.all([
        authActions.apiFetchJson<{ items?: ProviderConfig[]; message?: string }>("/providers/config"),
        authActions.apiFetchJson<{ items?: ProviderModel[]; message?: string }>("/providers/models?includeDisabled=1")
      ]);

      if (!providersResult.response.ok) {
        throw new Error(
          providersResult.body.message ??
            `Unable to load provider configurations (HTTP ${providersResult.response.status}).`
        );
      }

      const configuredProviders = providersResult.body.items ?? [];
      const providerNames = new Set<string>(
        configuredProviders
          .map((item) => item.providerId ?? item.provider)
          .filter(
            (item): item is Exclude<typeof item, undefined> =>
              typeof item === "string" && item.trim().length > 0
          )
      );

      let nextSource: "live" | "persisted" | "fallback" = "fallback";
      let nextModels: ModelsApiItem[] = [];

      try {
        const normalizedResult = await authActions.apiFetchJson<{
          source?: "live" | "mock";
          models?: ModelsApiItem[];
          items?: ModelsApiItem[];
          message?: string;
        }>("/models?refresh=1");

        if (normalizedResult.response.ok) {
          const normalizedItems = Array.isArray(normalizedResult.body.models)
            ? normalizedResult.body.models
            : Array.isArray(normalizedResult.body.items)
              ? normalizedResult.body.items
              : [];

          if (normalizedItems.length > 0) {
            nextModels = normalizedItems.filter((item) => providerNames.has(item.provider));
            nextSource = normalizedResult.body.source === "live" ? "live" : "fallback";
          }
        }
      } catch {
        // graceful fallback below
      }

      if (nextModels.length === 0) {
        const persistedModels = persistedModelsResult.response.ok ? persistedModelsResult.body.items ?? [] : [];
        nextModels = buildFallbackModels(configuredProviders, persistedModels);
        nextSource = "persisted";
        if (!persistedModelsResult.response.ok) {
          setNotice("Live model discovery unavailable. Showing local policy fallback.");
        }
      }

      setModels(nextModels);
      setSource(nextSource);
    } catch (loadError) {
      setModels([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load models policy.");
    } finally {
      setLoading(false);
    }
  }, [authActions]);

  useEffect(() => {
    void load();
  }, [load]);

  const providerBuckets = useMemo<ProviderBucket[]>(() => {
    const byProvider = new Map<string, ProviderBucket>();

    for (const model of models) {
      const existing = byProvider.get(model.provider);
      if (!existing) {
        byProvider.set(model.provider, {
          provider: model.provider,
          modelCount: 1,
          connectedCount: model.source === "live" ? 1 : 0
        });
      } else {
        existing.modelCount += 1;
        if (model.source === "live") {
          existing.connectedCount += 1;
        }
      }
    }

    return [...byProvider.values()].sort((left, right) => {
      if (left.modelCount !== right.modelCount) return right.modelCount - left.modelCount;
      return left.provider.localeCompare(right.provider);
    });
  }, [models]);

  useEffect(() => {
    if (!selectedProvider || !providerBuckets.some((bucket) => bucket.provider === selectedProvider)) {
      setSelectedProvider(providerBuckets[0]?.provider ?? "");
    }
  }, [providerBuckets, selectedProvider]);

  const availableCapabilities = useMemo(() => {
    const set = new Set<string>();
    for (const model of models) {
      for (const capability of model.capabilities) {
        set.add(capability);
      }
    }
    return [...set].sort((left, right) => left.localeCompare(right));
  }, [models]);

  const filteredModels = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return models
      .filter((model) => (selectedProvider ? model.provider === selectedProvider : true))
      .filter((model) => {
        const key = modelKeyFor(model);
        const policy = policies[key];
        const effectiveEnabled = typeof policy?.enabled === "boolean" ? policy.enabled : model.enabled;

        if (enabledFilter === "enabled" && !effectiveEnabled) return false;
        if (enabledFilter === "disabled" && effectiveEnabled) return false;
        if (capabilityFilter !== "all" && !model.capabilities.includes(capabilityFilter)) return false;

        if (!normalizedQuery) return true;
        const haystack = `${model.provider} ${model.modelId} ${model.displayName} ${policy?.alias ?? ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => left.modelId.localeCompare(right.modelId));
  }, [capabilityFilter, enabledFilter, models, policies, searchQuery, selectedProvider]);

  const updatePolicy = (model: ModelsApiItem, patch: Partial<ModelPolicy>): void => {
    const key = modelKeyFor(model);
    setPolicies((current) => {
      const next: ModelPolicy = {
        alias: "",
        locale: "",
        tiers: [],
        ...(current[key] ?? {}),
        ...patch
      };
      return {
        ...current,
        [key]: next
      };
    });
  };

  const toggleTier = (model: ModelsApiItem, tier: ModelTier): void => {
    const key = modelKeyFor(model);
    const currentPolicy = policies[key];
    const tiers = currentPolicy?.tiers ?? [];
    const nextTiers = tiers.includes(tier) ? tiers.filter((item) => item !== tier) : [...tiers, tier];
    updatePolicy(model, { tiers: nextTiers });
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Models Policy" subtitle="Configure model availability and usage labels by provider" />
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {notice ? <p className="text-sm text-amber-200">{notice}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <Panel>
          <SectionHeading title="Configured providers" subtitle="Choose provider scope" />
          <div className="space-y-2">
            {providerBuckets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-3 text-sm text-slate-300">
                No configured providers found.
              </p>
            ) : (
              providerBuckets.map((bucket) => {
                const active = bucket.provider === selectedProvider;
                return (
                  <button
                    key={bucket.provider}
                    type="button"
                    onClick={() => setSelectedProvider(bucket.provider)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active ? "border-cyan-400/40 bg-cyan-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{bucket.provider}</span>
                      <Pill tone={bucket.connectedCount > 0 ? "good" : "default"}>
                        {bucket.connectedCount > 0 ? "live" : "fallback"}
                      </Pill>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{bucket.modelCount} models</div>
                  </button>
                );
              })
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeading
            title={selectedProvider ? `${selectedProvider} models` : "Models"}
            subtitle={source === "live" ? "Live discovery source" : "Fallback source"}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
            }
          />

          {loading ? <p className="text-sm text-slate-300">Loading models…</p> : null}

          {!loading && filteredModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-3 text-sm text-slate-300">
              No models match this provider and filter set.
            </div>
          ) : null}

          <div className="space-y-3">
            {filteredModels.map((model) => {
              const key = modelKeyFor(model);
              const policy = policies[key];
              const effectiveEnabled = typeof policy?.enabled === "boolean" ? policy.enabled : model.enabled;
              const selectedTiers = policy?.tiers ?? [];

              return (
                <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">{policy?.alias?.trim() || model.displayName}</div>
                      <div className="text-xs text-slate-400">
                        {model.modelId} · {model.provider}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`rounded-lg border px-2 py-1 text-xs ${
                        effectiveEnabled
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                          : "border-white/15 bg-black/20 text-slate-300"
                      }`}
                      onClick={() => updatePolicy(model, { enabled: !effectiveEnabled })}
                    >
                      {effectiveEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="text-xs text-slate-400">
                      Human alias
                      <Input
                        value={policy?.alias ?? ""}
                        onChange={(value) => updatePolicy(model, { alias: value })}
                        placeholder="e.g. Fast reasoner"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Language / locale
                      <Input
                        value={policy?.locale ?? ""}
                        onChange={(value) => updatePolicy(model, { locale: value })}
                        placeholder="e.g. en-US"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {tierOptions.map((tier) => {
                      const active = selectedTiers.includes(tier);
                      return (
                        <button
                          key={`${key}-${tier}`}
                          type="button"
                          className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.06em] ${
                            active
                              ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                              : "border-white/15 bg-black/20 text-slate-300"
                          }`}
                          onClick={() => toggleTier(model, tier)}
                        >
                          {tier}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span>Context: {formatContextWindow(model.contextWindow)}</span>
                    <span>Pricing: {formatPricing(model.pricing)}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {model.capabilities.length === 0 ? (
                      <Pill>no capabilities</Pill>
                    ) : (
                      model.capabilities.map((capability) => (
                        <Pill key={`${key}-${capability}`}>{capability}</Pill>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="Filters & health" subtitle="Model policy view controls" />

          <div className="space-y-2">
            <Input value={searchQuery} onChange={setSearchQuery} placeholder="Search model id or alias..." />

            <label className="text-xs text-slate-400">
              Capability
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-2 text-sm text-white"
                value={capabilityFilter}
                onChange={(event) => setCapabilityFilter(event.target.value)}
              >
                <option value="all">All capabilities</option>
                {availableCapabilities.map((capability) => (
                  <option key={capability} value={capability}>
                    {capability}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs text-slate-400">
              Status
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-2 text-sm text-white"
                value={enabledFilter}
                onChange={(event) => setEnabledFilter(event.target.value as "all" | "enabled" | "disabled")}
              >
                <option value="all">All models</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Providers</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{providerBuckets.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Models</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">{models.length}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Source</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-100">{source}</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
            Model policy edits are persisted locally for now and applied as tenant-side guidance.
            Backend sync endpoints are optional and can be added without breaking this UI.
          </div>
        </Panel>
      </div>
    </div>
  );
}
