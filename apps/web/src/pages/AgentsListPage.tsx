import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentConfig } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type AgentRuntimeJobReference = {
  jobId: string;
  operation: "heartbeat" | "diagnose";
  status: "queued";
  command: string;
  args: string[];
  createdAt: string;
};

type AgentRuntimeJobSnapshot = {
  jobId: string;
  state: string;
  logs: string[];
  progress: number;
  failedReason?: string;
};

export function AgentsListPage() {
  const { authActions } = useAppStore();
  const [items, setItems] = useState<AgentConfig[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [runningAgentId, setRunningAgentId] = useState<string | undefined>();
  const [jobRefs, setJobRefs] = useState<Record<string, AgentRuntimeJobReference>>({});
  const [jobSnapshots, setJobSnapshots] = useState<Record<string, AgentRuntimeJobSnapshot>>({});

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch("/agents");
      const body = (await response.json()) as { items?: AgentConfig[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load agents (HTTP ${response.status})`);
      }
      setItems(body.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load agents");
    } finally {
      setLoading(false);
    }
  }, [authActions]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const inspectJob = useCallback(
    async (agentId: string, jobId: string) => {
      const response = await authActions.apiFetch(`/agents/${agentId}/jobs/${jobId}`);
      const body = (await response.json()) as { item?: AgentRuntimeJobSnapshot; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to inspect job (HTTP ${response.status})`);
      }
      setJobSnapshots((current) => ({ ...current, [jobId]: body.item! }));
    },
    [authActions]
  );

  const runOperation = useCallback(
    async (agentId: string, operation: "heartbeat" | "diagnose") => {
      setRunningAgentId(agentId);
      setError(undefined);
      try {
        const response = await authActions.apiFetch(`/agents/${agentId}/${operation}`, {
          method: "POST",
          body: JSON.stringify({
            reason: "manual_ui"
          })
        });
        const body = (await response.json()) as { item?: AgentRuntimeJobReference; message?: string };
        if (!response.ok || !body.item) {
          throw new Error(body.message ?? `Unable to run ${operation} (HTTP ${response.status})`);
        }
        setJobRefs((current) => ({ ...current, [agentId]: body.item! }));
        await inspectJob(agentId, body.item.jobId);
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : `Unable to run ${operation}`);
      } finally {
        setRunningAgentId(undefined);
      }
    },
    [authActions, inspectJob]
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (roleFilter !== "all" && item.role !== roleFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.role.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [items, query, roleFilter, statusFilter]);

  const roleOptions = useMemo(
    () => ["all", ...new Set(items.map((item) => item.role))],
    [items]
  );
  const statusOptions = useMemo(
    () => ["all", ...new Set(items.map((item) => item.status))],
    [items]
  );

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Agents"
          subtitle="Creation, configuration and runtime checks"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadAgents()}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Link
                to="/agents/new"
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/15 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
              >
                New agent
              </Link>
            </div>
          }
        />
        <div className="grid gap-2 lg:grid-cols-[1fr_220px_220px]">
          <Input value={query} onChange={setQuery} placeholder="Search agents by name, role, description..." />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {filteredItems.map((agent) => {
          const jobRef = jobRefs[agent.id];
          const snapshot = jobRef ? jobSnapshots[jobRef.jobId] : undefined;
          return (
            <Panel key={agent.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="label">{agent.role}</div>
                  <h2 className="mt-1 text-xl font-semibold text-white">{agent.icon} {agent.name}</h2>
                  <p className="mt-2 text-sm text-slate-300">{agent.description}</p>
                </div>
                <Pill tone={agent.status === "active" ? "good" : agent.status === "degraded" ? "warn" : "default"}>
                  {agent.status}
                </Pill>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {agent.capabilities.map((capability) => (
                  <Pill key={`${agent.id}:${capability}`} tone="accent">
                    {capability}
                  </Pill>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/agents/$agentId"
                  params={{ agentId: agent.id }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                >
                  Configure
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => void runOperation(agent.id, "heartbeat")}
                >
                  {runningAgentId === agent.id ? "Running..." : "Heartbeat"}
                </Button>
                <Button onClick={() => void runOperation(agent.id, "diagnose")}>Diagnose</Button>
              </div>
              {jobRef ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white">{jobRef.operation} · job {jobRef.jobId}</span>
                    <span className="text-slate-400">{snapshot?.state ?? "queued"}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {(snapshot?.logs ?? [`[queued] ${jobRef.command} ${jobRef.args.join(" ")}`]).slice(-3).join(" | ")}
                  </div>
                </div>
              ) : null}
            </Panel>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <Panel>
          <p className="text-sm text-slate-300">No agents found for the current filter.</p>
        </Panel>
      ) : null}
    </div>
  );
}
