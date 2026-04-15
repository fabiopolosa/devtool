import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentConfig, Skill, VersionSnapshot } from '@cp/domain';
import { Panel, SectionHeading } from '@/components/common';
import { AgentRunTable, ExecutionTracePanel, TaskTimeline } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

type SnapshotDiffResult = {
  leftSnapshotId: string;
  rightSnapshotId: string;
  added: string[];
  removed: string[];
  changed: Array<{ path: string; beforeHash: string; afterHash: string }>;
};

export function TaskDetailPage() {
  const { state, dispatch, auth, authActions } = useAppStore();
  const projectId = usePathParam(3);
  const taskId = usePathParam(1);
  const task = state.tasks.find((item) => item.id === taskId) ?? state.tasks[0];
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [availableAgents, setAvailableAgents] = useState<AgentConfig[]>([]);
  const [taskSnapshots, setTaskSnapshots] = useState<VersionSnapshot[]>([]);
  const [leftSnapshotId, setLeftSnapshotId] = useState('');
  const [rightSnapshotId, setRightSnapshotId] = useState('');
  const [snapshotDiff, setSnapshotDiff] = useState<SnapshotDiffResult | undefined>();
  const [skillsError, setSkillsError] = useState<string | undefined>();
  const [agentsError, setAgentsError] = useState<string | undefined>();
  const [snapshotError, setSnapshotError] = useState<string | undefined>();
  const runs = task ? state.taskRuns.filter((run) => run.taskId === task.id) : [];
  const firstRun = runs[0];
  const selectedTaskSkills = task ? (state.taskSpecSkills[task.id] ?? []) : [];
  const selectedTaskAgentId = task ? state.taskAssignedAgents[task.id] : undefined;

  const loadTaskDependencies = useCallback(async () => {
    setSkillsError(undefined);
    setAgentsError(undefined);
    try {
      const [skillsResponse, agentsResponse] = await Promise.all([
        authActions.apiFetch('/skills/installed'),
        authActions.apiFetch('/agents')
      ]);
      const skillsBody = (await skillsResponse.json()) as { items?: Skill[]; message?: string };
      const agentsBody = (await agentsResponse.json()) as { items?: AgentConfig[]; message?: string };
      if (!skillsResponse.ok) {
        throw new Error(skillsBody.message ?? `Unable to load installed skills (HTTP ${skillsResponse.status})`);
      }
      if (!agentsResponse.ok) {
        throw new Error(agentsBody.message ?? `Unable to load agents (HTTP ${agentsResponse.status})`);
      }
      setInstalledSkills(skillsBody.items ?? []);
      setAvailableAgents(agentsBody.items ?? []);
    } catch (error) {
      setSkillsError(error instanceof Error ? error.message : 'Unable to load installed skills');
      setAgentsError(error instanceof Error ? error.message : 'Unable to load agents');
    }
  }, [authActions]);

  useEffect(() => {
    if (!auth.enabled) {
      setInstalledSkills([]);
      setAvailableAgents([]);
      return;
    }
    void loadTaskDependencies();
  }, [auth.enabled, loadTaskDependencies]);

  const loadTaskSnapshots = useCallback(async () => {
    if (!task) return;
    setSnapshotError(undefined);
    try {
      const response = await authActions.apiFetch(`/versioning/snapshots?taskId=${encodeURIComponent(task.id)}`);
      const body = (await response.json()) as { items?: VersionSnapshot[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load task snapshots (HTTP ${response.status})`);
      }
      const items = body.items ?? [];
      setTaskSnapshots(items);
      if (!leftSnapshotId && items.length > 0) {
        setLeftSnapshotId(items[0]!.id);
      }
      if (!rightSnapshotId && items.length > 1) {
        setRightSnapshotId(items[1]!.id);
      }
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : 'Unable to load task snapshots');
    }
  }, [authActions, leftSnapshotId, rightSnapshotId, task]);

  useEffect(() => {
    if (!task) return;
    void loadTaskSnapshots();
  }, [loadTaskSnapshots, task]);

  const compareSnapshots = async (): Promise<void> => {
    if (!leftSnapshotId || !rightSnapshotId) {
      setSnapshotError('Select two snapshots to compare.');
      return;
    }
    setSnapshotError(undefined);
    try {
      const response = await authActions.apiFetch(
        `/versioning/diff?leftSnapshotId=${encodeURIComponent(leftSnapshotId)}&rightSnapshotId=${encodeURIComponent(rightSnapshotId)}`
      );
      const body = (await response.json()) as { item?: SnapshotDiffResult; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to compare task snapshots (HTTP ${response.status})`);
      }
      setSnapshotDiff(body.item);
    } catch (error) {
      setSnapshotError(error instanceof Error ? error.message : 'Unable to compare task snapshots');
    }
  };

  const availableSkills = useMemo(
    () => [...installedSkills].sort((left, right) => left.name.localeCompare(right.name)),
    [installedSkills]
  );
  const sortedAgents = useMemo(
    () => [...availableAgents].sort((left, right) => left.name.localeCompare(right.name)),
    [availableAgents]
  );

  const toggleSkill = (skillName: string): void => {
    if (!task) return;
    const hasSkill = selectedTaskSkills.includes(skillName);
    const nextSkills = hasSkill
      ? selectedTaskSkills.filter((name) => name !== skillName)
      : [...selectedTaskSkills, skillName];
    dispatch({ type: 'setTaskSkills', taskId: task.id, skills: nextSkills });
  };

  if (!task) return <Panel>No task available.</Panel>;

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title={task.title} subtitle={task.id} />
        <p className="text-sm text-slate-300">{task.goal}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="pill">Type {task.type}</span>
          <span className="pill">State {task.state}</span>
          <span className="pill">Repos {task.targetRepositoryIds.length}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => dispatch({ type: 'advanceTask', taskId: task.id })} className="rounded-xl border border-cyan-400/30 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100">Advance task</button>
          {firstRun ? (
            <button onClick={() => dispatch({ type: 'advanceRun', runId: firstRun.id })} className="rounded-xl border border-indigo-400/30 bg-indigo-500/20 px-3 py-2 text-sm text-indigo-100">Advance run</button>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Assigned Agent (TaskSpec.agentId)"
          subtitle="Optional routing override"
        />
        {agentsError ? <p className="text-sm text-rose-300">{agentsError}</p> : null}
        <div className="grid gap-2 md:grid-cols-[320px_1fr]">
          <select
            value={selectedTaskAgentId ?? ''}
            onChange={(event) => {
              const nextAgentId = event.target.value.trim();
              if (nextAgentId) {
                dispatch({
                  type: 'setTaskAssignedAgent',
                  taskId: task.id,
                  agentId: nextAgentId
                });
                return;
              }
              dispatch({
                type: 'setTaskAssignedAgent',
                taskId: task.id
              });
            }}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="">No explicit assignment (use default router)</option>
            {sortedAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.role})
              </option>
            ))}
          </select>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
            {selectedTaskAgentId
              ? `Task will prefer agent ${selectedTaskAgentId} during routing when supported by the orchestrator.`
              : 'No agent selected. The orchestrator uses default role-based routing.'}
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Task Skills (TaskSpec.skills)"
          subtitle="Planner and retrieval context"
          action={
            <button
              onClick={() => dispatch({ type: 'setTaskSkills', taskId: task.id, skills: [] })}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
            >
              Clear
            </button>
          }
        />
        {skillsError ? <p className="text-sm text-rose-300">{skillsError}</p> : null}
        {availableSkills.length === 0 ? (
          <p className="text-sm text-slate-400">No installed skills found. Install skills from the Skills page.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {availableSkills.map((skill) => {
              const checked = selectedTaskSkills.includes(skill.name);
              return (
                <label key={skill.id} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSkill(skill.name)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-white">{skill.name}</span>
                    <span className="block text-xs text-slate-400">{skill.repositoryUrl}</span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Selected skills: {selectedTaskSkills.length > 0 ? selectedTaskSkills.join(', ') : 'none'}
        </p>
      </Panel>

      <Panel>
        <SectionHeading
          title="Task Snapshot History"
          subtitle={`${taskSnapshots.length} snapshots`}
          action={
            <button
              onClick={() => void loadTaskSnapshots()}
              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
            >
              Refresh
            </button>
          }
        />
        {snapshotError ? <p className="text-sm text-rose-300">{snapshotError}</p> : null}
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <select
            value={leftSnapshotId}
            onChange={(event) => setLeftSnapshotId(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="">Left snapshot</option>
            {taskSnapshots.map((snapshot) => (
              <option key={`task-left:${snapshot.id}`} value={snapshot.id}>
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
            {taskSnapshots.map((snapshot) => (
              <option key={`task-right:${snapshot.id}`} value={snapshot.id}>
                {snapshot.label} · {snapshot.trigger}
              </option>
            ))}
          </select>
          <button
            onClick={() => void compareSnapshots()}
            className="rounded-xl border border-cyan-400/30 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100"
          >
            Diff
          </button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs">
            <div className="label">Added</div>
            <div className="mt-2 space-y-1 text-emerald-100">
              {snapshotDiff?.added.map((entry) => (
                <div key={`task-added:${entry}`} className="truncate">{entry}</div>
              ))}
              {(snapshotDiff?.added.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs">
            <div className="label">Removed</div>
            <div className="mt-2 space-y-1 text-rose-100">
              {snapshotDiff?.removed.map((entry) => (
                <div key={`task-removed:${entry}`} className="truncate">{entry}</div>
              ))}
              {(snapshotDiff?.removed.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs">
            <div className="label">Changed</div>
            <div className="mt-2 space-y-1 text-cyan-100">
              {snapshotDiff?.changed.map((entry) => (
                <div key={`task-changed:${entry.path}`} className="truncate">{entry.path}</div>
              ))}
              {(snapshotDiff?.changed.length ?? 0) === 0 ? <div className="text-slate-500">none</div> : null}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <TaskTimeline task={task} run={firstRun} />
        <ExecutionTracePanel
          title="Task execution intent"
          rows={[
            { label: 'Scope include', value: task.scopeInclude.join(', ') || 'n/a' },
            { label: 'Scope exclude', value: task.scopeExclude.join(', ') || 'none' },
            { label: 'Verification', value: task.verificationPlan.join(' -> ') },
            { label: 'Budget retries', value: String(task.budget.maxRetries) }
          ]}
        />
      </div>

      <AgentRunTable runs={runs} />
      {firstRun && projectId ? (
        <div className="flex gap-2">
          <Link
            to="/project/$projectId/runs/$runId"
            params={{ projectId, runId: firstRun.id }}
            className="pill border border-white/10"
          >
            Run detail
          </Link>
          <Link
            to="/project/$projectId/retrieval/$runId"
            params={{ projectId, runId: firstRun.id }}
            className="pill border border-white/10"
          >
            Retrieved context
          </Link>
        </div>
      ) : null}
    </div>
  );
}
