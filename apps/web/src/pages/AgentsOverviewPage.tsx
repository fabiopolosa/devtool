import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentConfig, Job } from "@cp/domain";
import { Button, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type UsageSummary = {
  totalCost?: number;
  byModel?: Array<{ key: string; totalCost: number }>;
};

type AuditItem = {
  action: string;
  resourceType: string;
  resourceId?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

const findAgentIdInPayload = (job: Job): string | undefined => {
  const payload = toRecord(job.payload);
  if (!payload) return undefined;
  const direct = payload["agentId"];
  if (typeof direct === "string" && direct.length > 0) return direct;
  const assigned = payload["assignedAgentId"];
  if (typeof assigned === "string" && assigned.length > 0) return assigned;
  return undefined;
};

export function AgentsOverviewPage() {
  const { authActions } = useAppStore();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [agentsData, jobsData, usageData, auditData] = await Promise.all([
        authActions.apiFetchJson<{ items?: AgentConfig[]; message?: string }>("/agents"),
        authActions.apiFetchJson<{ items?: Job[]; message?: string }>("/jobs"),
        authActions.apiFetchJson<{ summary?: UsageSummary; message?: string }>("/usage"),
        authActions.apiFetchJson<{ items?: AuditItem[]; message?: string }>("/audit")
      ]);

      if (!agentsData.response.ok) throw new Error(agentsData.body.message ?? "Unable to load agents");
      if (!jobsData.response.ok) throw new Error(jobsData.body.message ?? "Unable to load jobs");
      if (!usageData.response.ok) throw new Error(usageData.body.message ?? "Unable to load usage");
      if (!auditData.response.ok) throw new Error(auditData.body.message ?? "Unable to load audit");

      setAgents(agentsData.body.items ?? []);
      setJobs(jobsData.body.items ?? []);
      setUsageSummary(usageData.body.summary);
      setAudit(auditData.body.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load agents overview");
    } finally {
      setLoading(false);
    }
  }, [authActions]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const runningByAgent = useMemo(() => {
    const map = new Map<string, Job>();
    for (const job of jobs) {
      if (job.status !== "running") continue;
      const agentId = findAgentIdInPayload(job);
      if (agentId && !map.has(agentId)) {
        map.set(agentId, job);
      }
    }
    return map;
  }, [jobs]);

  const latestEventByAgent = useMemo(() => {
    const map = new Map<string, AuditItem>();
    for (const event of audit) {
      const metadata = toRecord(event.metadata);
      const agentId = typeof metadata?.["agentId"] === "string" ? (metadata["agentId"] as string) : undefined;
      if (!agentId) continue;
      if (!map.has(agentId)) {
        map.set(agentId, event);
      }
    }
    return map;
  }, [audit]);

  const totalCost = usageSummary?.totalCost ?? 0;

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Agents"
          subtitle="Role, status, active job and latest runtime signal"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void load()}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Link to="/settings/agents" className="btn btn-ghost">
                Configure
              </Link>
            </div>
          }
        />
        {error ? <p className="text-sm text-[color:var(--bad)]">{error}</p> : null}
      </Panel>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel>
          <div className="label">active agents</div>
          <div className="mt-2 text-2xl font-semibold">{agents.filter((agent) => agent.status === "active").length}</div>
        </Panel>
        <Panel>
          <div className="label">running jobs</div>
          <div className="mt-2 text-2xl font-semibold">{jobs.filter((job) => job.status === "running").length}</div>
        </Panel>
        <Panel>
          <div className="label">cost (today window)</div>
          <div className="mt-2 text-2xl font-semibold">${totalCost.toFixed(4)}</div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {agents.map((agent) => {
          const runningJob = runningByAgent.get(agent.id);
          const event = latestEventByAgent.get(agent.id);
          return (
            <Panel key={agent.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="label">{agent.role}</div>
                  <div className="mt-1 text-base font-semibold">
                    {agent.icon} {agent.name}
                  </div>
                </div>
                <Pill tone={agent.status === "active" ? "good" : agent.status === "degraded" ? "warn" : "bad"}>
                  {agent.status}
                </Pill>
              </div>
              <div className="mt-3 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
                current job: {runningJob?.title ?? "none"}
              </div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                {runningJob ? `${runningJob.id} · priority ${runningJob.priority}` : "idle"}
              </div>
              <div className="mt-3 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
                latest event: {event?.action ?? "n/a"}
              </div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                {event ? `${new Date(event.occurredAt).toLocaleString()}` : "no telemetry yet"}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
