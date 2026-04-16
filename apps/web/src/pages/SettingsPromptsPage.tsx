import { useCallback, useEffect, useMemo, useState } from "react";
import type { PromptRegistryEntry, PromptRegistryScope, PromptRegistryStatus } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { getOwnerMode, onOwnerModeChange } from "@/owner-mode";
import { useAppStore } from "@/store/app-store";

type PromptDraft = {
  type: string;
  scope: PromptRegistryScope;
  target: string;
  version: string;
  content: string;
  status: PromptRegistryStatus;
  tenantId: string;
  projectId: string;
  metadataRaw: string;
};

const emptyDraft = (scope: PromptRegistryScope = "tenant"): PromptDraft => ({
  type: "planner",
  scope,
  target: "default",
  version: "v1",
  content: "",
  status: "draft",
  tenantId: "",
  projectId: "",
  metadataRaw: "{\n  \"source\": \"manual\"\n}"
});

const parseMetadata = (raw: string): Record<string, unknown> | undefined => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  return parsed;
};

export function SettingsPromptsPage() {
  const { auth, authActions } = useAppStore();
  const [ownerMode, setOwnerMode] = useState<boolean>(() => getOwnerMode());
  const [items, setItems] = useState<PromptRegistryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [scopeFilter, setScopeFilter] = useState<PromptRegistryScope | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PromptRegistryStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [draft, setDraft] = useState<PromptDraft>(emptyDraft());

  const canManage =
    !auth.enabled ||
    Boolean(auth.principal?.roles.includes("owner") || auth.principal?.roles.includes("admin"));

  useEffect(() => onOwnerModeChange(setOwnerMode), []);

  const hydrateDraft = useCallback((item: PromptRegistryEntry | undefined) => {
    if (!item) {
      setDraft(emptyDraft(scopeFilter === "all" ? "tenant" : scopeFilter));
      return;
    }
    setDraft({
      type: item.type,
      scope: item.scope,
      target: item.target,
      version: item.version,
      content: item.content,
      status: item.status,
      tenantId: item.tenantId ?? "",
      projectId: item.projectId ?? "",
      metadataRaw: item.metadata ? JSON.stringify(item.metadata, null, 2) : ""
    });
  }, [scopeFilter]);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);

  useEffect(() => {
    hydrateDraft(selectedItem);
  }, [hydrateDraft, selectedItem]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams();
      if (scopeFilter !== "all") params.set("scope", scopeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter.trim()) params.set("type", typeFilter.trim());
      const query = params.toString();
      const { response, body } = await authActions.apiFetchJson<{ items?: PromptRegistryEntry[]; message?: string }>(
        `/prompts${query ? `?${query}` : ""}`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load prompt registry (HTTP ${response.status})`);
      }
      const nextItems = body.items ?? [];
      setItems(nextItems);
      if (!selectedId && nextItems[0]?.id) {
        setSelectedId(nextItems[0].id);
      } else if (selectedId && !nextItems.some((item) => item.id === selectedId)) {
        setSelectedId(nextItems[0]?.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load prompt registry.");
    } finally {
      setLoading(false);
    }
  }, [authActions, scopeFilter, selectedId, statusFilter, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload = {
        type: draft.type.trim(),
        scope: draft.scope,
        target: draft.target.trim(),
        version: draft.version.trim(),
        content: draft.content,
        status: draft.status,
        ...(draft.scope !== "system" ? { tenantId: draft.tenantId.trim() || undefined } : {}),
        ...(draft.scope === "project" ? { projectId: draft.projectId.trim() || undefined } : {}),
        ...(parseMetadata(draft.metadataRaw) ? { metadata: parseMetadata(draft.metadataRaw) } : {})
      };
      if (selectedItem) {
        const { response, body } = await authActions.apiFetchJson<{ item?: PromptRegistryEntry; message?: string }>(
          `/prompts/${selectedItem.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to update prompt (HTTP ${response.status})`);
        }
        setSelectedId(body.item.id);
        setNotice(`Prompt ${body.item.target} updated.`);
      } else {
        const { response, body } = await authActions.apiFetchJson<{ item?: PromptRegistryEntry; message?: string }>(
          "/prompts",
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to create prompt (HTTP ${response.status})`);
        }
        setSelectedId(body.item.id);
        setNotice(`Prompt ${body.item.target} created.`);
      }
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save prompt.");
    } finally {
      setSaving(false);
    }
  };

  const activate = async (item: PromptRegistryEntry): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ item?: PromptRegistryEntry; message?: string }>(
        `/prompts/${item.id}/activate`,
        { method: "POST" }
      );
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to activate prompt (HTTP ${response.status})`);
      }
      setSelectedId(body.item.id);
      setNotice(`Prompt ${body.item.target} activated.`);
      await load();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Unable to activate prompt.");
    } finally {
      setSaving(false);
    }
  };

  const deprecate = async (item: PromptRegistryEntry): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ item?: PromptRegistryEntry; message?: string }>(
        `/prompts/${item.id}/deprecate`,
        { method: "POST" }
      );
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to deprecate prompt (HTTP ${response.status})`);
      }
      setSelectedId(body.item.id);
      setNotice(`Prompt ${body.item.target} deprecated.`);
      await load();
    } catch (deprecateError) {
      setError(deprecateError instanceof Error ? deprecateError.message : "Unable to deprecate prompt.");
    } finally {
      setSaving(false);
    }
  };

  const visibleItems = useMemo(
    () => [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [items]
  );

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title="Prompt Registry" subtitle="Governed prompt versions and overrides" />
        {!ownerMode ? (
          <p className="text-sm text-[color:var(--muted)]">
            Owner mode is disabled. The registry is still visible for inspection.
          </p>
        ) : null}
        {!canManage ? (
          <p className="text-sm text-[color:var(--muted)]">
            Owner privileges are required to mutate prompt records when authentication is enabled.
          </p>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="space-y-3">
          <SectionHeading
            title="Registry Filters"
            subtitle="Scope, status and type"
            action={
              <Button variant="secondary" onClick={() => void load()}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            }
          />
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Scope
            <select
              className="cp-input mt-1"
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value as PromptRegistryScope | "all")}
            >
              <option value="all">all</option>
              <option value="system">system</option>
              <option value="tenant">tenant</option>
              <option value="project">project</option>
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Status
            <select
              className="cp-input mt-1"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as PromptRegistryStatus | "all")}
            >
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="draft">draft</option>
              <option value="deprecated">deprecated</option>
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Type
            <Input value={typeFilter} onChange={setTypeFilter} placeholder="planner" />
          </label>
          <div className="space-y-2">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`w-full border px-3 py-2 text-left transition ${
                  selectedId === item.id
                    ? "border-[color:var(--accent)] bg-[color:var(--panel2)]"
                    : "border-[color:var(--line)] bg-[color:var(--panel)]"
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[color:var(--text)]">{item.type}</div>
                  <Pill tone={item.status === "active" ? "good" : item.status === "draft" ? "accent" : "warn"}>
                    {item.status}
                  </Pill>
                </div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {item.target} · v{item.version} · {item.scope}
                </div>
              </button>
            ))}
            {visibleItems.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">No prompt records found.</div>
            ) : null}
          </div>
        </Panel>

        <Panel className="space-y-4">
          <SectionHeading
            title={selectedItem ? `Edit Prompt ${selectedItem.id}` : "Create Prompt"}
            subtitle="Versioned prompt content and activation state"
            action={
              <div className="flex flex-wrap gap-2">
                {selectedItem ? (
                  <>
                    <Button variant="secondary" onClick={() => void activate(selectedItem)}>{saving ? "Working..." : "Activate"}</Button>
                    <Button variant="secondary" onClick={() => void deprecate(selectedItem)}>{saving ? "Working..." : "Deprecate"}</Button>
                  </>
                ) : null}
                <Button variant="primary" onClick={() => void save()}>{saving ? "Saving..." : "Save"}</Button>
              </div>
            }
          />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Type
              <Input value={draft.type} onChange={(value) => setDraft((current) => ({ ...current, type: value }))} />
            </label>
            <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Scope
              <select
                className="cp-input mt-1"
                value={draft.scope}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scope: event.target.value as PromptRegistryScope
                  }))
                }
              >
                <option value="system">system</option>
                <option value="tenant">tenant</option>
                <option value="project">project</option>
              </select>
            </label>
            <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Target
              <Input value={draft.target} onChange={(value) => setDraft((current) => ({ ...current, target: value }))} />
            </label>
            <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Version
              <Input value={draft.version} onChange={(value) => setDraft((current) => ({ ...current, version: value }))} />
            </label>
            <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Status
              <select
                className="cp-input mt-1"
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as PromptRegistryStatus
                  }))
                }
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="deprecated">deprecated</option>
              </select>
            </label>
            {draft.scope !== "system" ? (
              <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
                Tenant ID
                <Input value={draft.tenantId} onChange={(value) => setDraft((current) => ({ ...current, tenantId: value }))} />
              </label>
            ) : null}
            {draft.scope === "project" ? (
              <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
                Project ID
                <Input value={draft.projectId} onChange={(value) => setDraft((current) => ({ ...current, projectId: value }))} />
              </label>
            ) : null}
          </div>

          <label className="block text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Prompt content
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              className="cp-input mt-1 min-h-[220px] w-full"
            />
          </label>

          <label className="block text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Metadata JSON
            <textarea
              value={draft.metadataRaw}
              onChange={(event) => setDraft((current) => ({ ...current, metadataRaw: event.target.value }))}
              className="cp-input mt-1 min-h-[120px] w-full"
            />
          </label>
        </Panel>
      </div>
    </div>
  );
}
