import React from 'react';
import type {
  Approval,
  Artifact,
  AutoResearchExperiment,
  AutoResearchRun,
  MemoryChunk,
  ProviderConfig,
  ProviderHealthcheck,
  ProviderModel,
  Project,
  ProjectProviderBinding,
  Repository,
  RetrievalQueryLog,
  RoadmapItem,
  PromptVersion,
  Task,
  TaskRun,
  VerificationResult,
  VerificationStep
} from '@cp/domain';
import { Button, Panel, Pill, ProgressBar, SectionHeading, SoftPanel } from './common';

export function ProjectCard({ project, repoCount, roadmapCount, taskCount }: { project: Project; repoCount: number; roadmapCount: number; taskCount: number }) {
  return (
    <Panel className="group transition hover:border-cyan-400/20 hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Project</div>
          <h3 className="mt-1 text-xl font-semibold text-white">{project.name}</h3>
          <p className="mt-2 text-sm text-slate-400">{project.description}</p>
        </div>
        <Pill tone={project.status === 'active' ? 'good' : 'default'}>{project.status}</Pill>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm text-slate-300">
        <SoftPanel className="p-3"><div className="label">Repos</div><div className="mt-1 text-lg text-white">{repoCount}</div></SoftPanel>
        <SoftPanel className="p-3"><div className="label">Roadmap</div><div className="mt-1 text-lg text-white">{roadmapCount}</div></SoftPanel>
        <SoftPanel className="p-3"><div className="label">Tasks</div><div className="mt-1 text-lg text-white">{taskCount}</div></SoftPanel>
      </div>
    </Panel>
  );
}

export function RepoStatusCard({ repository, linkedProject }: { repository: Repository; linkedProject?: string }) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Repository</div>
          <h3 className="mt-1 text-lg font-semibold text-white">{repository.name}</h3>
          <p className="mt-2 text-sm text-slate-400">{repository.url}</p>
        </div>
        <Pill tone={repository.status === 'active' ? 'good' : 'warn'}>{repository.status}</Pill>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-300">
        <div className="flex justify-between gap-3"><span className="text-slate-500">Default branch</span><span>{repository.defaultBranch}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500">Project</span><span>{linkedProject ?? 'Unlinked'}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500">Local path</span><span className="truncate">{repository.localPath ?? 'n/a'}</span></div>
      </div>
    </Panel>
  );
}

export function RoadmapItemCard({
  item,
  onApprove,
  onReject,
  onMoveUp,
  onMoveDown,
  onSplit
}: {
  item: RoadmapItem;
  onApprove?: () => void;
  onReject?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSplit?: () => void;
}) {
  const tone = item.state === 'approved' ? 'good' : item.state === 'proposed' ? 'warn' : item.state === 'rejected' ? 'bad' : 'default';
  return (
    <Panel className="h-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label">Roadmap item</div>
          <h3 className="mt-1 text-lg font-semibold text-white">{item.title}</h3>
        </div>
        <Pill tone={tone as any}>{item.state}</Pill>
      </div>
      <p className="mt-3 text-sm text-slate-400">{item.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onApprove}>Approve</Button>
        <Button onClick={onReject}>Reject</Button>
        <Button onClick={onMoveUp}>Up</Button>
        <Button onClick={onMoveDown}>Down</Button>
        <Button onClick={onSplit}>Split</Button>
      </div>
    </Panel>
  );
}

export function RoadmapBoard({ items, onApprove, onReject, onMoveUp, onMoveDown, onSplit }: { items: RoadmapItem[]; onApprove?: (id: string) => void; onReject?: (id: string) => void; onMoveUp?: (id: string) => void; onMoveDown?: (id: string) => void; onSplit?: (id: string) => void; }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <RoadmapItemCard
          key={item.id}
          item={item}
          onApprove={() => onApprove?.(item.id)}
          onReject={() => onReject?.(item.id)}
          onMoveUp={() => onMoveUp?.(item.id)}
          onMoveDown={() => onMoveDown?.(item.id)}
          onSplit={() => onSplit?.(item.id)}
        />
      ))}
    </div>
  );
}

export function TaskTimeline({ task, run }: { task: Task; run?: TaskRun | undefined }) {
  const states: Task['state'][] = ['draft', 'proposed', 'approved', 'queued', 'running', 'waiting_for_research', 'waiting_for_debug', 'waiting_for_approval', 'verification_failed', 'completed', 'archived', 'canceled'];
  const activeIndex = states.indexOf(task.state);
  return (
    <Panel>
      <SectionHeading title="Task timeline" subtitle={task.type} />
      <div className="space-y-3">
        {states.map((state, index) => (
          <div key={state} className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${index <= activeIndex ? 'bg-cyan-400' : 'bg-white/15'}`} />
            <div className="flex-1 text-sm text-slate-300">{state}</div>
            <div className="text-xs text-slate-500">{index === activeIndex ? 'current' : index < activeIndex ? 'done' : 'next'}</div>
          </div>
        ))}
      </div>
      {run ? <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">Run status: {run.status} · retries {run.retryCount}</div> : null}
    </Panel>
  );
}

export function VerificationSummary({ result, steps }: { result: VerificationResult; steps: VerificationStep[] }) {
  const tone = result.overallStatus === 'pass' ? 'good' : result.overallStatus === 'fail' ? 'bad' : 'warn';
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Verification</div>
          <h3 className="mt-1 text-xl font-semibold text-white">{result.summary}</h3>
        </div>
        <Pill tone={tone as any}>{result.overallStatus}</Pill>
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((step) => (
          <div key={step.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-white">{step.stepType}</div>
              <Pill tone={step.status === 'pass' ? 'good' : step.status === 'fail' ? 'bad' : 'default'}>{step.status}</Pill>
            </div>
            <div className="mt-1 text-slate-400">{step.command}</div>
          </div>
        ))}
      </div>
      <div className="mt-4"><ProgressBar value={(result.score ?? 0) * 100} /></div>
    </Panel>
  );
}

export function AgentRunTable({ runs }: { runs: TaskRun[] }) {
  return (
    <Panel>
      <SectionHeading title="Agent runs" subtitle="Execution" />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="py-2 pr-4 font-medium">Run</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Retries</th>
              <th className="py-2 pr-4 font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-white/5">
                <td className="py-2 pr-4 text-white">{run.id}</td>
                <td className="py-2 pr-4"><Pill tone={run.status === 'completed' ? 'good' : run.status === 'failed' ? 'bad' : 'warn'}>{run.status}</Pill></td>
                <td className="py-2 pr-4 text-slate-300">{run.retryCount}</td>
                <td className="py-2 pr-4 text-slate-300">{run.costProxyInputTokens + run.costProxyOutputTokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function MemoryChunkList({ chunks }: { chunks: MemoryChunk[] }) {
  return (
    <div className="space-y-3">
      {chunks.map((chunk) => (
        (() => {
          const source = typeof chunk.metadata.source === 'string' ? chunk.metadata.source : 'unknown';
          const embeddingRef = chunk.embeddingRef ?? 'none';
          return (
        <Panel key={chunk.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label">{chunk.category}</div>
              <div className="mt-1 font-semibold text-white">{chunk.chunkTitle}</div>
            </div>
            <Pill tone="accent">{chunk.tokenEstimate} tokens</Pill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{chunk.chunkText}</p>
          <div className="mt-3 text-xs text-slate-500">Source {source} · ref {embeddingRef}</div>
        </Panel>
          );
        })()
      ))}
    </div>
  );
}

export function RetrievalContextCard({ log, chunks }: { log: RetrievalQueryLog; chunks: MemoryChunk[] }) {
  return (
    <Panel>
      <SectionHeading title="Retrieved context" subtitle="Packet" />
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
        <div className="label">Query</div>
        <div className="mt-1 text-white">{log.queryText}</div>
      </div>
      <div className="mt-4 space-y-2">
        {chunks.map((chunk) => (
          <div key={chunk.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-white">{chunk.chunkTitle}</div>
              <Pill tone="accent">{chunk.tokenEstimate}</Pill>
            </div>
            <div className="mt-1 text-slate-400">{chunk.chunkText}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ArtifactPanel({ artifacts }: { artifacts: Artifact[] }) {
  return (
    <Panel>
      <SectionHeading title="Artifacts" subtitle="Logs & outputs" />
      <div className="space-y-3">
        {artifacts.map((artifact) => (
          <div key={artifact.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-white">{artifact.type}</div>
                <div className="mt-1 text-slate-400">{artifact.summary}</div>
              </div>
              <Pill tone="default">{artifact.schemaVersion}</Pill>
            </div>
            <div className="mt-2 text-xs text-slate-500">{artifact.uri}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ApprovalBar({ approvals, onApprove, onReject }: { approvals: Approval[]; onApprove?: (id: string) => void; onReject?: (id: string) => void; }) {
  return (
    <Panel>
      <SectionHeading title="Approvals" subtitle="Gate" />
      <div className="space-y-3">
        {approvals.map((approval) => (
          <div key={approval.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-white">{approval.subjectType}</div>
                <div className="mt-1 text-sm text-slate-400">{approval.reason}</div>
              </div>
              <Pill tone={approval.status === 'approved' ? 'good' : approval.status === 'rejected' ? 'bad' : 'warn'}>{approval.status}</Pill>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => onApprove?.(approval.subjectId)}>Approve</Button>
              <Button onClick={() => onReject?.(approval.subjectId)}>Reject</Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function PlannerOutputCard({ title, summary }: { title: string; summary: string }) {
  return (
    <Panel>
      <SectionHeading title="Planner output" subtitle="Spec" />
      <div className="text-lg font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{summary}</p>
    </Panel>
  );
}

export function ExperimentTable({ experiments, runs }: { experiments: AutoResearchExperiment[]; runs: AutoResearchRun[] }) {
  return (
    <Panel>
      <SectionHeading title="AutoResearch" subtitle="Experiments" />
      <div className="space-y-4">
        {experiments.map((experiment) => (
          <div key={experiment.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-white">{experiment.targetType}</div>
                <div className="mt-1 text-sm text-slate-400">Baseline {experiment.baselineVersionRef}</div>
              </div>
              <Pill tone={experiment.status === 'running' ? 'warn' : 'good'}>{experiment.status}</Pill>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {runs.filter((run) => run.experimentId === experiment.id).map((run) => (
                <SoftPanel key={run.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white">{run.variantId}</span>
                    <Pill tone={run.winnerFlag ? 'good' : 'default'}>{run.winnerFlag ? 'winner' : run.status}</Pill>
                  </div>
                  <div className="mt-2 text-slate-400">first pass {run.metrics.first_pass_success}</div>
                </SoftPanel>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function PromptVersionPanel({ versions }: { versions: PromptVersion[] }) {
  return (
    <Panel>
      <SectionHeading title="Prompt versions" subtitle="Policy" />
      <div className="space-y-2 text-sm text-slate-300">
        {versions.map((version) => (
          <div key={version.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-white">{version.role} · {version.version}</div>
              <Pill tone={version.promoted ? 'good' : 'default'}>{version.promoted ? 'promoted' : 'draft'}</Pill>
            </div>
            <div className="mt-1 text-slate-400">{version.contentRef}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ProviderStatusPanel({ configs, health }: { configs: ProviderConfig[]; health: ProviderHealthcheck[] }) {
  return (
    <Panel>
      <SectionHeading title="Providers" subtitle="Health" />
      <div className="space-y-3">
        {configs.map((config) => {
          const latest = health.find((entry) => entry.providerConfigId === config.id);
          return (
            <div key={config.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-white">{config.provider}</div>
                  <div className="mt-1 text-xs text-slate-500">{config.endpoint}</div>
                </div>
                <Pill tone={!config.enabled ? 'bad' : latest?.status === 'healthy' ? 'good' : 'warn'}>{latest?.status ?? 'unknown'}</Pill>
              </div>
              {latest ? <div className="mt-2 text-xs text-slate-400">{latest.details} · {latest.latencyMs}ms</div> : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function ProviderBindingTable({ bindings, models }: { bindings: ProjectProviderBinding[]; models: ProviderModel[] }) {
  return (
    <Panel>
      <SectionHeading title="Project bindings" subtitle="Routing" />
      <div className="space-y-2 text-sm">
        {bindings.map((binding) => {
          const model = models.find((entry) => entry.id === binding.primaryModelId);
          return (
            <div key={binding.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-white">{binding.capabilityClass}</div>
                <Pill tone="accent">{binding.role ?? 'default'}</Pill>
              </div>
              <div className="mt-2 text-slate-400">Primary {model?.modelId ?? binding.primaryModelId}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function ChatComposer({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = React.useState('');
  return (
    <Panel>
      <SectionHeading title="Command center" subtitle="Chat" />
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask the system to plan, route, inspect, or prepare a task..."
        className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
      />
      <div className="mt-3 flex justify-end">
        <Button variant="primary" onClick={() => { onSubmit(value); setValue(''); }}>Send</Button>
      </div>
    </Panel>
  );
}

export function ExecutionTracePanel({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <Panel>
      <SectionHeading title={title} subtitle="Trace" />
      <div className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-slate-500">{row.label}</div>
            <div className="max-w-[70%] text-right text-white">{row.value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
