import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentConfig, Job, Machine } from "@cp/domain";
import { Button, Panel, Pill, SectionHeading, StatCard } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type ProviderHealth = {
  status: "healthy" | "degraded" | "down";
};

type ModelsResponse = {
  source?: "live" | "mock";
};

type UsageItem = {
  cost: number;
  createdAt: string;
};

const startOfToday = (): number => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

const startOfWeek = (): number => Date.now() - 7 * 24 * 60 * 60 * 1000;

const sumCost = (items: UsageItem[], threshold: number): number =>
  items
    .filter((item) => Date.parse(item.createdAt) >= threshold)
    .reduce((acc, item) => acc + item.cost, 0);

const DASHBOARD_POLL_MS = 12000;

export function DashboardPage() {
  const { authActions } = useAppStore();
  const navigate = useNavigate();
  const mountedRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth[]>([]);
  const [modelSource, setModelSource] = useState<"live" | "mock">("mock");
  const [usage, setUsage] = useState<UsageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async (input?: { silent?: boolean }) => {
    const silent = input?.silent ?? false;
    if (!mountedRef.current) return;
    if (!silent) {
      setLoading(true);
      setError(undefined);
    }
    try {
      const [jobsData, agentsData, healthData, modelsData, usageData, machinesData] = await Promise.all([
        authActions.apiFetchJson<{ items?: Job[]; message?: string }>("/jobs"),
        authActions.apiFetchJson<{ items?: AgentConfig[]; message?: string }>("/agents"),
        authActions.apiFetchJson<{ items?: ProviderHealth[]; message?: string }>("/providers/health"),
        authActions.apiFetchJson<ModelsResponse>("/models"),
        authActions.apiFetchJson<{ items?: UsageItem[]; message?: string }>("/usage"),
        authActions.apiFetchJson<{ items?: Machine[]; message?: string }>("/machines")
      ]);

      if (!jobsData.response.ok) throw new Error(jobsData.body.message ?? "Unable to load jobs");
      if (!agentsData.response.ok) throw new Error(agentsData.body.message ?? "Unable to load agents");
      if (!healthData.response.ok) throw new Error(healthData.body.message ?? "Unable to load provider health");
      if (!modelsData.response.ok) throw new Error("Unable to load model source");
      if (!usageData.response.ok) throw new Error(usageData.body.message ?? "Unable to load usage");
      if (!machinesData.response.ok) throw new Error(machinesData.body.message ?? "Unable to load machines");

      if (!mountedRef.current) return;
      setJobs(jobsData.body.items ?? []);
      setAgents(agentsData.body.items ?? []);
      setProviderHealth(healthData.body.items ?? []);
      setModelSource(modelsData.body.source === "live" ? "live" : "mock");
      setUsage(usageData.body.items ?? []);
      setMachines(machinesData.body.items ?? []);
      setError(undefined);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard");
    } finally {
      if (!mountedRef.current) return;
      if (!silent) {
        setLoading(false);
      }
    }
  }, [authActions]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    let cancelled = false;
    let timer: number | undefined;

    const schedule = (delay = DASHBOARD_POLL_MS): void => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void tick();
      }, delay);
    };

    const tick = async (): Promise<void> => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        schedule(30000);
        return;
      }
      if (pollInFlightRef.current) {
        schedule();
        return;
      }
      pollInFlightRef.current = true;
      try {
        await load({ silent: true });
      } finally {
        pollInFlightRef.current = false;
      }
      schedule();
    };

    const onVisibilityChange = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void load({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [load]);

  const stats = useMemo(() => {
    const running = jobs.filter((job) => job.status === "running").length;
    const actionRequired = jobs.filter((job) => job.actionRequired).length;
    const errors = jobs.filter((job) => job.status === "error").length;
    const activeAgents = agents.filter((agent) => agent.status === "active").length;
    const healthyProviders = providerHealth.filter((item) => item.status === "healthy").length;
    const machinesOnline = machines.filter((item) => item.status === "online").length;
    const todayCost = sumCost(usage, startOfToday());
    const weekCost = sumCost(usage, startOfWeek());
    return {
      running,
      actionRequired,
      errors,
      activeAgents,
      healthyProviders,
      machinesOnline,
      todayCost,
      weekCost
    };
  }, [agents, jobs, machines, providerHealth, usage]);

  const topAttentionJobs = useMemo(
    () =>
      [...jobs]
        .sort((left, right) => {
          if (left.actionRequired !== right.actionRequired) {
            return Number(right.actionRequired) - Number(left.actionRequired);
          }
          return right.updatedAt.localeCompare(left.updatedAt);
        })
        .slice(0, 10),
    [jobs]
  );

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Control Center"
          subtitle="Project-first overview: queue pressure, runtime health, agents, providers, usage and workers"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void load()}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Button variant="primary" onClick={() => void navigate({ to: "/projects/new" } as any)}>
                New Project
              </Button>
            </div>
          }
        />
        {loading ? <p className="text-xs text-[color:var(--muted)]">Loading dashboard...</p> : null}
        {error ? <p className="text-sm text-[color:var(--bad)]">{error}</p> : null}
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Running jobs" value={stats.running} hint="live queue" />
        <StatCard label="Action required" value={stats.actionRequired} hint="human input pending" />
        <StatCard label="Recent errors" value={stats.errors} hint="status=error" />
        <StatCard label="Active agents" value={stats.activeAgents} hint="agent fleet" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Providers healthy" value={stats.healthyProviders} hint={`models source=${modelSource}`} />
        <StatCard label="Machines online" value={stats.machinesOnline} hint="machine status=healthy" />
        <StatCard label="Cost today" value={`$${stats.todayCost.toFixed(4)}`} hint="usage events" />
        <StatCard label="Cost 7d" value={`$${stats.weekCost.toFixed(4)}`} hint="usage events rolling window" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <SectionHeading title="Attention Queue" subtitle="Jobs needing action or currently running" />
          <div className="space-y-2">
            {topAttentionJobs.map((job) => (
              <div key={job.id} className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{job.title}</div>
                    <div className="truncate text-xs text-[color:var(--muted)]">
                      {job.projectId ?? "no-project"} · {job.type}
                    </div>
                  </div>
                  <Pill tone={job.status === "error" ? "bad" : job.status === "running" ? "accent" : job.actionRequired ? "warn" : "default"}>
                    {job.status}
                  </Pill>
                </div>
              </div>
            ))}
            {topAttentionJobs.length === 0 ? <div className="platform-empty-row">No active jobs.</div> : null}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="Platform Signals" subtitle="Provider mode, workers and admin controls" />
          <div className="space-y-2 text-sm text-[color:var(--muted)]">
            <div className="flex items-center justify-between border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
              <span>Provider mode</span>
              <Pill tone={modelSource === "live" ? "good" : "warn"}>{modelSource}</Pill>
            </div>
            <div className="flex items-center justify-between border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
              <span>Workers healthy</span>
              <strong className="text-[color:var(--text)]">{stats.machinesOnline}</strong>
            </div>
            <div className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3 text-xs">
              Platform controls are available from the top bar `Platform` menu.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
