import { Link } from '@tanstack/react-router';
import { Panel, SectionHeading } from '@/components/common';
import { AgentRunTable, ExecutionTracePanel, TaskTimeline } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function TaskDetailPage() {
  const { state, dispatch } = useAppStore();
  const taskId = usePathParam(1);
  const task = state.tasks.find((item) => item.id === taskId) ?? state.tasks[0];

  if (!task) return <Panel>No task available.</Panel>;

  const runs = state.taskRuns.filter((run) => run.taskId === task.id);
  const firstRun = runs[0];

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
