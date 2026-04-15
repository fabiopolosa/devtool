import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContextNote } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type ContextDraft = {
  path: string;
  title: string;
  content: string;
  tags: string;
  linkRefs: string;
  pinned: boolean;
};

const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const defaultDraft = (projectId?: string): ContextDraft => ({
  path: projectId ? `/projects/${projectId}/context/new-note.md` : "/projects/project/context/new-note.md",
  title: "Context note",
  content: "# Context note\n\nWrite decisions, strategy, or project notes here.",
  tags: "strategy, decision",
  linkRefs: "",
  pinned: false
});

const renderInline = (value: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  for (let match = regex.exec(value); match; match = regex.exec(value)) {
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }
    nodes.push(
      <a key={`${match.index}-${match[2]}`} href={match[2]} className="text-[color:var(--accent)] underline">
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }
  return nodes;
};

const renderMarkdown = (content: string) => {
  const blocks = content.split(/\n{2,}/g).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.startsWith("### ")) {
          return (
            <h3 key={`${index}-${block.slice(0, 12)}`} className="text-sm font-semibold text-[color:var(--text)]">
              {block.slice(4)}
            </h3>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h2 key={`${index}-${block.slice(0, 12)}`} className="text-base font-semibold text-[color:var(--text)]">
              {block.slice(3)}
            </h2>
          );
        }
        if (block.startsWith("# ")) {
          return (
            <h1 key={`${index}-${block.slice(0, 12)}`} className="text-lg font-semibold text-[color:var(--text)]">
              {block.slice(2)}
            </h1>
          );
        }
        return (
          <p key={`${index}-${block.slice(0, 12)}`} className="text-sm leading-6 text-[color:var(--text)]">
            {block.split("\n").map((line, lineIndex) => (
              <span key={`${index}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
};

export function ContextPage({ projectId: projectIdOverride }: { projectId?: string }) {
  const { state, authActions } = useAppStore();
  const routeProjectId = (() => {
    if (typeof window === "undefined") return undefined;
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] === "project" && parts[1]) return parts[1];
    return undefined;
  })();
  const projectId = projectIdOverride ?? routeProjectId ?? state.projects[0]?.id ?? "proj-control-plane";
  const mountedRef = useRef(false);
  const [items, setItems] = useState<ContextNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState<ContextDraft>(() => defaultDraft(projectId));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [readerMode, setReaderMode] = useState(true);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId),
    [items, selectedId]
  );

  const hydrateDraft = useCallback((item: ContextNote | undefined) => {
    if (!item) return;
    setDraft({
      path: item.path,
      title: item.title,
      content: item.content,
      tags: item.tags.join(", "),
      linkRefs: item.linkRefs.join(", "),
      pinned: item.pinned
    });
    setReaderMode(true);
  }, []);

  const resetDraft = useCallback(() => {
    setSelectedId(undefined);
    setDraft(defaultDraft(projectId));
    setReaderMode(false);
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    resetDraft();
  }, [projectId, resetDraft]);

  const loadContextNotes = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const params = new URLSearchParams({ projectId });
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      const { response, body } = await authActions.apiFetchJson<{
        items?: ContextNote[];
        hits?: Array<{ item: ContextNote; score: number }>;
        message?: string;
      }>(`/context?${params.toString()}`);
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load context notes (HTTP ${response.status})`);
      }
      if (!mountedRef.current) return;
      const nextItems = body.items ?? [];
      setItems(nextItems);
      if (nextItems.length === 0) {
        resetDraft();
        return;
      }
      const preferred = selectedId ? nextItems.find((item) => item.id === selectedId) : nextItems[0];
      if (preferred) {
        setSelectedId(preferred.id);
        hydrateDraft(preferred);
      }
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load context notes");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [authActions, hydrateDraft, projectId, resetDraft, searchQuery, selectedId]);

  useEffect(() => {
    void loadContextNotes();
  }, [loadContextNotes]);

  const saveContextNote = async (): Promise<void> => {
    if (!mountedRef.current) return;
    if (!draft.path.trim() || !draft.title.trim() || !draft.content.trim()) {
      setError("Path, title and content are required.");
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload = {
        projectId,
        path: draft.path,
        title: draft.title,
        content: draft.content,
        tags: splitList(draft.tags),
        linkRefs: splitList(draft.linkRefs),
        pinned: draft.pinned
      };
      if (selectedItem) {
        const { response, body } = await authActions.apiFetchJson<{ item?: ContextNote; message?: string }>(
          `/context/${selectedItem.id}?projectId=${encodeURIComponent(projectId)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to update context note (HTTP ${response.status})`);
        }
        setNotice("Context note updated.");
      } else {
        const { response, body } = await authActions.apiFetchJson<{ item?: ContextNote; message?: string }>(
          "/context",
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to create context note (HTTP ${response.status})`);
        }
        setSelectedId(body.item.id);
        setNotice("Context note created.");
      }
      await loadContextNotes();
    } catch (saveError) {
      if (!mountedRef.current) return;
      setError(saveError instanceof Error ? saveError.message : "Unable to save context note");
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const deleteContextNote = async (): Promise<void> => {
    if (!selectedItem) return;
    if (!mountedRef.current) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ message?: string }>(
        `/context/${selectedItem.id}?projectId=${encodeURIComponent(projectId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to delete context note (HTTP ${response.status})`);
      }
      setNotice("Context note deleted.");
      resetDraft();
      await loadContextNotes();
    } catch (deleteError) {
      if (!mountedRef.current) return;
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete context note");
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Context"
          subtitle="Obsidian-like project notes for strategy, decisions, and direction"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadContextNotes()}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Button variant="primary" onClick={() => resetDraft()}>
                New note
              </Button>
            </div>
          }
        />
        <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <div className="label">Search</div>
            <Input value={searchQuery} onChange={setSearchQuery} placeholder="Search note title, body, tags, links" />
          </div>
          <div>
            <div className="label">Project</div>
            <div className="cp-input pointer-events-none">{projectId}</div>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => setReaderMode((value) => !value)}>
              {readerMode ? "Reader on" : "Reader off"}
            </Button>
            <Button variant="primary" onClick={() => void saveContextNote()}>
              {saving ? "Saving..." : "Save note"}
            </Button>
          </div>
        </div>
        {error ? <div className="mt-3 text-sm text-[color:var(--bad)]">{error}</div> : null}
        {notice ? <div className="mt-3 text-sm text-[color:var(--good)]">{notice}</div> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr_1fr]">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionHeading title="Notes" subtitle={`${items.length} notes`} />
          </div>
          <div className="space-y-2">
            {items.length === 0 ? (
              <div className="text-sm text-[color:var(--muted)]">No context notes yet.</div>
            ) : null}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  hydrateDraft(item);
                }}
                className={`w-full border px-3 py-2 text-left transition ${
                  item.id === selectedId
                    ? "border-[color:var(--line-strong)] bg-[color:var(--panel2)]"
                    : "border-[color:var(--line)] bg-[color:var(--panel)] hover:border-[color:var(--line-strong)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[color:var(--text)]">{item.title}</div>
                    <div className="truncate text-xs text-[color:var(--muted)]">{item.path}</div>
                  </div>
                  {item.pinned ? <Pill tone="accent">Pinned</Pill> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="pill pill-default">
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-3">
          <SectionHeading title="Edit note" subtitle="Markdown source and metadata" />
          <div className="space-y-3">
            <div>
              <div className="label">Path</div>
              <input className="cp-input" value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} />
            </div>
            <div>
              <div className="label">Title</div>
              <input className="cp-input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </div>
            <div>
              <div className="label">Tags</div>
              <input
                className="cp-input"
                value={draft.tags}
                onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                placeholder="strategy, direction, decisions"
              />
            </div>
            <div>
              <div className="label">Link refs</div>
              <input
                className="cp-input"
                value={draft.linkRefs}
                onChange={(event) => setDraft({ ...draft, linkRefs: event.target.value })}
                placeholder="/projects/.../notes/related.md"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[color:var(--text)]">
              <input
                type="checkbox"
                checked={draft.pinned}
                onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })}
              />
              Pinned
            </label>
            <div>
              <div className="label">Markdown</div>
              <textarea
                className="cp-input min-h-[280px] leading-6"
                value={draft.content}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void saveContextNote()}>
                {selectedItem ? "Update note" : "Create note"}
              </Button>
              <Button variant="secondary" onClick={() => resetDraft()}>
                Reset draft
              </Button>
              {selectedItem ? (
                <Button variant="ghost" onClick={() => void deleteContextNote()}>
                  Delete note
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel className="space-y-3">
          <SectionHeading title="Reader" subtitle={selectedItem ? selectedItem.path : "Markdown preview"} />
          {readerMode ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {splitList(draft.tags).map((tag) => (
                  <Pill key={tag}>{tag}</Pill>
                ))}
                {draft.pinned ? <Pill tone="accent">Pinned</Pill> : null}
              </div>
              <div className="border border-[color:var(--line)] bg-[color:var(--panel)] p-3">
                {renderMarkdown(draft.content)}
              </div>
              <div className="space-y-1 text-xs text-[color:var(--muted)]">
                <div>Link refs</div>
                <div className="flex flex-wrap gap-1">
                  {splitList(draft.linkRefs).length > 0 ? (
                    splitList(draft.linkRefs).map((ref) => (
                      <span key={ref} className="pill pill-default">
                        {ref}
                      </span>
                    ))
                  ) : (
                    <span>No links yet.</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[color:var(--muted)]">Reader mode is off.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
