import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { providerNames, type ProviderConfig, type ProviderModel } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type TenantItem = {
  id: string;
  name: string;
};

type RowDraft = {
  endpoint: string;
  authRef: string;
  apiKey: string;
  rpm: string;
  tpm: string;
};

type ProviderDefaults = {
  defaultProviderConfigId?: string;
  defaultProvider?: string;
  defaultModelId?: string;
};

type ProviderRateLimitSnapshot = {
  rpmUsed: number;
  rpmLimit: number | null;
  tpmUsed: number;
  tpmLimit: number | null;
};

type MutationResponse = {
  success?: boolean;
  item?: ProviderConfig;
  message?: string;
};

type ConnectionFilter = "all" | "connected" | "attention" | "disabled";

const emptyDraft: RowDraft = {
  endpoint: "",
  authRef: "",
  apiKey: "",
  rpm: "",
  tpm: ""
};

const providerNameOptions = [...providerNames];
const providerOrderStorageKey = "cp.providers.catalog.order";

const readProviderOrder = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(providerOrderStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
};

const writeProviderOrder = (ids: string[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(providerOrderStorageKey, JSON.stringify(ids));
  } catch {
    // ignore persistence failures in restricted environments
  }
};

const templateAuthRef = (providerId: string): string => {
  if (providerId === "openai") return "env://OPENAI_API_KEY";
  if (providerId === "openrouter") return "env://OPENROUTER_API_KEY";
  return `secret://${providerId}/api-key`;
};

const resolveConnectionStatus = (item: ProviderConfig): "connected" | "invalid" | "pending" | "disabled" => {
  if (!item.enabled) return "disabled";
  if (item.validationStatus === "valid") return "connected";
  if (item.validationStatus === "invalid") return "invalid";
  return "pending";
};

const sortProviderCatalog = (items: ProviderConfig[], orderIds: string[]): ProviderConfig[] => {
  const orderMap = new Map(orderIds.map((id, index) => [id, index]));

  const configuredRank = (item: ProviderConfig): number => {
    const status = resolveConnectionStatus(item);
    if (status === "connected") return 0;
    if (status === "pending") return 1;
    if (status === "invalid") return 2;
    return 3;
  };

  return [...items].sort((left, right) => {
    const leftOrder = orderMap.get(left.id);
    const rightOrder = orderMap.get(right.id);

    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1;
      if (rightOrder === undefined) return -1;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }

    const leftRank = configuredRank(left);
    const rightRank = configuredRank(right);
    if (leftRank !== rightRank) return leftRank - rightRank;

    return (left.providerId ?? left.provider).localeCompare(right.providerId ?? right.provider);
  });
};

export function SettingsProvidersPage() {
  const { auth, authActions } = useAppStore();
  const mountedRef = useRef(true);

  const [items, setItems] = useState<ProviderConfig[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [providerOrder, setProviderOrder] = useState<string[]>(() => readProviderOrder());

  const [createProviderId, setCreateProviderId] = useState<string>("openai");
  const [createApiKey, setCreateApiKey] = useState<string>("");
  const [createAuthRef, setCreateAuthRef] = useState<string>("secret://openai/api-key");
  const [createEndpoint, setCreateEndpoint] = useState<string>("");
  const [createRpm, setCreateRpm] = useState<string>("");
  const [createTpm, setCreateTpm] = useState<string>("");

  const [providerModelsByConfig, setProviderModelsByConfig] = useState<Record<string, string[]>>({});
  const [providerRateLimitsByConfig, setProviderRateLimitsByConfig] = useState<Record<string, ProviderRateLimitSnapshot>>({});

  const [defaultProviderConfigId, setDefaultProviderConfigId] = useState<string>("");
  const [defaultModelId, setDefaultModelId] = useState<string>("");

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("all");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingConfigId, setTestingConfigId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const canManage =
    !auth.enabled ||
    Boolean(auth.principal?.roles.includes("owner") || auth.principal?.roles.includes("admin")) ||
    auth.principal?.tenantRole === "owner" ||
    auth.principal?.tenantRole === "admin";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    writeProviderOrder(providerOrder);
  }, [providerOrder]);

  const hydrateDrafts = useCallback((configs: ProviderConfig[]) => {
    setDrafts(
      Object.fromEntries(
        configs.map((config) => [
          config.id,
          {
            endpoint: config.endpoint ?? "",
            authRef: config.authRef,
            apiKey: "",
            rpm:
              typeof config.requestsPerMinute === "number" && config.requestsPerMinute > 0
                ? String(config.requestsPerMinute)
                : "",
            tpm:
              typeof config.tokensPerMinute === "number" && config.tokensPerMinute > 0
                ? String(config.tokensPerMinute)
                : ""
          } satisfies RowDraft
        ])
      )
    );
  }, []);

  const hydrateModelOptions = useCallback((models: ProviderModel[]) => {
    const grouped = models.reduce<Record<string, Set<string>>>((acc, item) => {
      if (!acc[item.providerConfigId]) {
        acc[item.providerConfigId] = new Set<string>();
      }
      acc[item.providerConfigId]?.add(item.modelId);
      return acc;
    }, {});

    setProviderModelsByConfig(
      Object.fromEntries(
        Object.entries(grouped).map(([providerConfigId, modelIds]) => [
          providerConfigId,
          [...modelIds].sort((left, right) => left.localeCompare(right))
        ])
      )
    );
  }, []);

  const hydrateRateLimits = useCallback(
    (
      configs: ProviderConfig[],
      usageItems: Array<{ provider: string; inputTokens: number; outputTokens: number; createdAt: string }>
    ) => {
      const cutoff = Date.now() - 60_000;
      const usageByProvider = usageItems.reduce<Record<string, { rpm: number; tpm: number }>>((acc, item) => {
        const occurredAt = Date.parse(item.createdAt);
        if (Number.isNaN(occurredAt) || occurredAt < cutoff) return acc;
        const providerKey = item.provider.trim().toLowerCase();
        const current = acc[providerKey] ?? { rpm: 0, tpm: 0 };
        current.rpm += 1;
        current.tpm += Math.max(0, item.inputTokens + item.outputTokens);
        acc[providerKey] = current;
        return acc;
      }, {});

      setProviderRateLimitsByConfig(
        Object.fromEntries(
          configs.map((config) => {
            const providerKey = (config.providerId ?? config.provider).trim().toLowerCase();
            const usage = usageByProvider[providerKey] ?? { rpm: 0, tpm: 0 };
            return [
              config.id,
              {
                rpmUsed: usage.rpm,
                rpmLimit:
                  typeof config.requestsPerMinute === "number" && config.requestsPerMinute > 0
                    ? config.requestsPerMinute
                    : null,
                tpmUsed: usage.tpm,
                tpmLimit:
                  typeof config.tokensPerMinute === "number" && config.tokensPerMinute > 0
                    ? config.tokensPerMinute
                    : null
              } satisfies ProviderRateLimitSnapshot
            ];
          })
        )
      );
    },
    []
  );

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    if (!canManage) {
      setItems([]);
      setTenants([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const [providersResponse, modelsResponse, defaultsResponse, tenantsResponse, usageResponse] = await Promise.all([
        authActions.apiFetchJson<{ items?: ProviderConfig[]; message?: string }>("/providers/config"),
        authActions.apiFetchJson<{ items?: ProviderModel[]; message?: string }>("/providers/models?includeDisabled=1"),
        authActions.apiFetchJson<{ item?: ProviderDefaults; message?: string }>("/providers/defaults"),
        authActions.apiFetchJson<{ items?: TenantItem[]; message?: string }>("/tenants"),
        authActions.apiFetchJson<{
          items?: Array<{
            provider: string;
            inputTokens: number;
            outputTokens: number;
            createdAt: string;
          }>;
          message?: string;
        }>("/usage")
      ]);

      if (!providersResponse.response.ok) {
        throw new Error(
          providersResponse.body.message ??
            `Unable to load provider configs (HTTP ${providersResponse.response.status})`
        );
      }
      if (!mountedRef.current) return;

      const nextItems = providersResponse.body.items ?? [];
      setItems(nextItems);
      hydrateDrafts(nextItems);
      hydrateModelOptions(modelsResponse.body.items ?? []);
      hydrateRateLimits(nextItems, usageResponse.response.ok ? usageResponse.body.items ?? [] : []);

      const mergedOrder = [
        ...providerOrder.filter((id) => nextItems.some((item) => item.id === id)),
        ...nextItems.map((item) => item.id).filter((id) => !providerOrder.includes(id))
      ];
      setProviderOrder(mergedOrder);

      if (tenantsResponse.response.ok) {
        setTenants(tenantsResponse.body.items ?? []);
      } else {
        setTenants([]);
      }

      if (defaultsResponse.response.ok) {
        const defaults = defaultsResponse.body.item;
        setDefaultProviderConfigId(defaults?.defaultProviderConfigId ?? "");
        setDefaultModelId(defaults?.defaultModelId ?? "");
      } else {
        setDefaultProviderConfigId("");
        setDefaultModelId("");
      }
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load owner provider settings.");
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [authActions, canManage, hydrateDrafts, hydrateModelOptions, hydrateRateLimits, providerOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(() => sortProviderCatalog(items, providerOrder), [items, providerOrder]);

  const filteredItems = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return sortedItems.filter((item) => {
      const status = resolveConnectionStatus(item);
      if (connectionFilter === "connected" && status !== "connected") return false;
      if (connectionFilter === "attention" && (status === "connected" || status === "disabled")) return false;
      if (connectionFilter === "disabled" && status !== "disabled") return false;
      if (!normalized) return true;
      const label = `${item.providerId ?? item.provider} ${item.authRef} ${item.endpoint ?? ""}`.toLowerCase();
      return label.includes(normalized);
    });
  }, [connectionFilter, searchQuery, sortedItems]);

  useEffect(() => {
    if (!selectedProviderId || !filteredItems.some((item) => item.id === selectedProviderId)) {
      setSelectedProviderId(filteredItems[0]?.id ?? "");
    }
  }, [filteredItems, selectedProviderId]);

  const selectedProvider = useMemo(
    () => filteredItems.find((item) => item.id === selectedProviderId) ?? sortedItems[0],
    [filteredItems, selectedProviderId, sortedItems]
  );

  const selectedDraft = selectedProvider ? drafts[selectedProvider.id] ?? emptyDraft : emptyDraft;
  const selectedModels = selectedProvider ? providerModelsByConfig[selectedProvider.id] ?? [] : [];

  const defaultProviderOptions = useMemo(
    () => sortedItems.filter((item) => item.enabled && item.validationStatus === "valid"),
    [sortedItems]
  );

  const defaultModelOptions = useMemo(
    () => (defaultProviderConfigId ? providerModelsByConfig[defaultProviderConfigId] ?? [] : []),
    [defaultProviderConfigId, providerModelsByConfig]
  );

  const statusSummary = useMemo(() => {
    return sortedItems.reduce(
      (acc, item) => {
        const status = resolveConnectionStatus(item);
        if (status === "connected") acc.connected += 1;
        if (status === "disabled") acc.disabled += 1;
        if (status === "invalid" || status === "pending") acc.attention += 1;
        return acc;
      },
      { connected: 0, attention: 0, disabled: 0 }
    );
  }, [sortedItems]);

  const updateDraft = (id: string, patch: Partial<RowDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyDraft),
        ...patch
      }
    }));
  };

  const createConfig = async (): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await authActions.apiFetch("/providers/config", {
        method: "POST",
        body: JSON.stringify({
          providerId: createProviderId,
          ...(createApiKey.trim().length > 0 ? { apiKey: createApiKey.trim() } : {}),
          ...(createAuthRef.trim().length > 0 ? { authRef: createAuthRef.trim() } : {}),
          ...(createEndpoint.trim().length > 0 ? { endpoint: createEndpoint.trim() } : {}),
          ...(createRpm.trim().length > 0 ? { rpm: Number.parseInt(createRpm, 10) } : {}),
          ...(createTpm.trim().length > 0 ? { tpm: Number.parseInt(createTpm, 10) } : {}),
          enabled: true
        })
      });
      const body = (await response.json()) as MutationResponse;
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to create provider config (HTTP ${response.status})`);
      }
      if (body.success === false) {
        throw new Error(body.message ?? "Unable to create provider config.");
      }

      setCreateApiKey("");
      setCreateEndpoint("");
      setCreateRpm("");
      setCreateTpm("");
      setNotice(`Provider config created for ${createProviderId}.`);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create provider config.");
    } finally {
      setSaving(false);
    }
  };

  const createProviderTemplate = async (providerId: string): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await authActions.apiFetch("/providers/config", {
        method: "POST",
        body: JSON.stringify({
          providerId,
          authRef: templateAuthRef(providerId),
          enabled: false
        })
      });
      const body = (await response.json()) as MutationResponse;
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to create provider template (HTTP ${response.status})`);
      }
      if (body.success === false) {
        throw new Error(body.message ?? "Unable to create provider template.");
      }
      setNotice(`Provider template created for ${providerId}. Add credentials and test connection.`);
      await load();
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "Unable to create provider template.");
    } finally {
      setSaving(false);
    }
  };

  const patchConfig = async (item: ProviderConfig, patch: Partial<ProviderConfig>): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await authActions.apiFetch(`/providers/config/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      const body = (await response.json()) as MutationResponse;
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to update provider config (HTTP ${response.status})`);
      }
      if (body.success === false) {
        throw new Error(body.message ?? "Unable to update provider config.");
      }
      setNotice(`Provider config ${item.providerId ?? item.provider} updated.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update provider config.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (item: ProviderConfig): Promise<void> => {
    if (!canManage) return;
    setTestingConfigId(item.id);
    setError(undefined);
    setNotice(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{
        success?: boolean;
        status?: "ok" | "error";
        latencyMs?: number;
        models?: string[];
        error?: string;
        rateLimit?: {
          rpm?: { used?: number; limit?: number | null };
          tpm?: { used?: number; limit?: number | null };
        };
        item?: ProviderConfig;
        availableModels?: string[];
        message?: string;
      }>(`/providers/config/${item.id}/test`, { method: "POST" });

      if (!response.ok) {
        throw new Error(body.message ?? `Unable to test provider config (HTTP ${response.status})`);
      }
      if (body.success === false) {
        throw new Error(body.message ?? `Connection test failed for ${item.providerId ?? item.provider}.`);
      }
      if (!body.item) {
        throw new Error("Provider test response missing item payload.");
      }

      setItems((current) => current.map((entry) => (entry.id === item.id ? body.item ?? entry : entry)));
      hydrateDrafts(items.map((entry) => (entry.id === item.id ? body.item ?? entry : entry)));

      const discoveredModels = body.models ?? body.availableModels;
      if (discoveredModels) {
        setProviderModelsByConfig((current) => ({
          ...current,
          [item.id]: [...new Set(discoveredModels)].sort((left, right) => left.localeCompare(right))
        }));
      }

      if (body.rateLimit) {
        setProviderRateLimitsByConfig((current) => ({
          ...current,
          [item.id]: {
            rpmUsed: typeof body.rateLimit?.rpm?.used === "number" ? body.rateLimit.rpm.used : 0,
            rpmLimit: typeof body.rateLimit?.rpm?.limit === "number" ? body.rateLimit.rpm.limit : null,
            tpmUsed: typeof body.rateLimit?.tpm?.used === "number" ? body.rateLimit.tpm.used : 0,
            tpmLimit: typeof body.rateLimit?.tpm?.limit === "number" ? body.rateLimit.tpm.limit : null
          }
        }));
      }

      setNotice(
        body.status === "ok"
          ? `Connection successful for ${item.providerId ?? item.provider} (${body.latencyMs ?? 0}ms).`
          : `Connection failed for ${item.providerId ?? item.provider}${body.error ? `: ${body.error}` : "."}`
      );

      await load();
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Unable to test provider config.");
    } finally {
      setTestingConfigId(undefined);
    }
  };

  const saveDefaults = async (): Promise<void> => {
    if (!canManage || saving) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload: { defaultProviderConfigId?: string | null; defaultModelId?: string | null } = {};
      if (defaultProviderConfigId) {
        payload.defaultProviderConfigId = defaultProviderConfigId;
        payload.defaultModelId = defaultModelId || null;
      } else {
        payload.defaultProviderConfigId = null;
        payload.defaultModelId = null;
      }

      const { response, body } = await authActions.apiFetchJson<{
        item?: ProviderDefaults;
        success?: boolean;
        message?: string;
      }>("/providers/defaults", {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(body.message ?? `Unable to save defaults (HTTP ${response.status})`);
      }
      if (body.success === false) {
        throw new Error(body.message ?? "Unable to save defaults.");
      }

      setNotice(defaultProviderConfigId ? "Default provider settings saved." : "Default provider settings cleared.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save defaults.");
    } finally {
      setSaving(false);
    }
  };

  const moveProvider = (id: string, direction: "up" | "down"): void => {
    setProviderOrder((current) => {
      const scoped = current.filter((itemId) => sortedItems.some((item) => item.id === itemId));
      const complete = [
        ...scoped,
        ...sortedItems.map((item) => item.id).filter((itemId) => !scoped.includes(itemId))
      ];
      const index = complete.indexOf(id);
      if (index < 0) return complete;
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= complete.length) return complete;
      const next = [...complete];
      const currentItem = next[index];
      const targetItem = next[swapIndex];
      if (!currentItem || !targetItem) return complete;
      next[index] = targetItem;
      next[swapIndex] = currentItem;
      return next;
    });
  };

  const persistSelectedProvider = (): void => {
    if (!selectedProvider || saving || !canManage) return;

    const nextPatch: Partial<ProviderConfig> = {};
    const endpointValue = selectedDraft.endpoint.trim();
    if (endpointValue.length > 0) {
      nextPatch.endpoint = endpointValue;
    }
    const authRefValue = selectedDraft.authRef.trim();
    if (authRefValue.length > 0) {
      nextPatch.authRef = authRefValue;
    }
    const apiKeyValue = selectedDraft.apiKey.trim();
    if (apiKeyValue.length > 0) {
      nextPatch.apiKey = apiKeyValue;
    }
    if (selectedDraft.rpm.trim().length > 0) {
      nextPatch.requestsPerMinute = Number.parseInt(selectedDraft.rpm, 10);
    }
    if (selectedDraft.tpm.trim().length > 0) {
      nextPatch.tokensPerMinute = Number.parseInt(selectedDraft.tpm, 10);
    }

    void patchConfig(selectedProvider, nextPatch);
  };

  const selectedRate = selectedProvider
    ? providerRateLimitsByConfig[selectedProvider.id] ?? {
        rpmUsed: 0,
        rpmLimit:
          typeof selectedProvider.requestsPerMinute === "number" && selectedProvider.requestsPerMinute > 0
            ? selectedProvider.requestsPerMinute
            : null,
        tpmUsed: 0,
        tpmLimit:
          typeof selectedProvider.tokensPerMinute === "number" && selectedProvider.tokensPerMinute > 0
            ? selectedProvider.tokensPerMinute
            : null
      }
    : undefined;

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Owner Provider Settings" subtitle="Provider catalog, configuration and runtime health" />
        {!canManage ? (
          <p className="text-sm text-rose-300">Admin or owner role required when authentication is enabled.</p>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Panel>
          <SectionHeading title="Provider Catalog" subtitle="Configured providers first" />
          <div className="mb-3 space-y-2">
            <Input value={searchQuery} onChange={setSearchQuery} placeholder="Search provider, auth ref, endpoint..." />
            <select
              value={connectionFilter}
              onChange={(event) => setConnectionFilter(event.target.value as ConnectionFilter)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="all">All statuses</option>
              <option value="connected">Connected</option>
              <option value="attention">Needs attention</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          <div className="space-y-2">
            {loading ? <p className="text-sm text-slate-300">Loading provider configs…</p> : null}
            {!loading && filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-3 text-sm text-slate-300">
                No providers match this filter.
              </div>
            ) : null}
            {filteredItems.map((item, index) => {
              const status = resolveConnectionStatus(item);
              const selected = selectedProvider?.id === item.id;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-cyan-400/40 bg-cyan-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                  onClick={() => setSelectedProviderId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedProviderId(item.id);
                    }
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{item.providerId ?? item.provider}</div>
                    <Pill tone={status === "connected" ? "good" : status === "invalid" ? "bad" : "default"}>
                      {status}
                    </Pill>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {item.enabled ? "enabled" : "disabled"} · {providerModelsByConfig[item.id]?.length ?? 0} models
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveProvider(item.id, "up");
                      }}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveProvider(item.id, "down");
                      }}
                      disabled={index === filteredItems.length - 1}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Quick templates</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void createProviderTemplate("openai")}>
                Add OpenAI
              </Button>
              <Button variant="secondary" onClick={() => void createProviderTemplate("openrouter")}>
                Add OpenRouter
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeading
            title="Provider Configuration"
            subtitle={selectedProvider ? `${selectedProvider.providerId ?? selectedProvider.provider} selected` : "Select a provider"}
            action={
              <Link
                to="/settings/models"
                className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-cyan-100"
              >
                Open Models Policy
              </Link>
            }
          />

          {!selectedProvider ? (
            <p className="text-sm text-slate-300">Select a provider from the catalog to configure it.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Endpoint
                  <Input
                    value={selectedDraft.endpoint}
                    onChange={(value) => updateDraft(selectedProvider.id, { endpoint: value })}
                    placeholder="https://provider.endpoint/v1"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Auth ref
                  <Input
                    value={selectedDraft.authRef}
                    onChange={(value) => updateDraft(selectedProvider.id, { authRef: value })}
                    placeholder="secret://provider/api-key"
                  />
                </label>
                <label className="text-xs text-slate-400 md:col-span-2">
                  Rotate API key
                  <Input
                    value={selectedDraft.apiKey}
                    onChange={(value) => updateDraft(selectedProvider.id, { apiKey: value })}
                    placeholder="Leave empty to keep current key"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={selectedProvider.enabled ? "good" : "default"}>
                  {selectedProvider.enabled ? "enabled" : "disabled"}
                </Pill>
                <Pill tone={selectedProvider.validationStatus === "valid" ? "good" : selectedProvider.validationStatus === "invalid" ? "warn" : "default"}>
                  validation: {selectedProvider.validationStatus ?? "unknown"}
                </Pill>
                <span className="text-xs text-slate-400">
                  last check: {selectedProvider.lastValidatedAt ? new Date(selectedProvider.lastValidatedAt).toLocaleString() : "n/a"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={persistSelectedProvider}>
                  Save config
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (testingConfigId || !canManage) return;
                    void testConnection(selectedProvider);
                  }}
                >
                  {testingConfigId === selectedProvider.id ? "Testing..." : "Test connection"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (saving || !canManage) return;
                    if (!selectedProvider.enabled && selectedProvider.validationStatus !== "valid") {
                      setNotice(
                        `Run Test connection first. ${selectedProvider.providerId ?? selectedProvider.provider} must be valid before enabling.`
                      );
                      return;
                    }
                    void patchConfig(selectedProvider, { enabled: !selectedProvider.enabled });
                  }}
                >
                  {selectedProvider.enabled ? "Disable" : "Enable"}
                </Button>
              </div>

              <details className="rounded-xl border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-100">Advanced</summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    RPM
                    <Input
                      value={selectedDraft.rpm}
                      onChange={(value) => updateDraft(selectedProvider.id, { rpm: value })}
                      placeholder="0 = no limit"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    TPM
                    <Input
                      value={selectedDraft.tpm}
                      onChange={(value) => updateDraft(selectedProvider.id, { tpm: value })}
                      placeholder="0 = no limit"
                    />
                  </label>
                  <div className="md:col-span-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
                    {selectedRate
                      ? `Rate limit snapshot: ${selectedRate.rpmUsed}/${selectedRate.rpmLimit ?? "∞"} rpm, ${selectedRate.tpmUsed}/${selectedRate.tpmLimit ?? "∞"} tpm`
                      : "Rate limits unavailable."}
                  </div>
                  {selectedProvider.validationError ? (
                    <div className="md:col-span-2 rounded-lg border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-200">
                      {selectedProvider.validationError}
                    </div>
                  ) : null}
                </div>
              </details>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Visible models</div>
                <div className="mt-2 text-sm text-slate-200">
                  {selectedModels.length === 0 ? "No models discovered yet." : selectedModels.join(", ")}
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeading title="Status & Defaults" subtitle="Filters, defaults and quick create" />

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Connected</div>
              <div className="mt-1 text-xl font-semibold text-emerald-200">{statusSummary.connected}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Attention</div>
              <div className="mt-1 text-xl font-semibold text-amber-200">{statusSummary.attention}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Disabled</div>
              <div className="mt-1 text-xl font-semibold text-slate-200">{statusSummary.disabled}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Default provider policy</div>
            <label className="text-xs text-slate-400">
              Default provider
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-2 text-sm text-white"
                value={defaultProviderConfigId}
                onChange={(event) => {
                  const next = event.target.value;
                  setDefaultProviderConfigId(next);
                  const nextModels = next ? providerModelsByConfig[next] ?? [] : [];
                  setDefaultModelId(nextModels[0] ?? "");
                }}
              >
                <option value="">None</option>
                {defaultProviderOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.providerId ?? item.provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Default model
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-2 text-sm text-white"
                value={defaultModelId}
                onChange={(event) => setDefaultModelId(event.target.value)}
              >
                <option value="">Auto-select first available</option>
                {defaultModelOptions.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="primary" onClick={() => void saveDefaults()}>
              Save defaults
            </Button>
          </div>

          <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-100">Create provider config</summary>
            <div className="mt-3 grid gap-2">
              <label className="text-xs text-slate-400">
                Provider
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-2 text-sm text-white"
                  value={createProviderId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCreateProviderId(next);
                    setCreateAuthRef(`secret://${next}/api-key`);
                  }}
                >
                  {providerNameOptions.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                API key / ref
                <Input value={createApiKey} onChange={setCreateApiKey} placeholder="env://OPENAI_API_KEY" />
              </label>
              <label className="text-xs text-slate-400">
                Auth ref
                <Input value={createAuthRef} onChange={setCreateAuthRef} placeholder="secret://openai/api-key" />
              </label>
              <label className="text-xs text-slate-400">
                Endpoint
                <Input value={createEndpoint} onChange={setCreateEndpoint} placeholder="https://api.openai.com/v1" />
              </label>
              <div className="grid gap-2 grid-cols-2">
                <label className="text-xs text-slate-400">
                  RPM
                  <Input value={createRpm} onChange={setCreateRpm} placeholder="120" />
                </label>
                <label className="text-xs text-slate-400">
                  TPM
                  <Input value={createTpm} onChange={setCreateTpm} placeholder="200000" />
                </label>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  if (saving || !canManage || loading) return;
                  void createConfig();
                }}
              >
                Create provider
              </Button>
            </div>
          </details>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Tenant visibility</div>
            {tenants.length === 0 ? (
              <p className="mt-2 text-sm text-slate-300">Tenant list unavailable or restricted by role.</p>
            ) : (
              <div className="mt-2 space-y-1 text-sm text-slate-200">
                {tenants.slice(0, 6).map((tenant) => (
                  <div key={tenant.id} className="flex items-center justify-between gap-2">
                    <span>{tenant.name}</span>
                    <span className="text-xs text-slate-400">{tenant.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
