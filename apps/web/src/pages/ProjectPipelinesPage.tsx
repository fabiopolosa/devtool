import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '@cp/domain';
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

const pipelineTypes = new Set<Job["type"]>([
  'ingestion',
  'processing',
  'generation',
  'review',
  'deployment'
]);

const resolveStage = (job: Job): "waiting_user" | "running" | "done" | "error" | "ready" | "waiting_dependencies" => {
  if (job.status === 'waiting_user') return 'waiting_user';
  if (job.status === 'running') return 'running';
  if (job.status === 'done') return 'done';
  if (job.status === 'error') return 'error';
  if (job.status === 'idle' && job.ready) return 'ready';
  return 'waiting_dependencies';
};

const stageTone = (stage: ReturnType<typeof resolveStage>): "warn" | "good" | "bad" | "accent" | "default" => {
  if (stage === 'running' || stage === 'ready') return 'accent';
  if (stage === 'waiting_user') return 'warn';
  if (stage === 'done') return 'good';
  if (stage === 'error') return 'bad';
  return 'default';
};

type LaunchMode = 'auto' | 'remote' | 'local' | 'hybrid';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

const unwrapPipelineResult = (job: Job): {
  action?: string;
  result?: Record<string, unknown>;
  warnings: string[];
} => {
  const payload = asRecord(job.payload);
  const output = asRecord(payload?.output);
  const warnings = asStringArray(asRecord(output?.result)?.warnings);
  if (!output) {
    const action = asString(payload?.internalAction);
    return {
      ...(action ? { action } : {}),
      warnings
    };
  }

  if (asString(output.stage) === 'internal_runner') {
    const action = asString(output.action) ?? asString(payload?.internalAction);
    const result = asRecord(output.result);
    return {
      ...(action ? { action } : {}),
      ...(result ? { result } : {}),
      warnings:
        asStringArray(result?.warnings).length > 0
          ? asStringArray(result?.warnings)
          : warnings
    };
  }

  if (asString(output.stage) === 'local_worker') {
    const localResult = asRecord(output.result);
    if (asString(localResult?.stage) === 'internal_runner') {
      const nested = asRecord(localResult?.output);
      const action = asString(nested?.action) ?? asString(payload?.internalAction);
      const result = asRecord(nested?.result) ?? asRecord(nested?.output);
      return {
        ...(action ? { action } : {}),
        ...(result ? { result } : {}),
        warnings:
          asStringArray(asRecord(nested?.result)?.warnings).length > 0
            ? asStringArray(asRecord(nested?.result)?.warnings)
            : warnings
      };
    }
  }

  const action = asString(payload?.internalAction);
  const result = asRecord(output.result) ?? asRecord(output);
  return {
    ...(action ? { action } : {}),
    ...(result ? { result } : {}),
    warnings
  };
};

const formatPercent = (value: unknown): string => {
  const number = asNumber(value);
  if (number === undefined) return 'n/a';
  return `${Math.round(number * 100)}%`;
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

export function ProjectPipelinesPage() {
  const { state, authActions } = useAppStore();
  const projectId = usePathParam(2);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>();
  const [actionBusy, setActionBusy] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [mode, setMode] = useState<LaunchMode>('auto');
  const [activeJobId, setActiveJobId] = useState<string | undefined>();
  const [activeJobStatus, setActiveJobStatus] = useState<AsyncJobStatus | undefined>();
  const [activeJobLogs, setActiveJobLogs] = useState<JobRuntimeLogLine[]>([]);
  const [activeJobError, setActiveJobError] = useState<string | undefined>();
  const pollTimeoutRef = useRef<number | undefined>(undefined);
  const pollInFlightRef = useRef(false);

  const [researchQuery, setResearchQuery] = useState('');
  const [contentTopic, setContentTopic] = useState('');
  const [contentObjective, setContentObjective] = useState('');
  const [visualConcept, setVisualConcept] = useState('');
  const [multimodalTopic, setMultimodalTopic] = useState('');

  const load = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ items?: Job[]; message?: string }>(
        `/projects/${project.id}/jobs`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load project jobs (HTTP ${response.status})`);
      }
      const nextJobs = body.items ?? [];
      setJobs(nextJobs);
      setSelectedJobId((current) => current ?? nextJobs[0]?.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load pipelines');
    } finally {
      setLoading(false);
    }
  }, [authActions, project?.id]);

  useEffect(() => {
    void load();
  }, [load]);

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
          setActionBusy(undefined);
          setActionError(localWorkerPickupSuggestion);
          return;
        }

        setActiveJobStatus(nextStatus);
        setActiveJobLogs(nextLogs);
        setActiveJobError(nextError);

        if (nextStatus === "error") {
          setActionBusy(undefined);
          setActionError(nextError ?? `Pipeline job ${jobId} failed.`);
          await load();
          return;
        }

        if (isAsyncJobTerminal(nextStatus)) {
          setActionBusy(undefined);
          await load();
          return;
        }

        const delayMs = nextStatus === "pending" ? 600 : 1000;
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollJobStatus(jobId);
        }, delayMs);
      } catch (pollError) {
        const message = pollError instanceof Error ? pollError.message : 'Unable to refresh pipeline job state.';
        setActionError(message);
        setActiveJobError(message);
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollJobStatus(jobId);
        }, 1500);
      } finally {
        pollInFlightRef.current = false;
      }
    },
    [authActions, load]
  );

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

  const pipelineJobs = useMemo(
    () =>
      jobs
        .filter((job) => pipelineTypes.has(job.type))
        .sort((left, right) => {
          if (left.actionRequired !== right.actionRequired) {
            return Number(right.actionRequired) - Number(left.actionRequired);
          }
          if (left.priority !== right.priority) {
            return right.priority - left.priority;
          }
          return right.updatedAt.localeCompare(left.updatedAt);
        }),
    [jobs]
  );
  const selectedJob = useMemo(
    () => pipelineJobs.find((job) => job.id === selectedJobId) ?? pipelineJobs[0],
    [pipelineJobs, selectedJobId]
  );
  const selectedResult = useMemo(() => (selectedJob ? unwrapPipelineResult(selectedJob) : undefined), [selectedJob]);

  const runPipeline = useCallback(
    async (input: {
      key: string;
      endpoint: string;
      payload: Record<string, unknown>;
    }) => {
      if (!project?.id) return;
      setActionBusy(input.key);
      setActionError(undefined);
      setActiveJobError(undefined);
      try {
        const payload = {
          ...input.payload,
          ...(mode === 'auto' ? {} : { mode })
        };
        const response = await authActions.apiFetch(`/projects/${project.id}${input.endpoint}`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const body = (await response.json()) as AsyncActionResponse;
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to run pipeline (HTTP ${response.status})`);
        }
        if (typeof body.jobId === 'string' && body.jobId.trim().length > 0) {
          setSelectedJobId(body.jobId);
          setActiveJobId(body.jobId);
          setActiveJobStatus(body.status ?? 'pending');
          setActiveJobLogs([]);
          return;
        }
        throw new Error('Pipeline response missing jobId.');
      } catch (runError) {
        setActionError(runError instanceof Error ? runError.message : 'Unable to run pipeline');
        setActionBusy(undefined);
      } finally {
        if (pollTimeoutRef.current !== undefined) {
          window.clearTimeout(pollTimeoutRef.current);
        }
      }
    },
    [authActions, mode, project?.id]
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <Panel>
          <SectionHeading
            title="Pipeline Launcher"
            subtitle="Research, long-form content, and multimodal composition run through the runner"
          />
          <div className="mt-3">
            <div className="label">Execution mode</div>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as LaunchMode)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/40"
            >
              <option value="auto">Auto (system decides)</option>
              <option value="local">Local</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          {actionError ? <p className="mt-3 text-sm text-[color:var(--bad)]">{actionError}</p> : null}
          {activeJobId ? (
            <div className="mt-3 border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="label">Active pipeline job</span>
                {activeJobStatus ? <Pill tone={asyncJobTone(activeJobStatus)}>{activeJobStatus}</Pill> : null}
              </div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">jobId: {activeJobId}</div>
              {activeJobError ? <p className="mt-2 text-sm text-[color:var(--bad)]">{activeJobError}</p> : null}
              {activeJobLogs.length > 0 ? (
                <div className="mt-2 space-y-1 border border-white/10 bg-black/20 p-2 text-xs text-[color:var(--muted)]">
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
        </Panel>

        <Panel>
          <div className="space-y-3">
            <div className="label">Research pipeline</div>
            <Input value={researchQuery} onChange={setResearchQuery} placeholder="Research query" />
            <Button
              variant="primary"
              onClick={() =>
                void runPipeline({
                  key: 'research',
                  endpoint: '/pipelines/research',
                  payload: { query: researchQuery }
                })
              }
            >
              {actionBusy === 'research' ? 'Running...' : 'Run research'}
            </Button>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-3">
            <div className="label">Long-form content pipeline</div>
            <Input value={contentTopic} onChange={setContentTopic} placeholder="Content topic" />
            <Input value={contentObjective} onChange={setContentObjective} placeholder="Optional objective" />
            <Button
              variant="primary"
              onClick={() =>
                void runPipeline({
                  key: 'content',
                  endpoint: '/pipelines/content',
                  payload: {
                    topic: contentTopic,
                    ...(contentObjective.trim() ? { objective: contentObjective.trim() } : {})
                  }
                })
              }
            >
              {actionBusy === 'content' ? 'Running...' : 'Run content'}
            </Button>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-3">
            <div className="label">Visual planning pipeline</div>
            <Input value={visualConcept} onChange={setVisualConcept} placeholder="Visual concept" />
            <Button
              variant="primary"
              onClick={() =>
                void runPipeline({
                  key: 'visual',
                  endpoint: '/pipelines/visual',
                  payload: { concept: visualConcept }
                })
              }
            >
              {actionBusy === 'visual' ? 'Running...' : 'Run visual'}
            </Button>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-3">
            <div className="label">Full multimodal pipeline</div>
            <Input value={multimodalTopic} onChange={setMultimodalTopic} placeholder="Topic for research + content + visuals" />
            <Button
              variant="primary"
              onClick={() =>
                void runPipeline({
                  key: 'multimodal',
                  endpoint: '/pipelines/multimodal',
                  payload: { topic: multimodalTopic }
                })
              }
            >
              {actionBusy === 'multimodal' ? 'Running...' : 'Run multimodal'}
            </Button>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Operational Pipelines"
          subtitle="Ingestion, research, generation, review and deployment jobs for this project"
        />
      </Panel>

      {loading ? <Panel><p className="text-sm text-[color:var(--muted)]">Loading pipelines...</p></Panel> : null}
      {error ? <Panel><p className="text-sm text-[color:var(--bad)]">{error}</p></Panel> : null}

      <div className="grid gap-3">
        {pipelineJobs.map((job) => {
          const stage = resolveStage(job);
          const isSelected = selectedJob?.id === job.id;
          const detail = unwrapPipelineResult(job);
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => setSelectedJobId(job.id)}
              className={`w-full text-left transition ${
                isSelected ? 'ring-1 ring-cyan-400/50' : ''
              }`}
            >
              <Panel>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{job.title}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      {job.type} · priority {job.priority} · retries {job.retryCount}/{job.maxRetries}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      dependencies {job.dependsOnCount} · {job.ready ? 'ready' : 'waiting dependencies'}
                    </div>
                    {detail.action ? (
                      <div className="mt-1 text-xs text-cyan-100/80">action: {detail.action}</div>
                    ) : null}
                  </div>
                  <Pill tone={stageTone(stage)}>{stage}</Pill>
                </div>
              </Panel>
            </button>
          );
        })}
        {!loading && !error && pipelineJobs.length === 0 ? (
          <Panel>
            <p className="text-sm text-[color:var(--muted)]">No operational pipelines in this project.</p>
          </Panel>
        ) : null}
      </div>

      <Panel>
        <SectionHeading
          title={selectedJob ? 'Pipeline Output' : 'Pipeline Output'}
          subtitle={selectedJob ? `${selectedJob.title} · ${selectedResult?.action ?? 'no action metadata'}` : 'Select a pipeline job to inspect structured output'}
        />
        {!selectedJob ? (
          <p className="text-sm text-[color:var(--muted)]">No pipeline selected.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {selectedResult?.result && selectedResult.action === 'pipeline.research.run' ? (
              <div className="space-y-3">
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Research summary</div>
                  <div className="mt-1 text-[color:var(--text)]">
                    query: {asString(selectedResult.result.query) ?? 'n/a'}
                  </div>
                  <div className="mt-1 text-[color:var(--muted)]">
                    confidence: {formatPercent(selectedResult.result.confidence)} · {asString(selectedResult.result.retrievalSummary) ?? 'no retrieval summary'}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Summaries</div>
                  <div className="mt-2 space-y-1 text-[color:var(--text)]">
                    {asStringArray(selectedResult.result.summaries).slice(0, 6).map((item) => (
                      <p key={item}>• {item}</p>
                    ))}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Sources</div>
                  <div className="mt-2 space-y-2">
                    {(Array.isArray(selectedResult.result.sources) ? selectedResult.result.sources : [])
                      .slice(0, 8)
                      .map((entry, index) => {
                        const row = asRecord(entry);
                        if (!row) return null;
                        return (
                          <div key={`${asString(row.id) ?? index}`} className="border border-white/10 bg-white/5 p-2">
                            <div className="text-[color:var(--text)]">{asString(row.title) ?? 'Untitled source'}</div>
                            <div className="text-xs text-[color:var(--muted)]">
                              {asString(row.path) ?? 'n/a'} · {asString(row.validationStatus) ?? 'unknown'} · confidence {formatPercent(row.validationConfidence)}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedResult?.result && selectedResult.action === 'pipeline.content.run' ? (
              <div className="space-y-3">
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Content overview</div>
                  <div className="mt-1 text-[color:var(--text)]">
                    topic: {asString(selectedResult.result.topic) ?? 'n/a'}
                  </div>
                  <div className="mt-1 text-[color:var(--muted)]">
                    audience: {asString(selectedResult.result.audience) ?? 'n/a'} · tone: {asString(selectedResult.result.tone) ?? 'n/a'}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Outline</div>
                  <div className="mt-2 space-y-1">
                    {(Array.isArray(selectedResult.result.outline) ? selectedResult.result.outline : [])
                      .slice(0, 10)
                      .map((entry, index) => {
                        const row = asRecord(entry);
                        if (!row) return null;
                        return (
                          <p key={`${asString(row.id) ?? index}`} className="text-[color:var(--text)]">
                            • {asString(row.title) ?? 'Untitled'} — {asString(row.goal) ?? 'No goal'}
                          </p>
                        );
                      })}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Refined summary</div>
                  <p className="mt-1 text-[color:var(--text)]">{asString(selectedResult.result.summary) ?? 'No summary available.'}</p>
                </div>
              </div>
            ) : null}

            {selectedResult?.result && selectedResult.action === 'pipeline.visual.run' ? (
              <div className="space-y-3">
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Visual plan</div>
                  <div className="mt-1 text-[color:var(--text)]">
                    concept: {asString(selectedResult.result.concept) ?? 'n/a'} · style: {asString(selectedResult.result.style) ?? 'n/a'}
                  </div>
                </div>
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="label">Scenes</div>
                  <div className="mt-2 space-y-2">
                    {(Array.isArray(selectedResult.result.scenes) ? selectedResult.result.scenes : [])
                      .slice(0, 8)
                      .map((entry, index) => {
                        const scene = asRecord(entry);
                        if (!scene) return null;
                        return (
                          <div key={`${asString(scene.id) ?? index}`} className="border border-white/10 bg-white/5 p-2">
                            <div className="text-[color:var(--text)]">{asString(scene.title) ?? `Scene ${index + 1}`}</div>
                            <div className="text-xs text-[color:var(--muted)]">
                              camera {asString(scene.camera) ?? 'n/a'} · subject {asString(scene.subject) ?? 'n/a'} · mood {asString(scene.mood) ?? 'n/a'}
                            </div>
                            <div className="mt-1 text-xs text-cyan-100/80">{asString(scene.prompt) ?? 'No prompt'}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : null}

            {selectedResult?.result && selectedResult.action === 'pipeline.multimodal.run' ? (
              (() => {
                const research = asRecord(selectedResult.result.research);
                const content = asRecord(selectedResult.result.content);
                const assets = asRecord(selectedResult.result.assets);
                const imageCount = Array.isArray(assets?.images) ? assets.images.length : 0;
                const videoCount = Array.isArray(assets?.videoSegments) ? assets.videoSegments.length : 0;
                return (
                  <div className="space-y-3">
                    <div className="border border-white/10 bg-black/20 p-3">
                      <div className="label">Multimodal output</div>
                      <div className="mt-1 text-[color:var(--text)]">topic: {asString(selectedResult.result.topic) ?? 'n/a'}</div>
                    </div>
                    <div className="border border-white/10 bg-black/20 p-3">
                      <div className="label">Research confidence</div>
                      <div className="mt-1 text-[color:var(--text)]">
                        {formatPercent(research?.confidence)}
                      </div>
                    </div>
                    <div className="border border-white/10 bg-black/20 p-3">
                      <div className="label">Content summary</div>
                      <p className="mt-1 text-[color:var(--text)]">{asString(content?.summary) ?? 'No summary available.'}</p>
                    </div>
                    <div className="border border-white/10 bg-black/20 p-3">
                      <div className="label">Generated assets</div>
                      <div className="mt-1 text-[color:var(--text)]">
                        images: {imageCount}
                      </div>
                      <div className="mt-1 text-[color:var(--muted)]">
                        video segments: {videoCount}
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : null}

            {!selectedResult?.result ? (
              <p className="text-sm text-[color:var(--muted)]">No structured output captured for this job yet.</p>
            ) : null}

            {selectedResult?.warnings.length ? (
              <div className="border border-amber-300/30 bg-amber-500/10 p-3">
                <div className="label">Warnings</div>
                <div className="mt-2 space-y-1 text-xs text-amber-100/90">
                  {selectedResult.warnings.slice(0, 8).map((warning) => (
                    <p key={warning}>• {warning}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Panel>
      </div>
    </div>
  );
}
