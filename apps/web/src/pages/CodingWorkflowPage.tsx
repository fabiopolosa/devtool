import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodingWorkflow, CodingWorkflowDecisionStatus, CodingWorkflowState, Job } from '@cp/domain';
import { Button, Input, Panel, Pill, SectionHeading } from '@/components/common';
import { useAppStore } from '@/store/app-store';
import {
  asyncJobTone,
  isAsyncJobTerminal,
  localWorkerPickupSuggestion,
  readJobErrorMessage,
  shouldFailFastNoWorker,
  toAsyncJobStatus,
  type AsyncJobStatus,
  type JobRuntimeLogLine,
  usePathParam
} from './_utils';

const stateTone = (state: CodingWorkflowState | undefined) => {
  if (state === 'completed' || state === 'plan_approved') return 'good';
  if (state === 'plan_rejected' || state === 'rejected') return 'bad';
  if (state === 'executing' || state === 'task_generation') return 'accent';
  if (state === 'awaiting_plan_approval' || state === 'awaiting_patch_approval' || state === 'planning') return 'warn';
  return 'default';
};

const decisionTone = (state: CodingWorkflowDecisionStatus) => {
  if (state === 'approved') return 'good';
  if (state === 'rejected') return 'bad';
  if (state === 'revision_requested') return 'warn';
  return 'default';
};

const workflowSteps = [
  'Request',
  'Plan',
  'Approve or Revise',
  'Execute',
  'Result'
] as const;

const workflowStepIndex = (state: CodingWorkflowState): number => {
  if (state === 'request') return 0;
  if (state === 'planning' || state === 'awaiting_plan_approval' || state === 'plan_rejected') return 1;
  if (state === 'plan_approved' || state === 'task_generation' || state === 'awaiting_patch_approval') return 2;
  if (state === 'executing' || state === 'review') return 3;
  return 4;
};

type AsyncActionResponse = {
  jobId?: string;
  status?: AsyncJobStatus;
  result?: unknown;
  message?: string;
};

type JobDetailResponse = {
  item?: Job | null;
  message?: string;
};

type JobRuntimeResponse = {
  item?: {
    logs?: JobRuntimeLogLine[];
  } | null;
  message?: string;
};

export function CodingWorkflowPage({ projectId }: { projectId?: string }) {
  const { authActions } = useAppStore();
  const routeProjectId = usePathParam(2);
  const scopedProjectId = projectId ?? routeProjectId;
  const [items, setItems] = useState<CodingWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | undefined>();
  const [requestTitle, setRequestTitle] = useState('');
  const [requestBody, setRequestBody] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [actionBusy, setActionBusy] = useState<string | undefined>();
  const [activeJobId, setActiveJobId] = useState<string | undefined>();
  const [activeJobStatus, setActiveJobStatus] = useState<AsyncJobStatus | undefined>();
  const [activeJobLogs, setActiveJobLogs] = useState<JobRuntimeLogLine[]>([]);
  const [activeJobError, setActiveJobError] = useState<string | undefined>();
  const pollTimeoutRef = useRef<number | undefined>(undefined);
  const pollInFlightRef = useRef(false);

  const selectedWorkflow = useMemo(
    () => items.find((item) => item.id === selectedWorkflowId) ?? items[0],
    [items, selectedWorkflowId]
  );
  const activeStep = selectedWorkflow ? workflowStepIndex(selectedWorkflow.state) : 0;
  const canPlanDecision = Boolean(
    selectedWorkflow &&
      (selectedWorkflow.state === 'awaiting_plan_approval' || selectedWorkflow.state === 'planning')
  );
  const canPatchDecision = Boolean(selectedWorkflow && selectedWorkflow.state === 'awaiting_patch_approval');

  const nextActionHint = useMemo(() => {
    if (!selectedWorkflow) return 'Create a request to start the flow.';
    if (selectedWorkflow.state === 'awaiting_plan_approval' || selectedWorkflow.state === 'planning') {
      return 'Review the plan, then approve or request revision.';
    }
    if (selectedWorkflow.state === 'awaiting_patch_approval') {
      return 'Approve patch execution or request patch revision.';
    }
    if (selectedWorkflow.state === 'executing') {
      return 'Execution is running through the runner.';
    }
    if (selectedWorkflow.state === 'review') {
      return 'Review generated outputs and timeline details.';
    }
    if (selectedWorkflow.state === 'completed') {
      return 'Workflow completed. Start a new request for the next change.';
    }
    if (selectedWorkflow.state === 'plan_rejected' || selectedWorkflow.state === 'rejected') {
      return 'Rejected flow. Create a new request or reopen with revision.';
    }
    return 'Flow is progressing.';
  }, [selectedWorkflow]);

  const loadWorkflows = useCallback(async () => {
    if (!scopedProjectId) return;
    setLoading(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ items?: CodingWorkflow[]; message?: string }>(
        `/projects/${scopedProjectId}/coding-workflows`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load coding workflows (HTTP ${response.status})`);
      }
      const nextItems = body.items ?? [];
      setItems(nextItems);
      setSelectedWorkflowId((current) => current ?? nextItems[0]?.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load coding workflows');
    } finally {
      setLoading(false);
    }
  }, [authActions, scopedProjectId]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  useEffect(
    () => () => {
      if (pollTimeoutRef.current !== undefined) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    },
    []
  );

  const pollJobStatus = useCallback(
    async (jobId: string): Promise<void> => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const [{ response: jobResponse, body: jobBody }, { response: runtimeResponse, body: runtimeBody }] =
          await Promise.all([
            authActions.apiFetchJson<JobDetailResponse>(`/jobs/${jobId}`),
            authActions.apiFetchJson<JobRuntimeResponse>(`/jobs/${jobId}/runtime`)
          ]);
        if (!jobResponse.ok || !jobBody.item) {
          throw new Error(jobBody.message ?? `Unable to inspect job ${jobId} (HTTP ${jobResponse.status})`);
        }

        const nextStatus = toAsyncJobStatus(jobBody.item);
        const nextLogs = runtimeResponse.ok ? runtimeBody.item?.logs ?? [] : [];
        const nextError = readJobErrorMessage(jobBody.item);

        if (shouldFailFastNoWorker(jobBody.item, nextLogs)) {
          setActiveJobStatus("error");
          setActiveJobError(localWorkerPickupSuggestion);
          setError(localWorkerPickupSuggestion);
          setActionBusy(undefined);
          return;
        }

        setActiveJobStatus(nextStatus);
        setActiveJobLogs(nextLogs);
        setActiveJobError(nextError);

        if (nextStatus === "error") {
          setError(nextError ?? `Job ${jobId} failed.`);
          setActionBusy(undefined);
          await loadWorkflows();
          return;
        }

        if (isAsyncJobTerminal(nextStatus)) {
          setActionBusy(undefined);
          await loadWorkflows();
          return;
        }

        const delayMs = nextStatus === "pending" ? 600 : 1000;
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollJobStatus(jobId);
        }, delayMs);
      } catch (pollError) {
        const message = pollError instanceof Error ? pollError.message : "Unable to refresh job status.";
        setError(message);
        setActiveJobError(message);
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollJobStatus(jobId);
        }, 1500);
      } finally {
        pollInFlightRef.current = false;
      }
    },
    [authActions, loadWorkflows]
  );

  const createRequest = useCallback(async () => {
    if (!scopedProjectId || !requestBody.trim()) return;
    setActionBusy('create');
    setError(undefined);
    setActiveJobError(undefined);
    try {
      const response = await authActions.apiFetch(`/projects/${scopedProjectId}/coding-workflows`, {
        method: 'POST',
        body: JSON.stringify({
          title: requestTitle.trim() || requestBody.trim().slice(0, 64),
          request: requestBody
        })
      });
      const body = (await response.json()) as AsyncActionResponse;
      if (!response.ok || !body.jobId) {
        throw new Error(body.message ?? `Unable to create coding workflow (HTTP ${response.status})`);
      }
      setRequestBody('');
      setRequestTitle('');
      setActiveJobId(body.jobId);
      setActiveJobStatus(body.status ?? 'pending');
      setActiveJobLogs([]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create coding workflow');
      setActionBusy(undefined);
    } finally {
      if (pollTimeoutRef.current !== undefined) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    }
  }, [authActions, requestBody, requestTitle, scopedProjectId]);

  useEffect(() => {
    if (!activeJobId) return;
    if (pollTimeoutRef.current !== undefined) {
      window.clearTimeout(pollTimeoutRef.current);
    }
    void pollJobStatus(activeJobId);
    return () => {
      if (pollTimeoutRef.current !== undefined) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [activeJobId, pollJobStatus]);

  const runAction = useCallback(
    async (workflowId: string, action: 'plan/approve' | 'plan/reject' | 'plan/request-revision' | 'patch/approve' | 'patch/reject' | 'patch/request-revision') => {
      if (!scopedProjectId) return;
      setActionBusy(action);
      setError(undefined);
      setActiveJobError(undefined);
      try {
        const response = await authActions.apiFetch(`/projects/${scopedProjectId}/coding-workflows/${workflowId}/${action}`, {
          method: 'POST',
          body: JSON.stringify(
            revisionNote.trim()
              ? {
                  note: revisionNote.trim()
                }
              : {}
          )
        });
        const body = (await response.json()) as AsyncActionResponse;
        if (!response.ok || !body.jobId) {
          throw new Error(body.message ?? `Unable to run workflow action (HTTP ${response.status})`);
        }
        setRevisionNote('');
        setSelectedWorkflowId(workflowId);
        setActiveJobId(body.jobId);
        setActiveJobStatus(body.status ?? 'pending');
        setActiveJobLogs([]);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Unable to update workflow');
        setActionBusy(undefined);
      } finally {
        if (pollTimeoutRef.current !== undefined) {
          window.clearTimeout(pollTimeoutRef.current);
        }
      }
    },
    [authActions, revisionNote, scopedProjectId]
  );

  if (!scopedProjectId) {
    return (
      <Panel>
        <SectionHeading title="Coding Workflow" subtitle="Project-scoped development module" />
        <p className="text-sm text-[color:var(--muted)]">Project id not available.</p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Panel>
          <SectionHeading title="Coding Workflow" subtitle="Development with HITL gates" />
          <p className="text-sm text-[color:var(--muted)]">
            Create a coding request, approve the generated plan, and gate patch execution before completion.
          </p>
        </Panel>

        <Panel>
          <div className="space-y-3">
            <div className="label">New request</div>
            <Input
              value={requestTitle}
              onChange={setRequestTitle}
              placeholder="Optional request title"
            />
            <textarea
              value={requestBody}
              onChange={(event) => setRequestBody(event.target.value)}
              placeholder="Describe the coding request, constraints, and target outcome..."
              className="min-h-[140px] w-full rounded-xl border border-white/10 bg-slate-950/50 p-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
            />
            <div className="flex items-center justify-between gap-2">
              <Pill tone="accent">{items.length} workflows</Pill>
              <Button onClick={() => void createRequest()} variant="primary">
                {actionBusy === 'create' ? 'Creating...' : 'Create request'}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionHeading
            title="Workflows"
            subtitle={loading ? "Refreshing" : "Current project queue"}
            action={
              <Button variant="secondary" onClick={() => void loadWorkflows()}>
                Refresh
              </Button>
            }
          />
          {error ? <p className="mb-3 text-sm text-rose-300">{error}</p> : null}
          <div className="space-y-2">
            {items.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                onClick={() => setSelectedWorkflowId(workflow.id)}
                className={`w-full border px-3 py-2 text-left transition ${
                  selectedWorkflow?.id === workflow.id
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[color:var(--text)]">{workflow.title}</div>
                    <div className="truncate text-xs text-[color:var(--muted)]">{workflow.request}</div>
                  </div>
                  <Pill tone={stateTone(workflow.state)}>{workflow.state}</Pill>
                </div>
              </button>
            ))}
            {!loading && items.length === 0 ? (
              <p className="text-sm text-[color:var(--muted)]">No coding workflows yet.</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel className="space-y-4">
        <SectionHeading
          title={selectedWorkflow?.title ?? 'Workflow detail'}
          subtitle={selectedWorkflow ? selectedWorkflow.request : 'Select a workflow to inspect plan, tasks, and timeline'}
        />
        <div className="border border-white/10 bg-black/20 p-3">
          <div className="label">Workflow steps</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-5">
            {workflowSteps.map((step, index) => {
              const tone = index < activeStep ? 'good' : index === activeStep ? 'accent' : 'default';
              return (
                <div key={step} className="border border-white/10 bg-white/5 p-2">
                  <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">Step {index + 1}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-sm text-[color:var(--text)]">{step}</span>
                    <Pill tone={tone}>{index < activeStep ? 'done' : index === activeStep ? 'current' : 'next'}</Pill>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">{nextActionHint}</p>
        </div>

        {activeJobId ? (
          <div className="border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="label">Execution job</div>
              {activeJobStatus ? <Pill tone={asyncJobTone(activeJobStatus)}>{activeJobStatus}</Pill> : null}
            </div>
            <div className="mt-1 text-xs text-[color:var(--muted)]">jobId: {activeJobId}</div>
            {activeJobError ? <p className="mt-2 text-sm text-[color:var(--bad)]">{activeJobError}</p> : null}
            {activeJobLogs.length > 0 ? (
              <div className="mt-3 space-y-1 border border-white/10 bg-white/5 p-2 text-xs text-[color:var(--muted)]">
                {activeJobLogs.slice(-6).map((line, index) => (
                  <div key={`${line.timestamp}:${line.event}:${index}`}>
                    [{line.event}] {line.message}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[color:var(--muted)]">Waiting for runner logs…</p>
            )}
          </div>
        ) : null}

        {selectedWorkflow ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill tone={stateTone(selectedWorkflow.state)}>{selectedWorkflow.state}</Pill>
              <Pill tone={decisionTone(selectedWorkflow.planDecision)}>plan {selectedWorkflow.planDecision}</Pill>
              <Pill tone={decisionTone(selectedWorkflow.patchDecision)}>patch {selectedWorkflow.patchDecision}</Pill>
              <Pill tone={selectedWorkflow.actionRequired ? 'warn' : 'good'}>
                {selectedWorkflow.actionRequired ? 'action required' : 'idle'}
              </Pill>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border border-white/10 bg-black/20 p-3">
                <div className="label">Plan</div>
                <div className="mt-1 text-sm text-white">{selectedWorkflow.plan.summary}</div>
                <p className="mt-2 text-sm text-[color:var(--muted)]">{selectedWorkflow.plan.rationale}</p>
                <div className="mt-3 space-y-2">
                  <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">Tasks</div>
                  {selectedWorkflow.plan.tasks.map((task) => (
                    <div key={task.id} className="border border-white/10 bg-white/5 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">{task.title}</span>
                        <Pill tone={task.status === 'draft' ? 'default' : task.status === 'ready' ? 'good' : 'warn'}>
                          {task.status}
                        </Pill>
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">{task.description}</div>
                      <div className="mt-2 text-xs text-cyan-100/80">
                        {task.files.join(', ') || 'no files yet'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-white/10 bg-black/20 p-3">
                <div className="label">Gate actions</div>
                <div className="mt-2 space-y-3">
                  <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">Plan gate</div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => (canPlanDecision ? void runAction(selectedWorkflow.id, 'plan/approve') : undefined)}>
                      {actionBusy === 'plan/approve' ? 'Approving...' : 'Approve plan'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        canPlanDecision ? void runAction(selectedWorkflow.id, 'plan/request-revision') : undefined
                      }
                    >
                      {actionBusy === 'plan/request-revision' ? 'Requesting...' : 'Request plan revision'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => (canPlanDecision ? void runAction(selectedWorkflow.id, 'plan/reject') : undefined)}
                    >
                      Reject plan
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">Patch gate</div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => (canPatchDecision ? void runAction(selectedWorkflow.id, 'patch/approve') : undefined)}>
                      {actionBusy === 'patch/approve' ? 'Executing...' : 'Approve patch'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        canPatchDecision ? void runAction(selectedWorkflow.id, 'patch/request-revision') : undefined
                      }
                    >
                      Request patch revision
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => (canPatchDecision ? void runAction(selectedWorkflow.id, 'patch/reject') : undefined)}
                    >
                      Reject patch
                    </Button>
                  </div>
                </div>
                {!canPlanDecision && !canPatchDecision ? (
                  <p className="mt-2 text-sm text-[color:var(--muted)]">No gate action currently required for this workflow state.</p>
                ) : null}
                <div className="mt-3">
                  <Input value={revisionNote} onChange={setRevisionNote} placeholder="Optional revision note" />
                </div>
              </div>
            </div>

            {selectedWorkflow.plan.patchProposal ? (
              <div className="border border-cyan-400/20 bg-cyan-500/8 p-3">
                <div className="label">Patch proposal</div>
                <div className="mt-1 text-sm text-white">{selectedWorkflow.plan.patchProposal.summary}</div>
                <div className="mt-2 text-xs text-[color:var(--muted)]">
                  Files: {selectedWorkflow.plan.patchProposal.files.join(', ') || 'n/a'}
                </div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  Commands: {selectedWorkflow.plan.patchProposal.commands.join(' · ') || 'n/a'}
                </div>
              </div>
            ) : null}

            {selectedWorkflow.generatedTaskIds.length > 0 ? (
              <div className="border border-white/10 bg-white/5 p-3">
                <div className="label">Generated task records</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedWorkflow.generatedTaskIds.map((taskId) => (
                    <Pill key={taskId}>{taskId}</Pill>
                  ))}
                </div>
              </div>
            ) : null}

            {(selectedWorkflow.state === 'completed' || selectedWorkflow.state === 'review' || selectedWorkflow.reviewSummary) ? (
              <div className="border border-emerald-400/20 bg-emerald-500/10 p-3">
                <div className="label">Result</div>
                <p className="mt-1 text-sm text-[color:var(--text)]">
                  {selectedWorkflow.reviewSummary ?? 'Execution finished successfully and artifacts are available in the project workspace.'}
                </p>
              </div>
            ) : null}

            <div className="border border-white/10 bg-black/20 p-3">
              <div className="label">Timeline</div>
              <div className="mt-2 space-y-2">
                {selectedWorkflow.timeline.map((entry) => (
                  <div key={entry.id} className="border border-white/10 bg-white/5 p-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-white">{entry.type}</span>
                      <span className="text-xs text-[color:var(--muted)]">{entry.createdAt}</span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">{entry.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[color:var(--muted)]">Select a workflow to view the plan and approval gates.</p>
        )}
      </Panel>
    </div>
  );
}
