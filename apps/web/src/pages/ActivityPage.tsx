import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Job } from "@cp/domain";
import { Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type AuditItem = {
  id: string;
  action: string;
  status: "success" | "failure";
  projectId?: string;
  jobId?: string;
  occurredAt: string;
};

const resolveStage = (job: Job): "waiting_user" | "running" | "done" | "error" | "ready" | "waiting_dependencies" => {
  if (job.status === "waiting_user") return "waiting_user";
  if (job.status === "running") return "running";
  if (job.status === "done") return "done";
  if (job.status === "error") return "error";
  if (job.status === "idle" && job.ready) return "ready";
  return "waiting_dependencies";
};

const toneForStage = (
  stage: ReturnType<typeof resolveStage>
): "warn" | "good" | "bad" | "accent" | "default" => {
  if (stage === "running" || stage === "ready") return "accent";
  if (stage === "waiting_user") return "warn";
  if (stage === "done") return "good";
  if (stage === "error") return "bad";
  return "default";
};

export function ActivityPage() {
  const { authActions } = useAppStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [{ response: jobsResponse, body: jobsBody }, { response: auditResponse, body: auditBody }] =
        await Promise.all([
          authActions.apiFetchJson<{ items?: Job[]; message?: string }>("/jobs"),
          authActions.apiFetchJson<{ items?: AuditItem[]; message?: string }>("/audit")
        ]);

      if (!jobsResponse.ok) {
        throw new Error(jobsBody.message ?? `Unable to load jobs (HTTP ${jobsResponse.status})`);
      }
      if (!auditResponse.ok) {
        throw new Error(auditBody.message ?? `Unable to load audit (HTTP ${auditResponse.status})`);
      }

      setJobs(jobsBody.items ?? []);
      setAudit((auditBody.items ?? []).slice(0, 20));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load activity");
    } finally {
      setLoading(false);
    }
  }, [authActions]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const aggregates = useMemo(() => {
    const running = jobs.filter((job) => resolveStage(job) === "running").length;
    const attention = jobs.filter((job) => job.actionRequired).length;
    const errors = jobs.filter((job) => resolveStage(job) === "error").length;
    const completed = jobs.filter((job) => resolveStage(job) === "done").length;
    return { running, attention, errors, completed };
  }, [jobs]);

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((left, right) => {
        if (left.actionRequired !== right.actionRequired) {
          return Number(right.actionRequired) - Number(left.actionRequired);
        }
        if (left.status !== right.status) {
          return left.status.localeCompare(right.status);
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      }),
    [jobs]
  );

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Activity"
          subtitle="Cross-project runtime awareness: active work, errors, approvals and recent completions"
        />
        {error ? <p className="text-sm text-[color:var(--bad)]">{error}</p> : null}
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <div className="label">running jobs</div>
          <div className="mt-2 text-2xl font-semibold">{aggregates.running}</div>
        </Panel>
        <Panel>
          <div className="label">action required</div>
          <div className="mt-2 text-2xl font-semibold">{aggregates.attention}</div>
        </Panel>
        <Panel>
          <div className="label">errors</div>
          <div className="mt-2 text-2xl font-semibold">{aggregates.errors}</div>
        </Panel>
        <Panel>
          <div className="label">completed</div>
          <div className="mt-2 text-2xl font-semibold">{aggregates.completed}</div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionHeading title="Live Work Queue" subtitle={loading ? "Refreshing..." : "Latest scoped jobs"} />
          <div className="space-y-2">
            {sortedJobs.slice(0, 16).map((job) => {
              const stage = resolveStage(job);
              return (
                <div key={job.id} className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{job.title}</div>
                      <div className="truncate text-xs text-[color:var(--muted)]">
                        {job.projectId ?? "no-project"} · {job.type}
                      </div>
                    </div>
                    <Pill tone={toneForStage(stage)}>{stage}</Pill>
                  </div>
                  {job.projectId ? (
                    <div className="mt-2">
                      <Link
                        to="/project/$projectId"
                        params={{ projectId: job.projectId }}
                        className="text-xs uppercase tracking-[0.08em] text-[color:var(--accent)]"
                      >
                        Open project
                      </Link>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {sortedJobs.length === 0 ? <div className="platform-empty-row">No jobs found.</div> : null}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="Recent Events" subtitle="Audit feed across projects" />
          <div className="space-y-2">
            {audit.map((item) => (
              <div key={item.id} className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{item.action}</div>
                  <Pill tone={item.status === "success" ? "good" : "bad"}>{item.status}</Pill>
                </div>
                <div className="mt-1 text-xs text-[color:var(--muted)]">
                  {item.projectId ?? "global"} · {item.jobId ?? "no-job"} · {new Date(item.occurredAt).toLocaleString()}
                </div>
              </div>
            ))}
            {audit.length === 0 ? <div className="platform-empty-row">No audit events yet.</div> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
