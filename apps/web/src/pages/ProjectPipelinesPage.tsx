import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job } from "@cp/domain";
import { Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";
import { usePathParam } from "./_utils";

const pipelineTypes = new Set<Job["type"]>([
  "ingestion",
  "processing",
  "generation",
  "review",
  "deployment"
]);

const resolveStage = (job: Job): "waiting_user" | "running" | "done" | "error" | "ready" | "waiting_dependencies" => {
  if (job.status === "waiting_user") return "waiting_user";
  if (job.status === "running") return "running";
  if (job.status === "done") return "done";
  if (job.status === "error") return "error";
  if (job.status === "idle" && job.ready) return "ready";
  return "waiting_dependencies";
};

const stageTone = (stage: ReturnType<typeof resolveStage>): "warn" | "good" | "bad" | "accent" | "default" => {
  if (stage === "running" || stage === "ready") return "accent";
  if (stage === "waiting_user") return "warn";
  if (stage === "done") return "good";
  if (stage === "error") return "bad";
  return "default";
};

export function ProjectPipelinesPage() {
  const { state, authActions } = useAppStore();
  const projectId = usePathParam(2);
  const project = state.projects.find((item) => item.id === projectId) ?? state.projects[0];
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

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
      setJobs(body.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load pipelines");
    } finally {
      setLoading(false);
    }
  }, [authActions, project?.id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Operational Pipelines"
          subtitle="Ingestion, generation, review and deployment jobs for this project"
        />
      </Panel>

      {loading ? <Panel><p className="text-sm text-[color:var(--muted)]">Loading pipelines...</p></Panel> : null}
      {error ? <Panel><p className="text-sm text-[color:var(--bad)]">{error}</p></Panel> : null}

      <div className="grid gap-3">
        {pipelineJobs.map((job) => {
          const stage = resolveStage(job);
          return (
            <Panel key={job.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{job.title}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {job.type} · priority {job.priority} · retries {job.retryCount}/{job.maxRetries}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    dependencies {job.dependsOnCount} · {job.ready ? "ready" : "waiting dependencies"}
                  </div>
                </div>
                <Pill tone={stageTone(stage)}>{stage}</Pill>
              </div>
            </Panel>
          );
        })}
        {!loading && !error && pipelineJobs.length === 0 ? (
          <Panel>
            <p className="text-sm text-[color:var(--muted)]">No operational pipelines in this project.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
