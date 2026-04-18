import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Job, ProjectRuntimeProfile } from '@cp/domain';
import { Button, Panel, Pill, SectionHeading } from '@/components/common';
import { ApprovalBar, PlannerOutputCard, TaskTimeline } from '@/components/panels';
import { WorkspaceBrowserPicker } from '@/components/project-onboarding/WorkspaceBrowserPicker';
import { describeHeartbeatPolicy, launchModeLabels, runtimeHostLabels } from '@/components/runtime-profile/runtime-profile-utils';
import { usePathParam } from './_utils';
import { useAppStore } from '@/store/app-store';

const resolveJobStage = (job: Job): 'waiting_user' | 'running' | 'done' | 'error' | 'ready' | 'waiting_dependencies' => {
  if (job.status === 'waiting_user') return 'waiting_user';
  if (job.status === 'running') return 'running';
  if (job.status === 'done') return 'done';
  if (job.status === 'error') return 'error';
  if (job.status === 'idle' && job.ready) return 'ready';
  return 'waiting_dependencies';
};

type WorkspaceItem = {
  id: string;
  projectId: string;
  mode: 'local' | 'remote';
  localPath?: string;
  runtimeStatus: string;
  runtimeDetails?: Record<string, unknown>;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastDeployedAt?: string;
};

type WorkspacePathValidation = {
  checkedAt?: string;
  status?: 'valid' | 'invalid' | 'not_required';
  valid?: boolean;
  path?: string;
  reason?: string;
  message?: string;
  readable?: boolean;
  writable?: boolean;
  executable?: boolean;
};

type WorkspaceAction = 'start' | 'stop' | 'deploy' | 'restart';

type ProjectHeartbeatStatus = {
  projectId: string;
  projectName: string;
  runtimeProfile: ProjectRuntimeProfile;
  lastTriggeredAt?: string;
  lastTrigger?: string;
  lastTriggeredBy?: string;
  lastReason?: string;
  lastJobIds: string[];
  overallStatus: 'idle' | 'queued' | 'running' | 'done' | 'error' | 'disabled';
  due: boolean;
  completedCount: number;
  failedCount: number;
  runningCount: number;
  queuedCount: number;
};

const resolveWorkspaceExecutionMode = (workspaceMode: WorkspaceItem['mode']): 'local' | 'remote' =>
  workspaceMode === 'local' ? 'local' : 'remote';

const resolveWorkspaceStatusTone = (
  status: WorkspaceItem['runtimeStatus'] | 'not_configured'
): 'default' | 'good' | 'warn' | 'bad' | 'accent' => {
  if (status === 'running') return 'good';
  if (status === 'starting' || status === 'deploying') return 'accent';
  if (status === 'error') return 'bad';
  if (status === 'unknown') return 'warn';
  return 'default';
};

const heartbeatTone = (status: ProjectHeartbeatStatus['overallStatus']): 'default' | 'good' | 'warn' | 'bad' | 'accent' => {
  if (status === 'done') return 'good';
  if (status === 'running' || status === 'queued') return 'accent';
  if (status === 'error') return 'bad';
  if (status === 'disabled') return 'warn';
  return 'default';
};

const extractWorkspacePathValidation = (workspace: WorkspaceItem | undefined): WorkspacePathValidation | undefined => {
  const runtimeDetails = workspace?.runtimeDetails;
  if (!runtimeDetails || typeof runtimeDetails !== 'object') return undefined;
  const candidate = runtimeDetails.pathValidation;
  if (!candidate || typeof candidate !== 'object') return undefined;
  return candidate as WorkspacePathValidation;
};

const extractJobErrorMessage = (item: { payload?: Record<string, unknown> } | undefined, fallback: string): string => {
  const payload = item?.payload;
  const lastError =
    payload && typeof payload.lastError === 'object' && payload.lastError !== null
      ? (payload.lastError as Record<string, unknown>)
      : undefined;
  return typeof lastError?.message === 'string' ? lastError.message : fallback;
};

const resolveJobWaitDelay = (attempt: number): number => Math.min(500 * 2 ** attempt, 2500);

export function ProjectDetailPage() {
  const { state, dispatch, auth, authActions } = useAppStore();
  const projectId = usePathParam(1);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];
  const scopedProjectId = project?.id;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | undefined>();
  const [workspace, setWorkspace] = useState<WorkspaceItem | undefined>();
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceRunningAction, setWorkspaceRunningAction] = useState<WorkspaceAction | undefined>();
  const [workspaceError, setWorkspaceError] = useState<string | undefined>();
  const [workspaceNotice, setWorkspaceNotice] = useState<string | undefined>();
  const [workspaceModeDraft, setWorkspaceModeDraft] = useState<'local' | 'remote'>('local');
  const [workspacePathDraft, setWorkspacePathDraft] = useState('');
  const [projectRuntime, setProjectRuntime] = useState<ProjectRuntimeProfile | undefined>();
  const [heartbeatStatus, setHeartbeatStatus] = useState<ProjectHeartbeatStatus | undefined>();
  const [heartbeatRunning, setHeartbeatRunning] = useState<'manual' | 'tick' | undefined>();
  const [projectRuntimeError, setProjectRuntimeError] = useState<string | undefined>();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const orderedJobs = useMemo(
    () =>
      [...jobs].sort((left, right) => {
        if (left.actionRequired !== right.actionRequired) {
          return Number(right.actionRequired) - Number(left.actionRequired);
        }
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        return left.createdAt.localeCompare(right.createdAt);
      }),
    [jobs]
  );

  const loadJobs = useCallback(async (): Promise<void> => {
    if (!scopedProjectId) {
      if (!isMountedRef.current) return;
      setJobs([]);
      return;
    }
    if (!isMountedRef.current) return;
    setJobsLoading(true);
    setJobsError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ items?: Job[]; message?: string }>(
        `/projects/${scopedProjectId}/jobs`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load project jobs (HTTP ${response.status})`);
      }
      if (!isMountedRef.current) return;
      setJobs(body.items ?? []);
    } catch (error) {
      if (!isMountedRef.current) return;
      setJobsError(error instanceof Error ? error.message : 'Unable to load project jobs');
    } finally {
      if (!isMountedRef.current) return;
      setJobsLoading(false);
    }
  }, [authActions, scopedProjectId]);

  const loadWorkspace = useCallback(async (): Promise<void> => {
    if (!scopedProjectId) {
      if (!isMountedRef.current) return;
      setWorkspace(undefined);
      return;
    }
    if (!isMountedRef.current) return;
    setWorkspaceLoading(true);
    setWorkspaceError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ items?: WorkspaceItem[]; message?: string }>(
        `/workspaces?projectId=${encodeURIComponent(scopedProjectId)}`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load workspace (HTTP ${response.status})`);
      }
      const item = body.items?.[0];
      if (!isMountedRef.current) return;
      setWorkspace(item);
      setWorkspaceModeDraft(item?.mode ?? 'local');
      setWorkspacePathDraft(item?.localPath ?? '');
    } catch (error) {
      if (!isMountedRef.current) return;
      setWorkspaceError(error instanceof Error ? error.message : 'Unable to load workspace');
    } finally {
      if (!isMountedRef.current) return;
      setWorkspaceLoading(false);
    }
  }, [authActions, scopedProjectId]);

  const loadProjectRuntime = useCallback(async (): Promise<void> => {
    if (!scopedProjectId) {
      if (!isMountedRef.current) return;
      setProjectRuntime(undefined);
      setHeartbeatStatus(undefined);
      return;
    }
    if (!isMountedRef.current) return;
    setProjectRuntimeError(undefined);
    try {
      const [runtimeResponse, heartbeatResponse] = await Promise.all([
        authActions.apiFetchJson<{ item?: { runtimeProfile?: ProjectRuntimeProfile }; message?: string }>(
          `/projects/${scopedProjectId}/runtime`
        ),
        authActions.apiFetchJson<{ item?: ProjectHeartbeatStatus; message?: string }>(
          `/projects/${scopedProjectId}/runtime/heartbeat/status`
        )
      ]);

      if (!runtimeResponse.response.ok || !runtimeResponse.body.item) {
        throw new Error(runtimeResponse.body.message ?? `Unable to load project runtime (HTTP ${runtimeResponse.response.status})`);
      }
      if (!heartbeatResponse.response.ok || !heartbeatResponse.body.item) {
        throw new Error(heartbeatResponse.body.message ?? `Unable to load project heartbeat status (HTTP ${heartbeatResponse.response.status})`);
      }

      if (!isMountedRef.current) return;
      setProjectRuntime(runtimeResponse.body.item.runtimeProfile ? runtimeResponse.body.item.runtimeProfile : undefined);
      setHeartbeatStatus(heartbeatResponse.body.item);
    } catch (error) {
      if (!isMountedRef.current) return;
      setProjectRuntimeError(error instanceof Error ? error.message : 'Unable to load project runtime');
    }
  }, [authActions, scopedProjectId]);

  const waitForJobCompletion = useCallback(
    async (jobId: string, label: string): Promise<void> => {
      const startedAt = Date.now();
      let attempt = 0;
      while (Date.now() - startedAt < 45_000) {
        const { response, body } = await authActions.apiFetchJson<{
          item?: {
            id: string;
            status: string;
            payload?: Record<string, unknown>;
          };
          message?: string;
        }>(`/jobs/${jobId}`);
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to load job ${jobId} (HTTP ${response.status})`);
        }
        const item = body.item;
        if (!item) throw new Error(`Job not found: ${jobId}`);
        if (item.status === 'done' || item.status === 'waiting_user') return;
        if (item.status === 'error') {
          throw new Error(extractJobErrorMessage(item, `${label} failed (${jobId})`));
        }
        await new Promise((resolve) => setTimeout(resolve, resolveJobWaitDelay(attempt)));
        attempt += 1;
      }
      throw new Error(`Timed out while waiting for ${label} (${jobId})`);
    },
    [authActions]
  );

  const upsertWorkspaceConfig = useCallback(async (): Promise<WorkspaceItem> => {
    if (!scopedProjectId) {
      throw new Error('No project selected');
    }

    const localPath = workspacePathDraft.trim();
    const payload = {
      mode: workspaceModeDraft,
      ...(localPath.length > 0 ? { localPath } : {})
    };

    if (!workspace) {
      const { response, body } = await authActions.apiFetchJson<{ item?: WorkspaceItem; message?: string }>(
        '/workspaces',
        {
          method: 'POST',
          body: JSON.stringify({
            projectId: scopedProjectId,
            ...payload
          })
        }
      );
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to create workspace (HTTP ${response.status})`);
      }
      return body.item;
    }

    const { response, body } = await authActions.apiFetchJson<{ item?: WorkspaceItem; message?: string }>(
      `/workspaces/${workspace.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok || !body.item) {
      throw new Error(body.message ?? `Unable to update workspace (HTTP ${response.status})`);
    }
    return body.item;
  }, [authActions, scopedProjectId, workspace, workspaceModeDraft, workspacePathDraft]);

  const saveWorkspaceConfig = useCallback(async (): Promise<void> => {
    if (!scopedProjectId) return;
    setWorkspaceSaving(true);
    setWorkspaceError(undefined);
    setWorkspaceNotice(undefined);
    try {
      const item = await upsertWorkspaceConfig();
      if (!isMountedRef.current) return;
      setWorkspace(item);
      setWorkspaceModeDraft(item.mode);
      setWorkspacePathDraft(item.localPath ?? '');
      const runtimeResponse = await authActions.apiFetchJson<{ item?: { runtimeProfile?: ProjectRuntimeProfile }; message?: string }>(
        `/projects/${scopedProjectId}/runtime`,
        {
          method: 'PUT',
          body: JSON.stringify({ workspaceId: item.id })
        }
      );
      if (!runtimeResponse.response.ok || !runtimeResponse.body.item) {
        throw new Error(runtimeResponse.body.message ?? `Unable to update project runtime workspace (HTTP ${runtimeResponse.response.status})`);
      }
      setProjectRuntime(runtimeResponse.body.item.runtimeProfile ?? undefined);
      setWorkspaceNotice('Workspace configuration saved.');
    } catch (error) {
      if (!isMountedRef.current) return;
      setWorkspaceError(error instanceof Error ? error.message : 'Unable to save workspace');
    } finally {
      if (!isMountedRef.current) return;
      setWorkspaceSaving(false);
    }
  }, [scopedProjectId, upsertWorkspaceConfig]);

  const runWorkspaceRuntimeAction = useCallback(
    async (action: WorkspaceAction): Promise<void> => {
      if (!scopedProjectId) return;
      setWorkspaceRunningAction(action);
      setWorkspaceError(undefined);
      setWorkspaceNotice(undefined);
      try {
        const currentWorkspace = workspace ?? (await upsertWorkspaceConfig());
        const { response, body } = await authActions.apiFetchJson<{
          item?: WorkspaceItem;
          jobId?: string;
          status?: string;
          message?: string;
        }>(`/workspaces/${currentWorkspace.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            action,
            executionMode: resolveWorkspaceExecutionMode(currentWorkspace.mode)
          })
        });
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to ${action} workspace (HTTP ${response.status})`);
        }
        if (body.jobId) {
          await waitForJobCompletion(body.jobId, `workspace ${action}`);
          if (!isMountedRef.current) return;
          setWorkspaceNotice(`Workspace ${action} completed (job ${body.jobId}).`);
        } else {
          if (!isMountedRef.current) return;
          setWorkspaceNotice(`Workspace ${action} dispatched.`);
        }
        await Promise.all([loadWorkspace(), loadJobs()]);
      } catch (error) {
        if (!isMountedRef.current) return;
        setWorkspaceError(error instanceof Error ? error.message : `Unable to ${action} workspace`);
      } finally {
        if (!isMountedRef.current) return;
        setWorkspaceRunningAction(undefined);
      }
    },
    [authActions, loadJobs, loadWorkspace, scopedProjectId, upsertWorkspaceConfig, waitForJobCompletion, workspace]
  );

  const runProjectHeartbeat = useCallback(
    async (mode: 'manual' | 'tick'): Promise<void> => {
      if (!scopedProjectId) return;
      setHeartbeatRunning(mode);
      setProjectRuntimeError(undefined);
      try {
        const endpoint =
          mode === 'manual'
            ? `/projects/${scopedProjectId}/runtime/heartbeat`
            : `/projects/${scopedProjectId}/runtime/heartbeat/tick`;
        const { response, body } = await authActions.apiFetchJson<{
          item?: { jobs?: Array<{ jobId: string }>; targets?: Array<{ agentName: string }> };
          message?: string;
        }>(endpoint, {
          method: 'POST',
          body: JSON.stringify(mode === 'manual' ? { trigger: 'manual', reason: 'project_detail_ui' } : { reason: 'project_detail_ui' })
        });
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to ${mode} project heartbeat (HTTP ${response.status})`);
        }
        setWorkspaceNotice(
          mode === 'manual'
            ? `Heartbeat dispatched to ${body.item.targets?.length ?? 0} agent(s).`
            : `Scheduler tick completed with ${body.item.jobs?.length ?? 0} job(s).`
        );
        await loadProjectRuntime();
      } catch (error) {
        setProjectRuntimeError(error instanceof Error ? error.message : `Unable to ${mode} project heartbeat`);
      } finally {
        setHeartbeatRunning(undefined);
      }
    },
    [authActions, loadProjectRuntime, scopedProjectId]
  );

  useEffect(() => {
    if (auth.enabled && auth.required) return;
    if (!scopedProjectId) return;
    void loadJobs();
    void loadWorkspace();
    void loadProjectRuntime();
  }, [auth.enabled, auth.required, loadJobs, loadProjectRuntime, loadWorkspace, scopedProjectId]);

  if (!project) return <Panel>No project found.</Panel>;

  const tasks = state.tasks.filter((item) => item.projectId === project.id);
  const roadmap = state.roadmapItems.filter((item) => item.projectId === project.id);
  const approvals = state.approvals.filter((item) => roadmap.some((r) => r.id === item.subjectId));
  const firstTask = tasks[0];
  const firstTaskRun = firstTask ? state.taskRuns.find((run) => run.taskId === firstTask.id) : undefined;
  const workspaceStatus = (workspace?.runtimeStatus as WorkspaceItem['runtimeStatus'] | undefined) ?? 'not_configured';
  const pathValidation = extractWorkspacePathValidation(workspace);
  const pathValidationTone: 'default' | 'good' | 'warn' | 'bad' | 'accent' =
    pathValidation?.status === 'valid'
      ? 'good'
      : pathValidation?.status === 'not_required'
        ? 'default'
        : pathValidation?.status === 'invalid'
          ? 'bad'
          : 'warn';
  const pathValidationLabel =
    pathValidation?.status === 'valid'
      ? 'valid'
      : pathValidation?.status === 'not_required'
        ? 'not required'
        : pathValidation?.status === 'invalid'
          ? 'invalid'
          : 'unknown';

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading title={project.name} subtitle={project.key} />
        <p className="text-sm text-[color:var(--muted)]">{project.description}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
          <span className="pill">Status {project.status}</span>
          <span className="pill">Roadmap {roadmap.length}</span>
          <span className="pill">Tasks {tasks.length}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <Link to="/project/$projectId/repositories" params={{ projectId: project.id }} className="btn btn-ghost">Repositories</Link>
          <Link to="/project/$projectId/roadmap" params={{ projectId: project.id }} className="btn btn-ghost">Roadmap</Link>
          <Link to="/project/$projectId/onboarding" params={{ projectId: project.id }} className="btn btn-ghost">
            Onboarding
          </Link>
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Project Runtime"
          subtitle="Primary agent, default host and heartbeat policy"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void loadProjectRuntime()}>
                Refresh runtime
              </Button>
              <Button variant="secondary" onClick={() => void runProjectHeartbeat('manual')} disabled={Boolean(heartbeatRunning)}>
                {heartbeatRunning === 'manual' ? 'Triggering...' : 'Run heartbeat'}
              </Button>
              <Button variant="secondary" onClick={() => void runProjectHeartbeat('tick')} disabled={Boolean(heartbeatRunning)}>
                {heartbeatRunning === 'tick' ? 'Ticking...' : 'Scheduler tick'}
              </Button>
            </div>
          }
        />
        {projectRuntimeError ? <p className="text-sm text-[color:var(--bad)]">{projectRuntimeError}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill tone="default">host {runtimeHostLabels[projectRuntime?.defaultHost ?? 'local_worker']}</Pill>
          <Pill tone="default">mode {launchModeLabels[projectRuntime?.defaultExecutionMode ?? 'queued']}</Pill>
          <Pill tone={heartbeatTone(heartbeatStatus?.overallStatus ?? 'idle')}>status {heartbeatStatus?.overallStatus ?? 'idle'}</Pill>
          <Pill tone={heartbeatStatus?.due ? 'warn' : 'default'}>{heartbeatStatus?.due ? 'due' : 'not due'}</Pill>
          {projectRuntime?.primaryAgentId ? <Pill tone="good">primary agent {projectRuntime.primaryAgentId}</Pill> : <Pill tone="warn">primary agent not set</Pill>}
        </div>
        <p className="mt-3 text-sm text-slate-300">
          {describeHeartbeatPolicy(projectRuntime?.heartbeatPolicy ?? undefined)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
          <Pill tone="default">jobs {heartbeatStatus?.lastJobIds.length ?? 0}</Pill>
          <Pill tone="default">completed {heartbeatStatus?.completedCount ?? 0}</Pill>
          <Pill tone="default">running {heartbeatStatus?.runningCount ?? 0}</Pill>
          <Pill tone="default">failed {heartbeatStatus?.failedCount ?? 0}</Pill>
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          title="Workspace Runtime"
          subtitle="Project execution workspace (server-side folder browser)"
          action={
            <Button variant="secondary" onClick={() => void loadWorkspace()}>
              {workspaceLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          }
        />
        {workspaceError ? <p className="text-sm text-[color:var(--bad)]">{workspaceError}</p> : null}
        {workspaceNotice ? <p className="text-sm text-emerald-300">{workspaceNotice}</p> : null}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <div className="label">Mode</div>
            <select
              className="cp-input mt-1"
              value={workspaceModeDraft}
              onChange={(event) => setWorkspaceModeDraft(event.target.value as 'local' | 'remote')}
              disabled={workspaceSaving || Boolean(workspaceRunningAction)}
            >
              <option value="local">local</option>
              <option value="remote">remote</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <WorkspaceBrowserPicker
            value={workspacePathDraft || undefined}
            onChange={(path) => setWorkspacePathDraft(path ?? '')}
            title="Browse workspace folders"
            subtitle="Select a folder from allowed roots"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void saveWorkspaceConfig()} disabled={Boolean(workspaceRunningAction)}>
            {workspaceSaving ? 'Saving...' : workspace ? 'Save workspace' : 'Create workspace'}
          </Button>
          <Button variant="primary" onClick={() => void runWorkspaceRuntimeAction('start')} disabled={workspaceSaving}>
            {workspaceRunningAction === 'start' ? 'Starting...' : 'Start'}
          </Button>
          <Button variant="secondary" onClick={() => void runWorkspaceRuntimeAction('stop')} disabled={workspaceSaving}>
            {workspaceRunningAction === 'stop' ? 'Stopping...' : 'Stop'}
          </Button>
          <Button variant="secondary" onClick={() => void runWorkspaceRuntimeAction('deploy')} disabled={workspaceSaving}>
            {workspaceRunningAction === 'deploy' ? 'Deploying...' : 'Deploy'}
          </Button>
          <Button variant="secondary" onClick={() => void runWorkspaceRuntimeAction('restart')} disabled={workspaceSaving}>
            {workspaceRunningAction === 'restart' ? 'Restarting...' : 'Restart'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted)]">
          <Pill tone={resolveWorkspaceStatusTone(workspaceStatus)}>status {workspace?.runtimeStatus ?? 'not configured'}</Pill>
          <Pill tone="default">mode {workspace?.mode ?? workspaceModeDraft}</Pill>
          <Pill tone="default">path {(workspace?.localPath ?? workspacePathDraft) || 'n/a'}</Pill>
          <Pill tone={pathValidationTone}>path validation {pathValidationLabel}</Pill>
          {workspace?.lastStartedAt ? <Pill tone="good">started {workspace.lastStartedAt}</Pill> : null}
          {workspace?.lastStoppedAt ? <Pill tone="warn">stopped {workspace.lastStoppedAt}</Pill> : null}
          {workspace?.lastDeployedAt ? <Pill tone="accent">deployed {workspace.lastDeployedAt}</Pill> : null}
        </div>
        {pathValidation?.message ? (
          <p className={`mt-2 text-xs ${pathValidation.status === 'invalid' ? 'text-[color:var(--bad)]' : 'text-[color:var(--muted)]'}`}>
            {pathValidation.message}
            {pathValidation.path ? ` (${pathValidation.path})` : ''}
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <PlannerOutputCard
          title="Execution basis"
          summary="Approved roadmap items become task specs. Tasks require deterministic verification before completion."
        />
        <ApprovalBar
          approvals={approvals}
          onApprove={(roadmapItemId) => dispatch({ type: 'approveRoadmap', roadmapItemId })}
          onReject={(roadmapItemId) => dispatch({ type: 'rejectRoadmap', roadmapItemId })}
        />
      </div>

      <Panel>
        <SectionHeading
          title="Project Jobs"
          subtitle="Execution units scoped to this project"
          action={
            <button
              type="button"
              className="pill border border-cyan-400/30 bg-cyan-500/20 text-cyan-100"
              onClick={() => void loadJobs()}
            >
              Refresh
            </button>
          }
        />
        {jobsLoading ? <p className="text-sm text-slate-400">Loading project jobs...</p> : null}
        {!jobsLoading && jobsError ? <p className="text-sm text-[color:var(--bad)]">{jobsError}</p> : null}
        {!jobsLoading && !jobsError && orderedJobs.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">No jobs linked to this project yet.</p>
        ) : null}
        {!jobsLoading && !jobsError ? (
          <div className="space-y-2">
            {orderedJobs.map((job) => (
              <div
                key={job.id}
                className={`border px-3 py-2 text-sm ${
                  job.actionRequired
                    ? 'border-amber-400/50 bg-amber-500/10'
                    : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--text)]">{job.title}</div>
                    <div className="truncate text-xs text-[color:var(--muted)]">{job.id}</div>
                  </div>
                  <span className="pill">{resolveJobStage(job)}</span>
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
                  type {job.type} · priority {job.priority} · retries {job.retryCount}/{job.maxRetries} · deps{' '}
                  {job.dependsOnCount}
                </div>
                {job.resourceType === 'brainstorm' && job.resourceId ? (
                  <div className="mt-2">
                    <Link
                      to="/project/$projectId/brainstorm/$id"
                      params={{ projectId: project.id, id: job.resourceId }}
                      className="text-xs uppercase tracking-[0.08em] text-[color:var(--accent)]"
                    >
                      Open linked brainstorm plan
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>

      {firstTask ? <TaskTimeline task={firstTask} run={firstTaskRun} /> : null}
    </div>
  );
}
