import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job } from '@cp/domain';
import { Panel, SectionHeading } from '@/components/common';
import { ApprovalBar, PlannerOutputCard, TaskTimeline } from '@/components/panels';
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

export function ProjectDetailPage() {
  const { state, dispatch, auth, authActions } = useAppStore();
  const projectId = usePathParam(1);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];
  const scopedProjectId = project?.id;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | undefined>();
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
      setJobs([]);
      return;
    }
    setJobsLoading(true);
    setJobsError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{ items?: Job[]; message?: string }>(
        `/projects/${scopedProjectId}/jobs`
      );
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load project jobs (HTTP ${response.status})`);
      }
      setJobs(body.items ?? []);
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : 'Unable to load project jobs');
    } finally {
      setJobsLoading(false);
    }
  }, [authActions, scopedProjectId]);

  useEffect(() => {
    if (auth.enabled && auth.required) return;
    if (!scopedProjectId) return;
    void loadJobs();
  }, [auth.enabled, auth.required, loadJobs, scopedProjectId]);

  if (!project) return <Panel>No project found.</Panel>;

  const tasks = state.tasks.filter((item) => item.projectId === project.id);
  const roadmap = state.roadmapItems.filter((item) => item.projectId === project.id);
  const approvals = state.approvals.filter((item) => roadmap.some((r) => r.id === item.subjectId));
  const firstTask = tasks[0];
  const firstTaskRun = firstTask ? state.taskRuns.find((run) => run.taskId === firstTask.id) : undefined;

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
        </div>
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
