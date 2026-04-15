import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeNode, KnowledgeScope } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useRouterState } from "@tanstack/react-router";
import { useAppStore } from "@/store/app-store";

const projectIdFromPath = (pathname: string): string | undefined => {
  const match = pathname.match(/^\/project\/([^/]+)\/knowledge/);
  return match?.[1];
};

const defaultDraft = (projectId: string | undefined): {
  scope: KnowledgeScope;
  path: string;
  content: string;
} => ({
  scope: "project",
  path: projectId ? `/projects/${projectId}/notes/new-note.md` : "/system/notes/new-note.md",
  content: "# Knowledge Note\n\nDescribe the decision or reusable pattern here."
});

export function KnowledgePage() {
  const { authActions } = useAppStore();
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const projectId = useMemo(() => projectIdFromPath(pathname), [pathname]);
  const mountedRef = useRef(false);

  const [items, setItems] = useState<KnowledgeNode[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [scope, setScope] = useState<KnowledgeScope>("project");
  const [nodePath, setNodePath] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId]
  );

  const hydrateDraftFromItem = useCallback((item: KnowledgeNode | undefined) => {
    if (!item) return;
    setScope(item.scope);
    setNodePath(item.path);
    setContent(item.content);
  }, []);

  const resetDraft = useCallback(() => {
    const draft = defaultDraft(projectId);
    setSelectedId(undefined);
    setScope(draft.scope);
    setNodePath(draft.path);
    setContent(draft.content);
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadKnowledge = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (searchQuery.trim()) params.set("query", searchQuery.trim());
      const query = params.toString();
      const path = query ? `/knowledge?${query}` : "/knowledge";
      const { response, body } = await authActions.apiFetchJson<{
        items?: KnowledgeNode[];
        message?: string;
      }>(path);
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load knowledge nodes (HTTP ${response.status})`);
      }
      if (!mountedRef.current) return;
      const nextItems = body.items ?? [];
      setItems(nextItems);
      if (nextItems.length === 0) {
        resetDraft();
        return;
      }
      const preferred = selectedId
        ? nextItems.find((item) => item.id === selectedId)
        : nextItems[0];
      if (preferred) {
        setSelectedId(preferred.id);
        hydrateDraftFromItem(preferred);
      }
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load knowledge");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [authActions, hydrateDraftFromItem, projectId, resetDraft, searchQuery, selectedId]);

  useEffect(() => {
    resetDraft();
  }, [resetDraft]);

  useEffect(() => {
    void loadKnowledge();
  }, [loadKnowledge]);

  const syncFilesystem = async (): Promise<void> => {
    if (!mountedRef.current) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{
        item?: { scanned: number; created: number; updated: number; skipped: number };
        message?: string;
      }>("/knowledge/sync", {
        method: "POST",
        body: JSON.stringify({})
      });
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to sync knowledge (HTTP ${response.status})`);
      }
      if (!mountedRef.current) return;
      const item = body.item;
      setNotice(
        item
          ? `Sync completed: scanned ${item.scanned}, created ${item.created}, updated ${item.updated}, skipped ${item.skipped}.`
          : "Sync completed."
      );
      await loadKnowledge();
    } catch (syncError) {
      if (!mountedRef.current) return;
      setError(syncError instanceof Error ? syncError.message : "Unable to sync knowledge");
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const saveKnowledge = async (): Promise<void> => {
    if (!mountedRef.current) return;
    if (!nodePath.trim() || !content.trim()) {
      setError("path and content are required.");
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (selectedItem) {
        const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
        const { response, body } = await authActions.apiFetchJson<{
          item?: KnowledgeNode;
          message?: string;
        }>(`/knowledge/${selectedItem.id}${query}`, {
          method: "PATCH",
          body: JSON.stringify({
            path: nodePath,
            content
          })
        });
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to update knowledge node (HTTP ${response.status})`);
        }
        if (!mountedRef.current) return;
        setNotice("Knowledge note updated.");
      } else {
        const payload: {
          scope: KnowledgeScope;
          path: string;
          content: string;
          projectId?: string;
        } = {
          scope,
          path: nodePath,
          content
        };
        if (scope === "project" && projectId) {
          payload.projectId = projectId;
        }

        const { response, body } = await authActions.apiFetchJson<{
          item?: KnowledgeNode;
          message?: string;
        }>("/knowledge", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to create knowledge node (HTTP ${response.status})`);
        }
        if (!mountedRef.current) return;
        setSelectedId(body.item.id);
        setNotice("Knowledge note created.");
      }
      await loadKnowledge();
    } catch (saveError) {
      if (!mountedRef.current) return;
      setError(saveError instanceof Error ? saveError.message : "Unable to save knowledge");
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const removeKnowledge = async (): Promise<void> => {
    if (!selectedItem) return;
    if (!mountedRef.current) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const { response, body } = await authActions.apiFetchJson<{ message?: string }>(
        `/knowledge/${selectedItem.id}${query}`,
        {
          method: "DELETE"
        }
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to delete knowledge node (HTTP ${response.status})`);
      }
      if (!mountedRef.current) return;
      setNotice("Knowledge note deleted.");
      setSelectedId(undefined);
      await loadKnowledge();
    } catch (deleteError) {
      if (!mountedRef.current) return;
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete knowledge");
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Knowledge"
          subtitle="System / tenant / project markdown knowledge"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadKnowledge()}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Button variant="secondary" onClick={() => void syncFilesystem()}>
                {saving ? "Syncing..." : "Sync from FS"}
              </Button>
            </div>
          }
        />
        <p className="text-sm text-[color:var(--muted)]">
          Store decisions, patterns and reusable insights. Search is lexical-first with semantic scoring when embeddings are configured.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)]">
        <Panel>
          <SectionHeading title="Nodes" subtitle="Knowledge index" />
          <div className="mb-3">
            <Input value={searchQuery} onChange={setSearchQuery} placeholder="Search decisions, patterns, insights..." />
          </div>
          <div className="space-y-2 max-h-[32rem] overflow-auto pr-1">
            {items.length === 0 ? (
              <div className="text-xs text-[color:var(--muted)]">No knowledge nodes found.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full border px-3 py-2 text-left ${
                    selectedId === item.id
                      ? "border-[color:var(--accent)] bg-[color:var(--surface-elev)]"
                      : "border-[color:var(--line)] bg-black/10 hover:border-[color:var(--accent-soft)]"
                  }`}
                  onClick={() => {
                    setSelectedId(item.id);
                    hydrateDraftFromItem(item);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-[color:var(--text)]">{item.path}</span>
                    <Pill tone={item.scope === "system" ? "accent" : item.scope === "tenant" ? "warn" : "good"}>
                      {item.scope}
                    </Pill>
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    updated {new Date(item.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <SectionHeading
            title={selectedItem ? "Edit node" : "Create node"}
            subtitle={projectId ? `project ${projectId}` : "global scope"}
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={resetDraft}>
                  New
                </Button>
                {selectedItem ? (
                  <Button variant="secondary" onClick={() => void removeKnowledge()}>
                    Delete
                  </Button>
                ) : null}
                <Button variant="primary" onClick={() => void saveKnowledge()}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            }
          />
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">scope</span>
              <select
                className="cp-input"
                value={scope}
                onChange={(event) => setScope(event.target.value as KnowledgeScope)}
                disabled={Boolean(projectId)}
              >
                <option value="project">project</option>
                <option value="tenant">tenant</option>
                <option value="system">system</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">path</span>
              <Input value={nodePath} onChange={setNodePath} placeholder="/projects/proj_001/notes/new-note.md" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">markdown content</span>
              <textarea
                className="cp-input min-h-[15rem] resize-y font-mono text-xs"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </label>
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]">preview</div>
              <pre className="max-h-[14rem] overflow-auto border border-[color:var(--line)] bg-black/20 p-3 text-xs text-[color:var(--text)]">
                {content}
              </pre>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
