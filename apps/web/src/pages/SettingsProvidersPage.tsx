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

const emptyDraft: RowDraft = {
  endpoint: "",
  authRef: "",
  apiKey: "",
  rpm: "",
  tpm: ""
};

const providerNameOptions = [...providerNames];

export function SettingsProvidersPage() {
  const { auth, authActions } = useAppStore();
  const mountedRef = useRef(true);
  const [items, setItems] = useState<ProviderConfig[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
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

  const hydrateModelOptions = useCallback((items: ProviderModel[]) => {
    const grouped = items.reduce<Record<string, Set<string>>>((acc, item) => {
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

  const templateAuthRef = (providerId: string): string => {
    if (providerId === "openai") return "env://OPENAI_API_KEY";
    if (providerId === "openrouter") return "env://OPENROUTER_API_KEY";
    return `secret://${providerId}/api-key`;
  };

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
        authActions.apiFetchJson<{ items?: Array<{
          provider: string;
          inputTokens: number;
          outputTokens: number;
          createdAt: string;
        }>; message?: string }>("/usage")
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
  }, [authActions, canManage, hydrateDrafts, hydrateModelOptions, hydrateRateLimits]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? body.item ?? entry : entry))
      );
      hydrateDrafts((items.map((entry) => (entry.id === item.id ? body.item ?? entry : entry))));
      const discoveredModels = body.models ?? body.availableModels;
      if (discoveredModels) {
        setProviderModelsByConfig((current) => ({
          ...current,
          [item.id]: [...new Set(discoveredModels)].sort((left, right) =>
            left.localeCompare(right)
          )
        }));
      }
      if (body.rateLimit) {
        setProviderRateLimitsByConfig((current) => ({
          ...current,
          [item.id]: {
            rpmUsed:
              typeof body.rateLimit?.rpm?.used === "number" ? body.rateLimit.rpm.used : 0,
            rpmLimit:
              typeof body.rateLimit?.rpm?.limit === "number" ? body.rateLimit.rpm.limit : null,
            tpmUsed:
              typeof body.rateLimit?.tpm?.used === "number" ? body.rateLimit.tpm.used : 0,
            tpmLimit:
              typeof body.rateLimit?.tpm?.limit === "number" ? body.rateLimit.tpm.limit : null
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
      }>(
        "/providers/defaults",
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
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

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) =>
        (left.providerId ?? left.provider).localeCompare(right.providerId ?? right.provider)
      ),
    [items]
  );

  const defaultProviderOptions = useMemo(
    () =>
      sortedItems.filter(
        (item) => item.enabled && item.validationStatus === "valid"
      ),
    [sortedItems]
  );

  const defaultModelOptions = useMemo(
    () => (defaultProviderConfigId ? providerModelsByConfig[defaultProviderConfigId] ?? [] : []),
    [defaultProviderConfigId, providerModelsByConfig]
  );

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Owner Provider Settings" subtitle="Tenant-scoped provider activation and credentials" />
        {!canManage ? (
          <p className="text-sm text-rose-300">
            Admin or owner role required when authentication is enabled.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      </Panel>

      <Panel>
        <SectionHeading title="Create Provider Config" subtitle="Owner-only write operation" />
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs text-slate-400">
            Provider
            <select
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
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
          <label className="text-xs text-slate-400">
            RPM
            <Input value={createRpm} onChange={setCreateRpm} placeholder="120" />
          </label>
          <label className="text-xs text-slate-400">
            TPM
            <Input value={createTpm} onChange={setCreateTpm} placeholder="200000" />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              if (saving || !canManage || loading) return;
              void createConfig();
            }}
          >
            Create
          </Button>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Default Provider" subtitle="Tenant default provider/model selection" />
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-xs text-slate-400">
            Default provider
            <select
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
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
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
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
          <div className="flex items-end justify-end">
            <Button
              variant="primary"
              onClick={() => {
                if (saving || !canManage || loading) return;
                void saveDefaults();
              }}
            >
              Save defaults
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Configured Providers" subtitle="Enable/disable + key rotation" />
        {loading ? <p className="text-sm text-slate-300">Loading provider configs…</p> : null}
        {!loading && sortedItems.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-4">
            <p className="text-sm text-slate-200">No providers configured</p>
            <p className="text-xs text-slate-400">
              Add at least one provider before running coding, chat, or research workloads.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (saving || !canManage) return;
                  void createProviderTemplate("openai");
                }}
              >
                Add OpenAI
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (saving || !canManage) return;
                  void createProviderTemplate("openrouter");
                }}
              >
                Add OpenRouter
              </Button>
            </div>
          </div>
        ) : null}
        {!loading && sortedItems.length > 0 ? (
          <div className="space-y-3">
            {sortedItems.map((item) => {
              const draft = drafts[item.id] ?? emptyDraft;
              const availableModels = providerModelsByConfig[item.id] ?? [];
              const rateLimit = providerRateLimitsByConfig[item.id] ?? {
                rpmUsed: 0,
                rpmLimit:
                  typeof item.requestsPerMinute === "number" && item.requestsPerMinute > 0
                    ? item.requestsPerMinute
                    : null,
                tpmUsed: 0,
                tpmLimit:
                  typeof item.tokensPerMinute === "number" && item.tokensPerMinute > 0
                    ? item.tokensPerMinute
                    : null
              };
              const connectionStatus =
                item.enabled && item.validationStatus === "valid"
                  ? "connected"
                  : item.validationStatus === "invalid"
                    ? "invalid"
                    : item.enabled
                      ? "pending"
                      : "disabled";
              return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-medium text-white">{item.providerId ?? item.provider}</div>
                    <div className="flex items-center gap-2">
                      <Pill tone={item.enabled ? "good" : "default"}>{item.enabled ? "enabled" : "disabled"}</Pill>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (saving || !canManage) return;
                          if (!item.enabled && item.validationStatus !== "valid") {
                            setNotice(
                              `Run Test connection first. ${item.providerId ?? item.provider} must be valid before enabling.`
                            );
                            return;
                          }
                          void patchConfig(item, { enabled: !item.enabled });
                        }}
                      >
                        {item.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (testingConfigId || !canManage) return;
                          void testConnection(item);
                        }}
                      >
                        {testingConfigId === item.id ? "Testing..." : "Test connection"}
                      </Button>
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <Pill tone={item.validationStatus === "valid" ? "good" : item.validationStatus === "invalid" ? "warn" : "default"}>
                      validation: {item.validationStatus ?? "unknown"}
                    </Pill>
                    <Pill tone={connectionStatus === "connected" ? "good" : connectionStatus === "invalid" ? "bad" : "default"}>
                      status: {connectionStatus}
                    </Pill>
                    <span>last check: {item.lastValidatedAt ? new Date(item.lastValidatedAt).toLocaleString() : "n/a"}</span>
                    {item.apiKeyMasked ? <span>key: {item.apiKeyMasked}</span> : null}
                    <span>
                      models:{" "}
                      {availableModels.length === 0
                        ? "n/a"
                        : availableModels.length <= 4
                          ? availableModels.join(", ")
                          : `${availableModels.slice(0, 4).join(", ")} +${availableModels.length - 4}`}
                    </span>
                    {item.validationError ? (
                      <span className="text-rose-300">error: {item.validationError}</span>
                    ) : null}
                    <span>
                      Rate limit: {rateLimit.rpmUsed}/{rateLimit.rpmLimit ?? "∞"} rpm, {rateLimit.tpmUsed}/
                      {rateLimit.tpmLimit ?? "∞"} tpm
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-5">
                    <label className="text-xs text-slate-400">
                      Endpoint
                      <Input
                        value={draft.endpoint}
                        onChange={(value) => updateDraft(item.id, { endpoint: value })}
                        placeholder="https://provider.endpoint/v1"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Auth ref
                      <Input
                        value={draft.authRef}
                        onChange={(value) => updateDraft(item.id, { authRef: value })}
                        placeholder="secret://provider/api-key"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Rotate API key
                      <Input
                        value={draft.apiKey}
                        onChange={(value) => updateDraft(item.id, { apiKey: value })}
                        placeholder="leave empty to keep current"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      RPM
                      <Input
                        value={draft.rpm}
                        onChange={(value) => updateDraft(item.id, { rpm: value })}
                        placeholder="0 = no limit"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      TPM
                      <Input
                        value={draft.tpm}
                        onChange={(value) => updateDraft(item.id, { tpm: value })}
                        placeholder="0 = no limit"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (saving || !canManage) return;
                        const nextPatch: Partial<ProviderConfig> = {};
                        const endpointValue = draft.endpoint.trim();
                        if (endpointValue.length > 0) {
                          nextPatch.endpoint = endpointValue;
                        }
                        const authRefValue = draft.authRef.trim();
                        if (authRefValue.length > 0) {
                          nextPatch.authRef = authRefValue;
                        }
                        const apiKeyValue = draft.apiKey.trim();
                        if (apiKeyValue.length > 0) {
                          nextPatch.apiKey = apiKeyValue;
                        }
                        if (draft.rpm.trim().length > 0) {
                          nextPatch.requestsPerMinute = Number.parseInt(draft.rpm, 10);
                        }
                        if (draft.tpm.trim().length > 0) {
                          nextPatch.tokensPerMinute = Number.parseInt(draft.tpm, 10);
                        }
                        void patchConfig(item, nextPatch);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeading title="Tenants" subtitle="Owner visibility" />
        {tenants.length === 0 ? (
          <p className="text-sm text-slate-300">Tenant list unavailable or restricted by role.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-medium text-white">{tenant.name}</div>
                <div className="text-xs text-slate-400">{tenant.id}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
