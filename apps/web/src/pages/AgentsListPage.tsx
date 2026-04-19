import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentConfig } from "@cp/domain";
import {
  agentLibraryGroupLabels,
  classifyAgentLibraryGroup,
  extractAgentProfile,
  type AgentLibraryGroup
} from "@/components/agents/agent-profile";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import {
  describeHeartbeatPolicy,
  describeRuntimeProfile,
  resolveRuntimeProfileForAgent,
  runtimeHostLabels,
  runtimeKindLabels,
  runtimeVendorLabels,
  launchModeLabels
} from "@/components/runtime-profile/runtime-profile-utils";
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

const groupOrder: AgentLibraryGroup[] = ["system", "tenant", "project_assigned"];

const hasOwn = <T extends object>(value: T, key: PropertyKey): key is keyof T =>
  Object.prototype.hasOwnProperty.call(value, key);

const formatToken = (value: string): string => value.replace(/[_-]/g, " ");

const resolveProviderLabel = (value: string): string =>
  hasOwn(runtimeVendorLabels, value) ? runtimeVendorLabels[value] : formatToken(value);

const resolveModeLabel = (value: string): string => {
  if (hasOwn(runtimeKindLabels, value)) return runtimeKindLabels[value];
  if (hasOwn(runtimeHostLabels, value)) return runtimeHostLabels[value];
  if (hasOwn(launchModeLabels, value)) return launchModeLabels[value];
  return formatToken(value);
};

export function AgentsListPage() {
  const { authActions } = useAppStore();
  const projectId = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const parts = window.location.pathname.split("/").filter(Boolean);
    if ((parts[0] === "project" || parts[0] === "projects") && parts[1] && parts[2] === "agents") {
      return parts[1];
    }
    return undefined;
  }, []);
  const [items, setItems] = useState<AgentConfig[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState<"all" | AgentLibraryGroup>("all");
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
            reason: "manual_ui",
            ...(projectId ? { projectId } : {})
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
    [authActions, inspectJob, projectId]
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const group = classifyAgentLibraryGroup(item);
      if (roleFilter !== "all" && item.role !== roleFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (groupFilter !== "all" && group !== groupFilter) return false;
      if (!normalizedQuery) return true;
      return (
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.role.toLowerCase().includes(normalizedQuery) ||
        agentLibraryGroupLabels[group].toLowerCase().includes(normalizedQuery)
      );
    });
  }, [groupFilter, items, query, roleFilter, statusFilter]);

  const roleOptions = useMemo(
    () => ["all", ...new Set(items.map((item) => item.role))],
    [items]
  );
  const statusOptions = useMemo(
    () => ["all", ...new Set(items.map((item) => item.status))],
    [items]
  );

  const groupedItems = useMemo(() => {
    const grouped: Record<AgentLibraryGroup, AgentConfig[]> = {
      system: [],
      tenant: [],
      project_assigned: []
    };
    filteredItems.forEach((item) => {
      grouped[classifyAgentLibraryGroup(item)].push(item);
    });
    return grouped;
  }, [filteredItems]);

  const groupCounts = useMemo(() => {
    const counts: Record<AgentLibraryGroup, number> = {
      system: 0,
      tenant: 0,
      project_assigned: 0
    };
    items.forEach((item) => {
      counts[classifyAgentLibraryGroup(item)] += 1;
    });
    return counts;
  }, [items]);

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Agent Library"
          subtitle="System, tenant and project-assigned agents"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void loadAgents()}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Link
                to="/settings/agents/new"
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/15 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
              >
                New agent
              </Link>
            </div>
          }
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {groupOrder.map((group) => (
            <Pill key={group} tone={group === "project_assigned" ? "accent" : "default"}>
              {agentLibraryGroupLabels[group]}: {groupCounts[group]}
            </Pill>
          ))}
        </div>
        <div className="grid gap-2 lg:grid-cols-[1fr_220px_220px_220px]">
          <Input value={query} onChange={setQuery} placeholder="Search by name, role, description, group..." />
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
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value as "all" | AgentLibraryGroup)}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
          >
            <option value="all">all groups</option>
            {groupOrder.map((group) => (
              <option key={group} value={group}>
                {agentLibraryGroupLabels[group]}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
        {projectId ? (
          <p className="mt-3 text-xs text-cyan-100/80">
            Project-scoped context injection active for runtime operations (project: {projectId}).
          </p>
        ) : null}
      </Panel>

      {groupOrder.map((group) => {
        const groupItems = groupedItems[group];
        if (groupItems.length === 0) return null;
        return (
          <Panel key={group} data-testid={`agent-group-${group}`}>
            <SectionHeading
              title={agentLibraryGroupLabels[group]}
              subtitle={`${groupItems.length} ${groupItems.length === 1 ? "agent" : "agents"}`}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              {groupItems.map((agent) => {
                const jobRef = jobRefs[agent.id];
                const snapshot = jobRef ? jobSnapshots[jobRef.jobId] : undefined;
                const runtimeProfile = resolveRuntimeProfileForAgent(agent);
                const profile = extractAgentProfile(agent);
                return (
                  <div key={agent.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="label">{agent.role}</div>
                        <h2 className="mt-1 text-xl font-semibold text-white">
                          {agent.icon} {agent.name}
                        </h2>
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill tone="default">language {profile.language ?? "n/a"}</Pill>
                      {(profile.compatibility.length > 0 ? profile.compatibility : [agent.adapterType]).slice(0, 2).map((entry) => (
                        <Pill key={`${agent.id}:compat:${entry}`} tone="default">
                          compatibility {entry}
                        </Pill>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(profile.supportedProviders.length > 0 ? profile.supportedProviders : [runtimeProfile.vendor]).slice(0, 3).map((provider) => (
                        <Pill key={`${agent.id}:provider:${provider}`} tone="default">
                          provider {resolveProviderLabel(provider)}
                        </Pill>
                      ))}
                      {(profile.supportedModes.length > 0
                        ? profile.supportedModes
                        : [runtimeProfile.runtimeKind, runtimeProfile.host, runtimeProfile.launchMode]
                      )
                        .slice(0, 3)
                        .map((mode) => (
                          <Pill key={`${agent.id}:mode:${mode}`} tone="default">
                            mode {resolveModeLabel(mode)}
                          </Pill>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill tone="default">family {runtimeKindLabels[runtimeProfile.runtimeKind]}</Pill>
                      <Pill tone="default">vendor {runtimeVendorLabels[runtimeProfile.vendor]}</Pill>
                      <Pill tone="default">host {runtimeHostLabels[runtimeProfile.host]}</Pill>
                      <Pill tone="default">launch {launchModeLabels[runtimeProfile.launchMode]}</Pill>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">{describeRuntimeProfile(runtimeProfile)}</p>
                    <p className="mt-1 text-xs text-cyan-100/80">
                      Heartbeat {describeHeartbeatPolicy(agent.heartbeatPolicy)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        to="/settings/agents/$agentId"
                        params={{ agentId: agent.id }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                      >
                        Configure
                      </Link>
                      <Button variant="secondary" onClick={() => void runOperation(agent.id, "heartbeat")}>
                        {runningAgentId === agent.id ? "Running..." : "Heartbeat"}
                      </Button>
                      <Button onClick={() => void runOperation(agent.id, "diagnose")}>Diagnose</Button>
                    </div>
                    {jobRef ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-white">
                            {jobRef.operation} · job {jobRef.jobId}
                          </span>
                          <span className="text-slate-400">{snapshot?.state ?? "queued"}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-400">
                          {(snapshot?.logs ?? [`[queued] ${jobRef.command} ${jobRef.args.join(" ")}`])
                            .slice(-3)
                            .join(" | ")}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}

      {filteredItems.length === 0 ? (
        <Panel>
          <p className="text-sm text-slate-300">No agents found for the current filters.</p>
        </Panel>
      ) : null}
    </div>
  );
}
