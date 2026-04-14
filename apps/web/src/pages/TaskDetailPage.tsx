import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Skill } from '@cp/domain';
import { Panel, SectionHeading } from '@/components/common';
import { AgentRunTable, ExecutionTracePanel, TaskTimeline } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function TaskDetailPage() {
  const { state, dispatch, auth, authActions } = useAppStore();
  const taskId = usePathParam(1);
  const task = state.tasks.find((item) => item.id === taskId) ?? state.tasks[0];
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [skillsError, setSkillsError] = useState<string | undefined>();
  const runs = task ? state.taskRuns.filter((run) => run.taskId === task.id) : [];
  const firstRun = runs[0];
  const selectedTaskSkills = task ? (state.taskSpecSkills[task.id] ?? []) : [];

  const loadInstalledSkills = useCallback(async () => {
    setSkillsError(undefined);
    try {
      const response = await authActions.apiFetch('/skills/installed');
      const body = (await response.json()) as { items?: Skill[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load installed skills (HTTP ${response.status})`);
      }
      setInstalledSkills(body.items ?? []);
    } catch (error) {
      setSkillsError(error instanceof Error ? error.message : 'Unable to load installed skills');
    }
  }, [authActions]);

  useEffect(() => {
    if (!auth.enabled) {
      setInstalledSkills([]);
      return;
    }
    void loadInstalledSkills();
  }, [auth.enabled, loadInstalledSkills]);

  const availableSkills = useMemo(
    () => [...installedSkills].sort((left, right) => left.name.localeCompare(right.name)),
    [installedSkills]
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
      {firstRun ? (
        <div className="flex gap-2">
          <Link to="/runs/$runId" params={{ runId: firstRun.id }} className="pill border border-white/10">Run detail</Link>
          <Link to="/retrieval/$runId" params={{ runId: firstRun.id }} className="pill border border-white/10">Retrieved context</Link>
        </div>
      ) : null}
    </div>
  );
}
