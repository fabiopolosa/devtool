import { useCallback, useEffect, useMemo, useState } from "react";
import type { KnowledgeConfig, KnowledgeScope } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { getOwnerMode, onOwnerModeChange } from "@/owner-mode";
import { useAppStore } from "@/store/app-store";

type EffectiveConfigResponse = {
  item?: KnowledgeConfig;
  source?: "project" | "tenant" | "system" | "default";
  items?: KnowledgeConfig[];
  message?: string;
};

type ConfigDraft = {
  scope: KnowledgeScope;
  projectId: string;
  autoCapture: boolean;
  captureModesRaw: string;
  requireApproval: boolean;
  maxNodes: string;
  relevanceThreshold: string;
  versioning: boolean;
  requireReview: boolean;
};

const defaultDraft: ConfigDraft = {
  scope: "tenant",
  projectId: "",
  autoCapture: false,
  captureModesRaw: "generation_output",
  requireApproval: false,
  maxNodes: "8",
  relevanceThreshold: "0.2",
  versioning: true,
  requireReview: false
};

const parseCaptureModes = (raw: string): string[] =>
  [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];

export function SettingsKnowledgePage() {
  const { auth, authActions } = useAppStore();
  const [ownerMode, setOwnerMode] = useState<boolean>(() => getOwnerMode());
  const [draft, setDraft] = useState<ConfigDraft>(defaultDraft);
  const [items, setItems] = useState<KnowledgeConfig[]>([]);
  const [source, setSource] = useState<EffectiveConfigResponse["source"]>("default");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const canManage = !auth.enabled || Boolean(auth.principal?.roles.includes("admin"));
  const effectiveLabel = useMemo(() => {
    if (source === "default") return "default policy";
    if (source === "project") return "project override";
    if (source === "tenant") return "tenant override";
    if (source === "system") return "system override";
    return "unknown";
  }, [source]);

  useEffect(() => onOwnerModeChange(setOwnerMode), []);

  const hydrateDraft = useCallback((config: KnowledgeConfig | undefined) => {
    if (!config) {
      setDraft(defaultDraft);
      return;
    }
    setDraft({
      scope: config.scope,
      projectId: config.projectId ?? "",
      autoCapture: config.autoCapture,
      captureModesRaw: config.captureModes.join(", "),
      requireApproval: config.requireApproval,
      maxNodes: String(config.maxNodes),
      relevanceThreshold: String(config.relevanceThreshold),
      versioning: config.versioning,
      requireReview: config.requireReview
    });
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const params = new URLSearchParams();
      if (draft.scope === "project" && draft.projectId.trim()) {
        params.set("projectId", draft.projectId.trim());
      }
      params.set("scope", draft.scope);
      const query = params.toString();
      const { response, body } = await authActions.apiFetchJson<EffectiveConfigResponse>(
        `/knowledge/config${query ? `?${query}` : ""}`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load knowledge config (HTTP ${response.status})`);
      }
      setSource(body.source ?? "default");
      setItems(body.items ?? []);
      hydrateDraft(body.item);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load knowledge configuration.");
    } finally {
      setLoading(false);
    }
  }, [authActions, draft.projectId, draft.scope, hydrateDraft]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const patchConfig = async (): Promise<void> => {
    if (!canManage) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload: Record<string, unknown> = {
        scope: draft.scope,
        autoCapture: draft.autoCapture,
        captureModes: parseCaptureModes(draft.captureModesRaw),
        requireApproval: draft.requireApproval,
        maxNodes: Number.parseInt(draft.maxNodes, 10),
        relevanceThreshold: Number.parseFloat(draft.relevanceThreshold),
        versioning: draft.versioning,
        requireReview: draft.requireReview
      };
      if (draft.scope === "project") {
        payload.projectId = draft.projectId.trim();
      }

      const query = draft.scope === "project" && draft.projectId.trim().length > 0
        ? `?projectId=${encodeURIComponent(draft.projectId.trim())}`
        : "";
      const { response, body } = await authActions.apiFetchJson<{
        item?: KnowledgeConfig;
        created?: boolean;
        message?: string;
      }>(`/knowledge/config${query}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to save knowledge config (HTTP ${response.status})`);
      }
      setNotice(body.created ? "Knowledge config created." : "Knowledge config updated.");
      setSource(body.item.scope === "project" ? "project" : body.item.scope);
      await loadConfig();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save knowledge configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Knowledge Configuration"
          subtitle="Control capture, retrieval and mutation policies per tenant/project scope"
        />
        {!ownerMode ? (
          <p className="text-sm text-amber-300">
            Owner mode is disabled. Enable it in Settings to access platform-level controls quickly.
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
        <SectionHeading
          title="Effective Policy"
          subtitle="Resolved policy source for the selected scope"
          action={
            <Button variant="secondary" onClick={() => void loadConfig()}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
          <Pill tone={source === "default" ? "warn" : "good"}>{effectiveLabel}</Pill>
          <span>{items.length} explicit config records in tenant</span>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Capture Settings" subtitle="Control automatic knowledge capture from runner output" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Scope
            <select
              className="cp-input mt-1"
              value={draft.scope}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  scope: event.target.value as KnowledgeScope
                }))
              }
            >
              <option value="system">system</option>
              <option value="tenant">tenant</option>
              <option value="project">project</option>
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Project ID (for scope=project)
            <Input
              value={draft.projectId}
              onChange={(value) => setDraft((current) => ({ ...current, projectId: value }))}
              placeholder="proj_001"
            />
          </label>
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Capture modes (comma-separated)
            <Input
              value={draft.captureModesRaw}
              onChange={(value) => setDraft((current) => ({ ...current, captureModesRaw: value }))}
              placeholder="generation_output,decision_record"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
            <input
              type="checkbox"
              checked={draft.autoCapture}
              onChange={(event) =>
                setDraft((current) => ({ ...current, autoCapture: event.target.checked }))
              }
            />
            Auto-capture enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
            <input
              type="checkbox"
              checked={draft.requireApproval}
              onChange={(event) =>
                setDraft((current) => ({ ...current, requireApproval: event.target.checked }))
              }
            />
            Require approval before mutation
          </label>
          <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
            <input
              type="checkbox"
              checked={draft.requireReview}
              onChange={(event) =>
                setDraft((current) => ({ ...current, requireReview: event.target.checked }))
              }
            />
            Require review before persistence
          </label>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Retrieval Settings" subtitle="Control retrieval cardinality and relevance filtering" />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Max nodes
            <Input
              value={draft.maxNodes}
              onChange={(value) => setDraft((current) => ({ ...current, maxNodes: value }))}
              placeholder="8"
            />
          </label>
          <label className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Relevance threshold (0-1)
            <Input
              value={draft.relevanceThreshold}
              onChange={(value) => setDraft((current) => ({ ...current, relevanceThreshold: value }))}
              placeholder="0.2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
            <input
              type="checkbox"
              checked={draft.versioning}
              onChange={(event) =>
                setDraft((current) => ({ ...current, versioning: event.target.checked }))
              }
            />
            Versioning enabled
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="primary"
            onClick={() => {
              if (saving || !canManage) return;
              void patchConfig();
            }}
          >
            {saving ? "Saving..." : "Save knowledge policy"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

