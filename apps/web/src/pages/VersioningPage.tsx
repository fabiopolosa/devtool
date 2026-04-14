import { useCallback, useEffect, useState } from 'react';
import type { LocalRepository, VersionSnapshot, VersionSnapshotTrigger } from '@cp/domain';
import { Button, Input, Panel, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';

type SnapshotDiffResult = {
  leftSnapshotId: string;
  rightSnapshotId: string;
  added: string[];
  removed: string[];
  changed: Array<{ path: string; beforeHash: string; afterHash: string }>;
};

export function VersioningPage() {
  const { auth, authActions } = useAppStore();
  const [repositories, setRepositories] = useState<LocalRepository[]>([]);
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const [newSnapshotRepoId, setNewSnapshotRepoId] = useState('');
  const [newSnapshotTaskId, setNewSnapshotTaskId] = useState('');
  const [newSnapshotLabel, setNewSnapshotLabel] = useState('manual checkpoint');
  const [newSnapshotTrigger, setNewSnapshotTrigger] = useState<VersionSnapshotTrigger>('manual');

  const [leftSnapshotId, setLeftSnapshotId] = useState('');
  const [rightSnapshotId, setRightSnapshotId] = useState('');
  const [diff, setDiff] = useState<SnapshotDiffResult | undefined>();

  const isAdmin = auth.enabled && Boolean(auth.principal?.roles.includes('admin'));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [repositoriesResponse, snapshotsResponse] = await Promise.all([
        authActions.apiFetch('/local-repos'),
        authActions.apiFetch('/versioning/snapshots')
      ]);
      const repositoriesBody = (await repositoriesResponse.json()) as { items?: LocalRepository[]; message?: string };
      const snapshotsBody = (await snapshotsResponse.json()) as { items?: VersionSnapshot[]; message?: string };

      if (!repositoriesResponse.ok) {
        throw new Error(repositoriesBody.message ?? `Unable to load local repos (HTTP ${repositoriesResponse.status})`);
      }
      if (!snapshotsResponse.ok) {
        throw new Error(snapshotsBody.message ?? `Unable to load snapshots (HTTP ${snapshotsResponse.status})`);
      }

      const nextRepositories = repositoriesBody.items ?? [];
      const nextSnapshots = snapshotsBody.items ?? [];
      setRepositories(nextRepositories);
      setSnapshots(nextSnapshots);

      if (!newSnapshotRepoId && nextRepositories.length > 0) {
        setNewSnapshotRepoId(nextRepositories[0]!.id);
      }
      if (!leftSnapshotId && nextSnapshots.length > 0) {
        setLeftSnapshotId(nextSnapshots[0]!.id);
      }
      if (!rightSnapshotId && nextSnapshots.length > 1) {
        setRightSnapshotId(nextSnapshots[1]!.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load versioning data');
    } finally {
      setLoading(false);
    }
  }, [authActions, leftSnapshotId, newSnapshotRepoId, rightSnapshotId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createSnapshot = async (): Promise<void> => {
    if (!newSnapshotRepoId || !newSnapshotLabel.trim()) {
      setError('Repository and label are required.');
      return;
    }
    setError(undefined);
    try {
      const response = await authActions.apiFetch('/versioning/snapshots', {
        method: 'POST',
        body: JSON.stringify({
          localRepositoryId: newSnapshotRepoId,
          label: newSnapshotLabel,
          trigger: newSnapshotTrigger,
          ...(newSnapshotTaskId.trim() ? { taskId: newSnapshotTaskId } : {})
        })
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to create snapshot (HTTP ${response.status})`);
      }
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create snapshot');
    }
  };

  const compareSnapshots = async (): Promise<void> => {
    if (!leftSnapshotId || !rightSnapshotId) {
      setError('Select two snapshots to compare.');
      return;
    }
    setError(undefined);
    try {
      const response = await authActions.apiFetch(
        `/versioning/diff?leftSnapshotId=${encodeURIComponent(leftSnapshotId)}&rightSnapshotId=${encodeURIComponent(rightSnapshotId)}`
      );
      const body = (await response.json()) as { item?: SnapshotDiffResult; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to compare snapshots (HTTP ${response.status})`);
      }
      setDiff(body.item);
    } catch (diffError) {
      setError(diffError instanceof Error ? diffError.message : 'Unable to compare snapshots');
    }
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Versioning"
          subtitle="Snapshot and diff control plane"
          action={
            <Button variant="secondary" onClick={() => void loadData()}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          }
        />
        <p className="text-sm text-slate-300">
          Persist repository snapshots at task start/end or manually, then compute structured diffs for auditability.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionHeading title="Create Snapshot" subtitle="Task start/end checkpoints" />
          {!isAdmin ? (
            <p className="text-sm text-slate-400">Snapshot creation requires admin privileges.</p>
          ) : (
            <div className="space-y-2">
              <select
                value={newSnapshotRepoId}
                onChange={(event) => setNewSnapshotRepoId(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
              >
                <option value="">Select local repository</option>
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>{repository.name}</option>
                ))}
              </select>
              <Input value={newSnapshotLabel} onChange={setNewSnapshotLabel} placeholder="Snapshot label" />
              <Input value={newSnapshotTaskId} onChange={setNewSnapshotTaskId} placeholder="Task id (optional)" />
              <select
                value={newSnapshotTrigger}
                onChange={(event) => setNewSnapshotTrigger(event.target.value as VersionSnapshotTrigger)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
              >
                <option value="manual">manual</option>
                <option value="task_start">task_start</option>
                <option value="task_end">task_end</option>
              </select>
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => void createSnapshot()}>Create snapshot</Button>
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <SectionHeading title="Snapshot Diff" subtitle="Compare two checkpoints" />
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <select
              value={leftSnapshotId}
              onChange={(event) => setLeftSnapshotId(event.target.value)}
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
              value={rightSnapshotId}
              onChange={(event) => setRightSnapshotId(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
            >
              <option value="">Right snapshot</option>
              {snapshots.map((snapshot) => (
                <option key={`right:${snapshot.id}`} value={snapshot.id}>
                  {snapshot.label} · {snapshot.trigger}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={() => void compareSnapshots()}>Compare</Button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
              <div className="label">Added</div>
              <div className="mt-2 space-y-1 text-xs text-emerald-100">
                {diff?.added.map((item) => (
                  <div key={`added:${item}`} className="truncate">{item}</div>
                ))}
                {(diff?.added.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
              </div>
            </div>
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3">
              <div className="label">Removed</div>
              <div className="mt-2 space-y-1 text-xs text-rose-100">
                {diff?.removed.map((item) => (
                  <div key={`removed:${item}`} className="truncate">{item}</div>
                ))}
                {(diff?.removed.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
              </div>
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
              <div className="label">Changed</div>
              <div className="mt-2 space-y-1 text-xs text-cyan-100">
                {diff?.changed.map((item) => (
                  <div key={`changed:${item.path}`} className="truncate">{item.path}</div>
                ))}
                {(diff?.changed.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <SectionHeading title="Snapshot History" subtitle={`${snapshots.length} snapshots`} />
        <div className="space-y-2">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium text-white">{snapshot.label}</div>
                <div className="text-xs text-slate-400">{snapshot.trigger}</div>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Repo {snapshot.localRepositoryId} · files {snapshot.files.length}
              </div>
              {snapshot.taskId ? <div className="text-xs text-slate-500">Task {snapshot.taskId}</div> : null}
            </div>
          ))}
          {snapshots.length === 0 ? <p className="text-sm text-slate-400">No snapshots available.</p> : null}
        </div>
      </Panel>
    </div>
  );
}
