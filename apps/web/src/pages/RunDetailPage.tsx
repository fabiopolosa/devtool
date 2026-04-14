import { Link } from '@tanstack/react-router';
import { Panel, SectionHeading } from '@/components/common';
import { AgentRunTable, ExecutionTracePanel, VerificationSummary } from '@/components/panels';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

export function RunDetailPage() {
  const { state } = useAppStore();
  const runId = usePathParam(1);
  const run = state.taskRuns.find((item) => item.id === runId) ?? state.taskRuns[0];

  if (!run) return <Panel>No run available.</Panel>;

  const task = state.tasks.find((item) => item.id === run.taskId);
  const verification = state.verificationResults.find((item) => item.runId === run.id);
  const steps = state.verificationSteps.filter((item) => item.runId === run.id);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading title={`Run ${run.id}`} subtitle={task?.title ?? run.taskId} />
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">Workflow: {run.workflowId}</div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">Status: {run.status}</div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">Retries: {run.retryCount}</div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">Token proxy: {run.costProxyInputTokens + run.costProxyOutputTokens}</div>
        </div>
      </Panel>

      <ExecutionTracePanel
        title="Execution timeline"
        rows={[
          { label: 'Started', value: run.startedAt ?? 'n/a' },
          { label: 'Ended', value: run.endedAt ?? 'n/a' },
          { label: 'Repos touched', value: run.reposTouched.join(', ') || 'none' },
          { label: 'Current status', value: run.status }
        ]}
      />

      {verification ? <VerificationSummary result={verification} steps={steps} /> : null}
      <AgentRunTable runs={[run]} />

      <div className="flex gap-2">
        <Link to="/artifacts/$runId" params={{ runId: run.id }} className="pill border border-white/10">Artifacts</Link>
        <Link to="/retrieval/$runId" params={{ runId: run.id }} className="pill border border-white/10">Retrieved context</Link>
      </div>
    </div>
  );
}
