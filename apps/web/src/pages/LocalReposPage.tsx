import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LocalRepository, VersionSnapshot } from '@cp/domain';
import { Button, Input, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';

type LocalRepoFileEntry = {
  name: string;
  relativePath: string;
  kind: 'file' | 'directory';
  sizeBytes?: number;
};

type LocalRepoCommitEntry = {
  sha: string;
  author: string;
  date: string;
  subject: string;
};

type SnapshotDiffResult = {
  leftSnapshotId: string;
  rightSnapshotId: string;
  added: string[];
  removed: string[];
  changed: Array<{ path: string; beforeHash: string; afterHash: string }>;
};

export function LocalReposPage() {
  const { auth, authActions } = useAppStore();
  const [repositories, setRepositories] = useState<LocalRepository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [entries, setEntries] = useState<LocalRepoFileEntry[]>([]);
  const [history, setHistory] = useState<LocalRepoCommitEntry[]>([]);
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [selectedLeftSnapshotId, setSelectedLeftSnapshotId] = useState<string>('');
  const [selectedRightSnapshotId, setSelectedRightSnapshotId] = useState<string>('');
  const [snapshotDiff, setSnapshotDiff] = useState<SnapshotDiffResult | undefined>();

  const [currentPath, setCurrentPath] = useState('.');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileTruncated, setFileTruncated] = useState(false);
  const [activeTab, setActiveTab] = useState<'files' | 'history' | 'snapshots'>('files');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPath, setNewRepoPath] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');

  const isAdmin = auth.enabled && Boolean(auth.principal?.roles.includes('admin'));

  const selectedRepository = useMemo(
    () => repositories.find((repo) => repo.id === selectedRepoId),
    [repositories, selectedRepoId]
  );

  const loadRepositories = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/local-repos');
      const body = (await response.json()) as { items?: LocalRepository[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load local repositories (HTTP ${response.status})`);
      }
      const items = body.items ?? [];
      setRepositories(items);
      if (!selectedRepoId && items.length > 0) {
        setSelectedRepoId(items[0]!.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load local repositories');
    } finally {
      setLoading(false);
    }
  }, [authActions, selectedRepoId]);

  const loadFiles = useCallback(async (repoId: string, pathValue: string) => {
    const response = await authActions.apiFetch(
      `/local-repos/${repoId}/files?path=${encodeURIComponent(pathValue || '.')}`
    );
    const body = (await response.json()) as { items?: LocalRepoFileEntry[]; message?: string };
    if (!response.ok) {
      throw new Error(body.message ?? `Unable to load files (HTTP ${response.status})`);
    }
    setEntries(body.items ?? []);
  }, [authActions]);

  const loadHistory = useCallback(async (repoId: string) => {
    const response = await authActions.apiFetch(`/local-repos/${repoId}/history`);
    const body = (await response.json()) as { items?: LocalRepoCommitEntry[]; message?: string };
    if (!response.ok) {
      throw new Error(body.message ?? `Unable to load history (HTTP ${response.status})`);
    }
    setHistory(body.items ?? []);
  }, [authActions]);

  const loadSnapshots = useCallback(async (repoId: string) => {
    const response = await authActions.apiFetch(`/versioning/snapshots?localRepositoryId=${encodeURIComponent(repoId)}`);
    const body = (await response.json()) as { items?: VersionSnapshot[]; message?: string };
    if (!response.ok) {
      throw new Error(body.message ?? `Unable to load snapshots (HTTP ${response.status})`);
    }
    const items = body.items ?? [];
    setSnapshots(items);
    if (!selectedLeftSnapshotId && items.length > 0) {
      setSelectedLeftSnapshotId(items[0]!.id);
    }
    if (!selectedRightSnapshotId && items.length > 1) {
      setSelectedRightSnapshotId(items[1]!.id);
    }
  }, [authActions, selectedLeftSnapshotId, selectedRightSnapshotId]);

  const loadRepositoryDetail = useCallback(async (repoId: string, pathValue = '.') => {
    setError(undefined);
    await Promise.all([
      loadFiles(repoId, pathValue),
      loadHistory(repoId),
      loadSnapshots(repoId)
    ]);
  }, [loadFiles, loadHistory, loadSnapshots]);

  useEffect(() => {
    void loadRepositories();
  }, [loadRepositories]);

  useEffect(() => {
    if (!selectedRepoId) return;
    setCurrentPath('.');
    setSelectedFilePath('');
    setFileContent('');
    setFileTruncated(false);
    void loadRepositoryDetail(selectedRepoId, '.').catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load repository detail');
    });
  }, [selectedRepoId, loadRepositoryDetail]);

  const navigateTo = async (nextPath: string): Promise<void> => {
    if (!selectedRepoId) return;
    try {
      setCurrentPath(nextPath);
      await loadFiles(selectedRepoId, nextPath);
    } catch (navigationError) {
      setError(navigationError instanceof Error ? navigationError.message : 'Unable to navigate path');
    }
  };

  const openFile = async (pathValue: string): Promise<void> => {
    if (!selectedRepoId) return;
    setError(undefined);
    try {
      const response = await authActions.apiFetch(
        `/local-repos/${selectedRepoId}/file?path=${encodeURIComponent(pathValue)}`
      );
      const body = (await response.json()) as {
        item?: { content: string; truncated: boolean };
        message?: string;
      };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to open file (HTTP ${response.status})`);
      }
      setSelectedFilePath(pathValue);
      setFileContent(body.item.content);
      setFileTruncated(body.item.truncated);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open file');
    }
  };

  const createRepository = async (): Promise<void> => {
    if (!newRepoName.trim() || !newRepoPath.trim()) {
      setError('Repository name and root path are required.');
      return;
    }
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/local-repos', {
        method: 'POST',
        body: JSON.stringify({
          name: newRepoName,
          rootPath: newRepoPath,
          ...(newRepoDescription.trim() ? { description: newRepoDescription } : {})
        })
      });
      const body = (await response.json()) as { item?: LocalRepository; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to create local repository (HTTP ${response.status})`);
      }
      setNewRepoName('');
      setNewRepoPath('');
      setNewRepoDescription('');
      await loadRepositories();
      setSelectedRepoId(body.item.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create local repository');
    }
  };

  const triggerScan = async (scheduled: boolean): Promise<void> => {
    if (!selectedRepoId) return;
    setError(undefined);
    try {
      const endpoint = scheduled
        ? `/local-repos/${selectedRepoId}/scan/schedule`
        : `/local-repos/${selectedRepoId}/scan`;
      const response = await authActions.apiFetch(endpoint, { method: 'POST' });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to trigger scan (HTTP ${response.status})`);
      }
      await loadRepositories();
      await loadRepositoryDetail(selectedRepoId, currentPath);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unable to trigger scan');
    }
  };

  const compareSnapshots = async (): Promise<void> => {
    if (!selectedLeftSnapshotId || !selectedRightSnapshotId) {
      setError('Select both snapshots to run diff.');
      return;
    }
    setError(undefined);
    try {
      const response = await authActions.apiFetch(
        `/versioning/diff?leftSnapshotId=${encodeURIComponent(selectedLeftSnapshotId)}&rightSnapshotId=${encodeURIComponent(selectedRightSnapshotId)}`
      );
      const body = (await response.json()) as { item?: SnapshotDiffResult; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to diff snapshots (HTTP ${response.status})`);
      }
      setSnapshotDiff(body.item);
    } catch (diffError) {
      setError(diffError instanceof Error ? diffError.message : 'Unable to diff snapshots');
    }
  };

  const pathSegments = useMemo(() => {
    if (currentPath === '.' || !currentPath.trim()) return ['.'];
    return currentPath.split('/').filter(Boolean);
  }, [currentPath]);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Local Repos"
          subtitle="File manager and read-only code editor"
          action={
            <Button variant="secondary" onClick={() => void loadRepositories()}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          }
        />
        <p className="text-sm text-slate-300">
          Register local repositories, inspect files, review git history, and compare version snapshots.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel>
          <SectionHeading title="Repository Registry" subtitle={`${repositories.length} registered`} />
          <div className="space-y-2">
            {repositories.map((repo) => (
              <button
                key={repo.id}
                onClick={() => setSelectedRepoId(repo.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                  selectedRepoId === repo.id
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{repo.name}</span>
                  <Pill tone={repo.status === 'active' ? 'good' : 'warn'}>{repo.status}</Pill>
                </div>
                <div className="mt-1 text-xs text-slate-400 truncate">{repo.rootPath}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {repo.detectedGit ? `git:${repo.currentBranch ?? 'detected'}` : 'non-git'} · {repo.indexedFileCount} files
                </div>
              </button>
            ))}
          </div>

          {isAdmin ? (
            <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="label">Register local repository</div>
              <Input value={newRepoName} onChange={setNewRepoName} placeholder="Repository name" />
              <Input value={newRepoPath} onChange={setNewRepoPath} placeholder="/absolute/path/to/repo" />
              <Input value={newRepoDescription} onChange={setNewRepoDescription} placeholder="Description (optional)" />
              <Button variant="primary" onClick={() => void createRepository()}>Register</Button>
            </div>
          ) : null}
        </Panel>

        <Panel>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="label">Repository workspace</div>
              <div className="text-lg font-semibold text-white">
                {selectedRepository?.name ?? 'Select a local repository'}
              </div>
              {selectedRepository ? (
                <div className="text-xs text-slate-400">{selectedRepository.rootPath}</div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('files')}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                  activeTab === 'files' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-slate-300'
                }`}
              >
                Files
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                  activeTab === 'history' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-slate-300'
                }`}
              >
                History
              </button>
              <button
                onClick={() => setActiveTab('snapshots')}
                className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                  activeTab === 'snapshots' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100' : 'border-white/10 text-slate-300'
                }`}
              >
                Snapshots
              </button>
            </div>
          </div>

          {selectedRepository && isAdmin ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void triggerScan(false)}>Scan now</Button>
              <Button onClick={() => void triggerScan(true)}>Schedule scan</Button>
            </div>
          ) : null}

          {!selectedRepository ? (
            <p className="text-sm text-slate-400">Select a repository from the left to inspect files.</p>
          ) : null}

          {selectedRepository && activeTab === 'files' ? (
            <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-slate-300">
                  <div className="mb-1 text-slate-500">Path</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => void navigateTo('.')}
                      className="rounded border border-white/10 px-2 py-1 text-[11px] hover:bg-white/10"
                    >
                      .
                    </button>
                    {pathSegments[0] === '.' ? null : pathSegments.map((segment, index) => {
                      const target = pathSegments.slice(0, index + 1).join('/');
                      return (
                        <button
                          key={`${segment}:${index}`}
                          onClick={() => void navigateTo(target)}
                          className="rounded border border-white/10 px-2 py-1 text-[11px] hover:bg-white/10"
                        >
                          {segment}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="max-h-[420px] space-y-1 overflow-auto rounded-xl border border-white/10 bg-slate-950/35 p-2">
                  {currentPath !== '.' ? (
                    <button
                      onClick={() => {
                        const parent = currentPath.includes('/')
                          ? currentPath.split('/').slice(0, -1).join('/') || '.'
                          : '.';
                        void navigateTo(parent);
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-white/10 px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-white/10"
                    >
                      <span>..</span>
                      <span className="text-slate-500">up</span>
                    </button>
                  ) : null}
                  {entries.map((entry) => (
                    <button
                      key={entry.relativePath}
                      onClick={() => {
                        if (entry.kind === 'directory') {
                          void navigateTo(entry.relativePath);
                          return;
                        }
                        void openFile(entry.relativePath);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                        selectedFilePath === entry.relativePath
                          ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100'
                          : 'border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <span className="truncate pr-2">
                        {entry.kind === 'directory' ? '[DIR]' : '[FILE]'} {entry.name}
                      </span>
                      <span className="text-slate-500">{entry.kind === 'file' ? `${entry.sizeBytes ?? 0}b` : 'dir'}</span>
                    </button>
                  ))}
                  {entries.length === 0 ? <div className="text-xs text-slate-500">No entries in this path.</div> : null}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm text-white">{selectedFilePath || 'Select a file'}</div>
                  {fileTruncated ? <Pill tone="warn">Truncated</Pill> : null}
                </div>
                <pre className="max-h-[480px] overflow-auto rounded-lg border border-white/10 bg-black/35 p-3 font-mono text-xs text-emerald-100">
                  {fileContent || '// Select a file from the left panel to inspect content.'}
                </pre>
              </div>
            </div>
          ) : null}

          {selectedRepository && activeTab === 'history' ? (
            <div className="max-h-[520px] space-y-2 overflow-auto rounded-xl border border-white/10 bg-white/5 p-3">
              {history.map((commit) => (
                <div key={commit.sha} className="rounded-lg border border-white/10 bg-slate-950/40 p-2 text-sm">
                  <div className="font-medium text-white">{commit.subject}</div>
                  <div className="text-xs text-slate-400">{commit.sha.slice(0, 12)} · {commit.author}</div>
                  <div className="text-xs text-slate-500">{commit.date}</div>
                </div>
              ))}
              {history.length === 0 ? <p className="text-sm text-slate-400">No git history available for this repository.</p> : null}
            </div>
          ) : null}

          {selectedRepository && activeTab === 'snapshots' ? (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <select
                  value={selectedLeftSnapshotId}
                  onChange={(event) => setSelectedLeftSnapshotId(event.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
                >
                  <option value="">Left snapshot</option>
                  {snapshots.map((snapshot) => (
                    <option key={`left:${snapshot.id}`} value={snapshot.id}>
                      {snapshot.label} · {snapshot.trigger}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedRightSnapshotId}
                  onChange={(event) => setSelectedRightSnapshotId(event.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
                >
                  <option value="">Right snapshot</option>
                  {snapshots.map((snapshot) => (
                    <option key={`right:${snapshot.id}`} value={snapshot.id}>
                      {snapshot.label} · {snapshot.trigger}
                    </option>
                  ))}
                </select>
                <Button variant="primary" onClick={() => void compareSnapshots()}>Diff</Button>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                  <div className="label">Added</div>
                  <div className="mt-2 space-y-1 text-xs text-emerald-100">
                    {snapshotDiff?.added.map((entry) => (
                      <div key={`added:${entry}`} className="truncate">{entry}</div>
                    ))}
                    {(snapshotDiff?.added.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3">
                  <div className="label">Removed</div>
                  <div className="mt-2 space-y-1 text-xs text-rose-100">
                    {snapshotDiff?.removed.map((entry) => (
                      <div key={`removed:${entry}`} className="truncate">{entry}</div>
                    ))}
                    {(snapshotDiff?.removed.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
                  <div className="label">Changed</div>
                  <div className="mt-2 space-y-1 text-xs text-cyan-100">
                    {snapshotDiff?.changed.map((entry) => (
                      <div key={`changed:${entry.path}`} className="truncate">{entry.path}</div>
                    ))}
                    {(snapshotDiff?.changed.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                Snapshot records: {snapshots.length}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
