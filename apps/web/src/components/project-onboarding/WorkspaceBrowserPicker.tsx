import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Panel, Pill } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type WorkspaceBrowserRoot = {
  path: string;
  name: string;
  exists: boolean;
  isDirectory: boolean;
  readable: boolean;
  writable: boolean;
  executable: boolean;
};

type WorkspaceBrowserEntry = {
  name: string;
  path: string;
  kind: "directory" | "file" | "symlink" | "other";
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
};

type WorkspaceBrowserListing = {
  path?: string;
  resolvedPath?: string;
  root?: string;
  allowedRoots: WorkspaceBrowserRoot[];
  entries: WorkspaceBrowserEntry[];
  parentPath?: string;
  currentRoot?: string;
  currentName?: string;
};

type WorkspaceBrowserPickerProps = {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  title?: string;
  subtitle?: string;
};

const sortRoots = (roots: WorkspaceBrowserRoot[]): WorkspaceBrowserRoot[] =>
  [...roots].sort((left, right) => left.name.localeCompare(right.name));

export function WorkspaceBrowserPicker({
  value,
  onChange,
  title = "Workspace folder",
  subtitle = "Browse allowed local roots instead of typing a raw path"
}: WorkspaceBrowserPickerProps) {
  const { authActions } = useAppStore();
  const [roots, setRoots] = useState<WorkspaceBrowserRoot[]>([]);
  const [listing, setListing] = useState<WorkspaceBrowserListing | undefined>();
  const [currentPath, setCurrentPath] = useState<string | undefined>(value);
  const [loading, setLoading] = useState(false);
  const [rootLoading, setRootLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const selectedPath = value ?? currentPath;
  const rootEntries = useMemo(() => sortRoots(roots), [roots]);

  const fetchRoots = useCallback(async (): Promise<void> => {
    setRootLoading(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{
        items?: WorkspaceBrowserRoot[];
        allowedRoots?: WorkspaceBrowserRoot[];
        message?: string;
      }>("/workspaces/browser/roots");
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load workspace roots (HTTP ${response.status})`);
      }
      const allowedRoots = body.items ?? body.allowedRoots ?? [];
      if (!mountedRef.current) return;
      setRoots(allowedRoots);
      if (!selectedPath && allowedRoots.length > 0) {
        const firstRoot = allowedRoots[0];
        if (firstRoot) {
          setCurrentPath(firstRoot.path);
        }
      }
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load workspace roots");
    } finally {
      if (!mountedRef.current) return;
      setRootLoading(false);
    }
  }, [authActions, selectedPath]);

  const fetchListing = useCallback(async (path?: string): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const url = path ? `/workspaces/browser?path=${encodeURIComponent(path)}` : "/workspaces/browser";
      const { response, body } = await authActions.apiFetchJson<{
        item?: WorkspaceBrowserListing;
        path?: string;
        resolvedPath?: string;
        root?: string;
        allowedRoots?: WorkspaceBrowserRoot[];
        entries?: WorkspaceBrowserEntry[];
        parentPath?: string;
        currentRoot?: string;
        currentName?: string;
        message?: string;
      }>(url);
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to browse workspace path (HTTP ${response.status})`);
      }
      const fallbackListing: WorkspaceBrowserListing | undefined =
        Array.isArray(body.entries) || Array.isArray(body.allowedRoots)
          ? {
              ...(body.path !== undefined ? { path: body.path } : {}),
              ...(body.resolvedPath !== undefined ? { resolvedPath: body.resolvedPath } : {}),
              ...(body.root !== undefined ? { root: body.root } : {}),
              ...(body.parentPath !== undefined ? { parentPath: body.parentPath } : {}),
              ...(body.currentRoot !== undefined ? { currentRoot: body.currentRoot } : {}),
              ...(body.currentName !== undefined ? { currentName: body.currentName } : {}),
              allowedRoots: body.allowedRoots ?? [],
              entries: body.entries ?? []
            }
          : undefined;
      const nextListing: WorkspaceBrowserListing | undefined =
        body.item ?? fallbackListing;
      if (!nextListing) {
        throw new Error("Workspace browser response did not include an item.");
      }
      if (!mountedRef.current) return;
      setListing(nextListing);
      if (nextListing.path) {
        setCurrentPath(nextListing.path);
      }
      if (nextListing.allowedRoots) {
        setRoots(nextListing.allowedRoots);
      }
    } catch (browseError) {
      if (!mountedRef.current) return;
      setError(browseError instanceof Error ? browseError.message : "Unable to browse workspace path");
      setListing(undefined);
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [authActions]);

  useEffect(() => {
    void fetchRoots();
  }, [fetchRoots]);

  useEffect(() => {
    if (!currentPath) return;
    void fetchListing(currentPath);
  }, [currentPath, fetchListing]);

  useEffect(() => {
    if (value !== undefined) {
      setCurrentPath(value);
    }
  }, [value]);

  const openPath = (path: string): void => {
    setCurrentPath(path);
  };

  const chooseCurrent = (): void => {
    const chosen = listing?.resolvedPath ?? listing?.path ?? currentPath ?? selectedPath;
    if (!chosen) return;
    onChange(chosen);
  };

  const selectedSummary = selectedPath ?? "No workspace selected";

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">{subtitle}</div>
          <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => void fetchListing(selectedPath ?? currentPath)}>
            {loading ? "Browsing..." : "Refresh browser"}
          </Button>
          <Pill tone="default">server-side browser</Pill>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      {rootLoading ? <p className="mt-3 text-sm text-slate-300">Loading allowed roots...</p> : null}

      <div className="mt-4 space-y-3">
        <div className="label">Allowed roots</div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rootEntries.map((root) => {
            const selected = selectedPath?.startsWith(root.path);
            return (
              <button
                key={root.path}
                type="button"
                onClick={() => openPath(root.path)}
                className={`rounded-2xl border p-3 text-left transition ${
                  selected
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <div className="text-sm font-semibold">{root.name}</div>
                <div className="mt-1 break-all text-xs text-slate-400">{root.path}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Pill tone={root.exists ? "good" : "bad"}>{root.exists ? "exists" : "missing"}</Pill>
                  <Pill tone={root.isDirectory ? "accent" : "warn"}>{root.isDirectory ? "directory" : "not a directory"}</Pill>
                  <Pill tone={root.readable ? "good" : "warn"}>{root.readable ? "readable" : "read blocked"}</Pill>
                </div>
              </button>
            );
          })}
          {rootEntries.length === 0 ? (
            <p className="text-sm text-slate-400">No allowed roots are configured for workspace browsing.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="label">Current folder</div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="break-all text-sm text-white">{listing?.path ?? currentPath ?? "No folder selected"}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {listing?.parentPath ? (
                <Button variant="secondary" onClick={() => openPath(listing.parentPath!)}>
                  Up
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => void fetchListing(currentPath)}>
                {loading ? "Browsing..." : "Refresh"}
              </Button>
              <Button variant="primary" onClick={chooseCurrent} disabled={!listing?.path && !currentPath}>
                Use this folder
              </Button>
            </div>
          </div>
          <div className="label">Selection</div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200 break-all">
            {selectedSummary}
          </div>
        </div>

        <div className="space-y-2">
          <div className="label">Browse folders</div>
          <div className="grid gap-2 md:grid-cols-2">
            {(listing?.entries ?? []).map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => entry.isDirectory && openPath(entry.path)}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  entry.isDirectory
                    ? "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                    : "border-white/5 bg-white/3 text-slate-400"
                }`}
              >
                <div className="font-medium">{entry.name}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{entry.kind}</div>
              </button>
            ))}
            {loading ? <p className="text-sm text-slate-400">Loading folder contents...</p> : null}
            {!loading && (listing?.entries ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">Choose a root to browse available folders.</p>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}
