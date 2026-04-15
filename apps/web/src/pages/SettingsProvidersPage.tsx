import { useCallback, useEffect, useMemo, useState } from "react";
import { providerNames, type ProviderConfig } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { getOwnerMode, onOwnerModeChange } from "@/owner-mode";
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
  const [ownerMode, setOwnerMode] = useState<boolean>(() => getOwnerMode());
  const [items, setItems] = useState<ProviderConfig[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [createProviderId, setCreateProviderId] = useState<string>("openai");
  const [createApiKey, setCreateApiKey] = useState<string>("");
  const [createAuthRef, setCreateAuthRef] = useState<string>("secret://openai/api-key");
  const [createEndpoint, setCreateEndpoint] = useState<string>("");
  const [createRpm, setCreateRpm] = useState<string>("");
  const [createTpm, setCreateTpm] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const canManage = !auth.enabled || Boolean(auth.principal?.roles.includes("admin"));

  useEffect(() => onOwnerModeChange(setOwnerMode), []);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const providersResponse = await authActions.apiFetchJson<{ items?: ProviderConfig[]; message?: string }>(
        "/providers/config"
      );
      if (!providersResponse.response.ok) {
        throw new Error(
          providersResponse.body.message ??
            `Unable to load provider configs (HTTP ${providersResponse.response.status})`
        );
      }
      const nextItems = providersResponse.body.items ?? [];
      setItems(nextItems);
      hydrateDrafts(nextItems);

      const tenantsResponse = await authActions.apiFetchJson<{ items?: TenantItem[]; message?: string }>(
        "/tenants"
      );
      if (tenantsResponse.response.ok) {
        setTenants(tenantsResponse.body.items ?? []);
      } else {
        setTenants([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load owner provider settings.");
    } finally {
      setLoading(false);
    }
  }, [authActions, hydrateDrafts]);

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
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to create provider config (HTTP ${response.status})`);
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
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to update provider config (HTTP ${response.status})`);
      }
      setNotice(`Provider config ${item.providerId ?? item.provider} updated.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update provider config.");
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

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Owner Provider Settings" subtitle="Tenant-scoped provider activation and credentials" />
        {!ownerMode ? (
          <p className="text-sm text-amber-300">
            Owner mode is currently disabled. Enable it in Settings to expose owner navigation shortcuts.
          </p>
        ) : null}
        {!canManage ? (
          <p className="text-sm text-rose-300">
            Admin role required when authentication is enabled.
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
        <SectionHeading title="Configured Providers" subtitle="Enable/disable + key rotation" />
        {loading ? <p className="text-sm text-slate-300">Loading provider configs…</p> : null}
        {!loading && sortedItems.length === 0 ? <p className="text-sm text-slate-300">No provider configs found.</p> : null}
        {!loading && sortedItems.length > 0 ? (
          <div className="space-y-3">
            {sortedItems.map((item) => {
              const draft = drafts[item.id] ?? emptyDraft;
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
                          void patchConfig(item, { enabled: !item.enabled });
                        }}
                      >
                        {item.enabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <Pill tone={item.validationStatus === "valid" ? "good" : item.validationStatus === "invalid" ? "warn" : "default"}>
                      validation: {item.validationStatus ?? "unknown"}
                    </Pill>
                    <span>last check: {item.lastValidatedAt ? new Date(item.lastValidatedAt).toLocaleString() : "n/a"}</span>
                    {item.apiKeyMasked ? <span>key: {item.apiKeyMasked}</span> : null}
                    {item.validationError ? (
                      <span className="text-rose-300">error: {item.validationError}</span>
                    ) : null}
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
