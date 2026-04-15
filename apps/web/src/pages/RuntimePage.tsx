import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AgentConfig } from "@cp/domain";
import { Button, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type WorkflowRuntimeDefinition = {
  id: string;
  version?: string;
  maxRetries: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
  escalationRule: string;
};

type RuntimeJobRef = {
  jobId: string;
  operation: "heartbeat" | "diagnose";
};

type AuditEventView = {
  id: string;
  action: string;
  status: "success" | "failure";
  resourceType: string;
  resourceId?: string;
  tenantId?: string;
  projectId?: string;
  jobId?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

type UsageEventView = {
  id: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  projectId?: string;
  jobId?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type AuditSummaryView = {
  total: number;
  success: number;
  failure: number;
  byAction: Array<{ action: string; total: number; success: number; failure: number }>;
};

type UsageSummaryView = {
  totalCount: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byProvider: Array<{ key: string; count: number; totalCost: number; totalInputTokens: number; totalOutputTokens: number }>;
  byModel: Array<{ key: string; count: number; totalCost: number; totalInputTokens: number; totalOutputTokens: number }>;
};

const apiBaseUrl = (((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").trim().replace(/\/$/, "")) ||
  (import.meta.env.DEV ? "http://localhost:4000" : "");
const toApiUrl = (path: string): string => {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${apiBaseUrl}${path}`;
};

export function RuntimePage() {
  const { authActions } = useAppStore();
  const [workflows, setWorkflows] = useState<WorkflowRuntimeDefinition[]>([]);
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, WorkflowRuntimeDefinition>>({});
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [lastRuntimeJob, setLastRuntimeJob] = useState<RuntimeJobRef | undefined>();
  const [liveState, setLiveState] = useState("idle");
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [mcpMessage, setMcpMessage] = useState<string | undefined>();
  const [mcpConnections, setMcpConnections] = useState<number>(0);
  const [runtimeTab, setRuntimeTab] = useState<"audit" | "usage">("audit");
  const [auditEvents, setAuditEvents] = useState<AuditEventView[]>([]);
  const [auditSummary, setAuditSummary] = useState<AuditSummaryView | undefined>();
  const [usageEvents, setUsageEvents] = useState<UsageEventView[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryView | undefined>();
  const [runtimeDataError, setRuntimeDataError] = useState<string | undefined>();
  const [runtimeDataLoading, setRuntimeDataLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadRuntime = useCallback(async () => {
    setError(undefined);
    try {
      const [workflowsResponse, agentsResponse, mcpStatusResponse, mcpConnectionsResponse] = await Promise.all([
        authActions.apiFetch("/agents/runtime/workflows"),
        authActions.apiFetch("/agents"),
        authActions.apiFetch("/mcp/status"),
        authActions.apiFetch("/mcp/connections")
      ]);

      const workflowsBody = (await workflowsResponse.json()) as {
        items?: WorkflowRuntimeDefinition[];
        message?: string;
      };
      const agentsBody = (await agentsResponse.json()) as { items?: AgentConfig[]; message?: string };
      const mcpStatusBody = (await mcpStatusResponse.json()) as { enabled?: boolean; message?: string };
      const mcpConnectionsBody = (await mcpConnectionsResponse.json()) as {
        items?: Array<{ id: string }>;
        message?: string;
      };

      if (!workflowsResponse.ok) {
        throw new Error(workflowsBody.message ?? `Unable to load workflow runtime settings (HTTP ${workflowsResponse.status})`);
      }
      if (!agentsResponse.ok) {
        throw new Error(agentsBody.message ?? `Unable to load agents (HTTP ${agentsResponse.status})`);
      }
      if (!mcpStatusResponse.ok) {
        throw new Error(
          mcpStatusBody.message ?? `Unable to load MCP status (HTTP ${mcpStatusResponse.status})`
        );
      }
      if (!mcpConnectionsResponse.ok) {
        throw new Error(
          mcpConnectionsBody.message ??
            `Unable to load MCP connections (HTTP ${mcpConnectionsResponse.status})`
        );
      }

      const nextWorkflows = workflowsBody.items ?? [];
      setWorkflows(nextWorkflows);
      setWorkflowDrafts(Object.fromEntries(nextWorkflows.map((workflow) => [workflow.id, workflow])));
      const nextAgents = agentsBody.items ?? [];
      setAgents(nextAgents);
      if (!selectedAgentId && nextAgents.length > 0) {
        setSelectedAgentId(nextAgents[0]!.id);
      }
      setMcpEnabled(Boolean(mcpStatusBody.enabled));
      setMcpMessage(mcpStatusBody.message);
      setMcpConnections(mcpConnectionsBody.items?.length ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load runtime panel");
    }
  }, [authActions, selectedAgentId]);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  useEffect(
    () => () => {
      eventSourceRef.current?.close();
    },
    []
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId),
    [agents, selectedAgentId]
  );

  const updateDraft = (workflowId: string, patch: Partial<WorkflowRuntimeDefinition>): void => {
    setWorkflowDrafts((current) => {
      const existing = current[workflowId];
      if (!existing) return current;
      return {
        ...current,
        [workflowId]: {
          ...existing,
          ...patch
        }
      };
    });
  };

  const startStream = useCallback((agentId: string, jobId: string) => {
    eventSourceRef.current?.close();
    setLiveLogs([]);
    setLiveState("queued");
    const streamUrl = toApiUrl(`/agents/${agentId}/jobs/${jobId}/events`);
    const source = new EventSource(streamUrl);
    eventSourceRef.current = source;

    source.addEventListener("log", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { message?: string };
      const message = data.message ?? "";
      if (!message) return;
      setLiveLogs((current) => [...current, message].slice(-200));
    });

    source.addEventListener("state", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { state?: string };
      if (!data.state) return;
      setLiveState(data.state);
    });

    source.addEventListener("missing", () => {
      setLiveState("missing");
      source.close();
    });

    source.onerror = () => {
      setLiveState("disconnected");
      source.close();
    };
  }, []);

  const triggerOperation = async (operation: "heartbeat" | "diagnose"): Promise<void> => {
    if (!selectedAgentId) {
      setError("Select an agent first.");
      return;
    }
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/agents/${selectedAgentId}/${operation}`, {
        method: "POST",
        body: JSON.stringify({ reason: "runtime_panel" })
      });
      const body = (await response.json()) as { item?: RuntimeJobRef; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to trigger ${operation} (HTTP ${response.status})`);
      }
      setLastRuntimeJob(body.item);
      startStream(selectedAgentId, body.item.jobId);
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : `Unable to trigger ${operation}`);
    }
  };

  const loadRuntimeTelemetry = useCallback(
    async (tab: "audit" | "usage") => {
      setRuntimeDataLoading(true);
      setRuntimeDataError(undefined);
      try {
        if (tab === "audit") {
          const { response, body } = await authActions.apiFetchJson<{
            items?: AuditEventView[];
            summary?: AuditSummaryView;
            message?: string;
          }>("/audit");
          if (!response.ok) {
            throw new Error(body.message ?? `Unable to load audit events (HTTP ${response.status})`);
          }
          setAuditEvents(body.items ?? []);
          setAuditSummary(body.summary);
        } else {
          const { response, body } = await authActions.apiFetchJson<{
            items?: UsageEventView[];
            summary?: UsageSummaryView;
            message?: string;
          }>("/usage");
          if (!response.ok) {
            throw new Error(body.message ?? `Unable to load usage events (HTTP ${response.status})`);
          }
          setUsageEvents(body.items ?? []);
          setUsageSummary(body.summary);
        }
      } catch (loadError) {
        setRuntimeDataError(loadError instanceof Error ? loadError.message : "Unable to load runtime telemetry");
      } finally {
        setRuntimeDataLoading(false);
      }
    },
    [authActions]
  );

  useEffect(() => {
    void loadRuntimeTelemetry(runtimeTab);
  }, [loadRuntimeTelemetry, runtimeTab]);

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Ruflo & Runtime"
          subtitle="Workflow runtime controls and agent diagnostics"
          action={
            <Button variant="secondary" onClick={() => void loadRuntime()}>
              Refresh
            </Button>
          }
        />
        {error ? <p className="text-sm text-[color:var(--bad)]">{error}</p> : null}
      </Panel>

      <Panel>
        <SectionHeading title="Workflow runtime parameters" subtitle="Editable drafts from configs/workflows" />
        <div className="space-y-3">
          {workflows.map((workflow) => {
            const draft = workflowDrafts[workflow.id] ?? workflow;
            return (
              <div key={workflow.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-medium text-white">
                    {workflow.id} {workflow.version ? <span className="text-slate-400">({workflow.version})</span> : null}
                  </div>
                  <Pill tone="accent">draft</Pill>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  <label className="text-xs text-slate-400">
                    maxRetries
                    <input
                      type="number"
                      value={draft.maxRetries}
                      onChange={(event) => updateDraft(workflow.id, { maxRetries: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    maxInputTokens
                    <input
                      type="number"
                      value={draft.maxInputTokens}
                      onChange={(event) => updateDraft(workflow.id, { maxInputTokens: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    maxOutputTokens
                    <input
                      type="number"
                      value={draft.maxOutputTokens}
                      onChange={(event) => updateDraft(workflow.id, { maxOutputTokens: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    maxCostUsd
                    <input
                      type="number"
                      value={draft.maxCostUsd}
                      onChange={(event) => updateDraft(workflow.id, { maxCostUsd: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs text-slate-400">
                  escalationRule
                  <input
                    value={draft.escalationRule}
                    onChange={(event) => updateDraft(workflow.id, { escalationRule: event.target.value })}
                    className="cp-input mt-1 w-full px-2 py-1 text-sm"
                  />
                </label>
              </div>
            );
          })}
          {workflows.length === 0 ? <p className="text-sm text-[color:var(--muted)]">No workflows found.</p> : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="MCP Integration" subtitle="Optional external runtime bridge" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill tone={mcpEnabled ? "good" : "warn"}>{mcpEnabled ? "enabled" : "disabled"}</Pill>
          <span className="text-[color:var(--muted)]">{mcpMessage ?? "No MCP status message"}</span>
          <span className="text-[color:var(--muted)]">connections: {mcpConnections}</span>
        </div>
        <div className="mt-3">
          {mcpEnabled ? (
            <Link
              to="/settings/mcp"
              className="btn btn-ghost inline-flex items-center px-3 py-2 text-xs"
            >
              Open MCP panel
            </Link>
          ) : (
            <span className="text-xs text-[color:var(--muted)]">MCP non configurato.</span>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Agent runtime diagnostics" subtitle="Heartbeat / doctor with live logs" />
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <select
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            className="cp-input"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.role})
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void triggerOperation("heartbeat")}>
            Heartbeat
          </Button>
          <Button onClick={() => void triggerOperation("diagnose")}>Doctor</Button>
        </div>
        {selectedAgent ? (
          <p className="mt-2 text-xs text-[color:var(--muted)]">
            Selected agent: {selectedAgent.name} · adapter {selectedAgent.adapterType}
          </p>
        ) : null}
        {lastRuntimeJob ? (
          <div className="mt-3 border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-[color:var(--text)]">
                Job {lastRuntimeJob.jobId} · {lastRuntimeJob.operation}
              </span>
              <Pill tone={liveState === "completed" ? "good" : liveState === "failed" ? "bad" : "warn"}>
                {liveState}
              </Pill>
            </div>
            <div className="mt-2 max-h-72 space-y-1 overflow-auto border border-[color:var(--line)] bg-black/35 p-2 font-mono text-xs text-[color:var(--text)]">
              {liveLogs.map((line, index) => (
                <div key={`${lastRuntimeJob.jobId}:${index}`}>{line}</div>
              ))}
              {liveLogs.length === 0 ? <div>Waiting for runtime logs...</div> : null}
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading title="Audit / Usage" subtitle="Runtime telemetry, token usage and cost" />
          <div className="flex border border-[color:var(--line)] bg-[color:var(--panel2)] p-1 text-xs">
            <button
              type="button"
              onClick={() => setRuntimeTab("audit")}
              className={`px-3 py-1.5 uppercase tracking-[0.08em] ${runtimeTab === "audit" ? "bg-cyan-500/20 text-cyan-200" : "text-[color:var(--muted)]"}`}
            >
              Audit
            </button>
            <button
              type="button"
              onClick={() => setRuntimeTab("usage")}
              className={`px-3 py-1.5 uppercase tracking-[0.08em] ${runtimeTab === "usage" ? "bg-cyan-500/20 text-cyan-200" : "text-[color:var(--muted)]"}`}
            >
              Usage
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.08em] text-[color:var(--muted)]">
          <span>{runtimeDataLoading ? "Loading runtime telemetry…" : "Runtime telemetry is live."}</span>
          <Button variant="secondary" onClick={() => void loadRuntimeTelemetry(runtimeTab)}>
            Refresh telemetry
          </Button>
        </div>

        {runtimeDataError ? <p className="mt-3 text-sm text-[color:var(--bad)]">{runtimeDataError}</p> : null}

        {runtimeTab === "audit" ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="Events" value={String(auditSummary?.total ?? auditEvents.length)} />
              <MetricCard label="Success" value={String(auditSummary?.success ?? 0)} />
              <MetricCard label="Failure" value={String(auditSummary?.failure ?? 0)} />
            </div>
            <div className="overflow-hidden border border-[color:var(--line)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[color:var(--panel2)] text-xs uppercase tracking-wide text-[color:var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Scope</th>
                    <th className="px-3 py-2">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.map((event) => (
                    <tr key={event.id} className="border-t border-[color:var(--line)]">
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)]">{event.occurredAt}</td>
                      <td className="px-3 py-2 text-[color:var(--text)]">{event.action}</td>
                      <td className="px-3 py-2">
                        <Pill tone={event.status === "success" ? "good" : "bad"}>{event.status}</Pill>
                      </td>
                      <td className="px-3 py-2 text-xs text-[color:var(--text)]">
                        {[event.tenantId, event.projectId, event.jobId].filter(Boolean).join(" · ") || "global"}
                      </td>
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                        {Object.keys(event.metadata ?? {}).length > 0 ? JSON.stringify(event.metadata) : "—"}
                      </td>
                    </tr>
                  ))}
                  {auditEvents.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-center text-sm text-[color:var(--muted)]" colSpan={5}>
                        No audit events found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {auditSummary?.byAction?.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {auditSummary.byAction.map((item) => (
                  <div key={item.action} className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
                    <div className="text-sm text-[color:var(--text)]">{item.action}</div>
                    <div className="mt-1 text-xs text-[color:var(--muted)]">
                      total {item.total} · success {item.success} · failure {item.failure}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <MetricCard label="Calls" value={String(usageSummary?.totalCount ?? usageEvents.length)} />
              <MetricCard label="Cost" value={`$${(usageSummary?.totalCost ?? 0).toFixed(4)}`} />
              <MetricCard label="Input tokens" value={String(usageSummary?.totalInputTokens ?? 0)} />
              <MetricCard label="Output tokens" value={String(usageSummary?.totalOutputTokens ?? 0)} />
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              <SummaryList title="By provider" items={usageSummary?.byProvider ?? []} />
              <SummaryList title="By model" items={usageSummary?.byModel ?? []} />
            </div>
            <div className="overflow-hidden border border-[color:var(--line)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[color:var(--panel2)] text-xs uppercase tracking-wide text-[color:var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Tokens</th>
                    <th className="px-3 py-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usageEvents.map((event) => (
                    <tr key={event.id} className="border-t border-[color:var(--line)]">
                      <td className="px-3 py-2 text-xs text-[color:var(--muted)]">{event.createdAt}</td>
                      <td className="px-3 py-2 text-[color:var(--text)]">{event.provider}</td>
                      <td className="px-3 py-2 text-xs text-[color:var(--text)]">{event.model}</td>
                      <td className="px-3 py-2 text-xs text-[color:var(--text)]">
                        in {event.inputTokens} · out {event.outputTokens}
                      </td>
                      <td className="px-3 py-2 text-xs text-[color:var(--text)]">${event.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                  {usageEvents.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-center text-sm text-[color:var(--muted)]" colSpan={5}>
                        No usage events found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
      <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-lg font-medium text-[color:var(--text)]">{value}</div>
    </div>
  );
}

function SummaryList({
  title,
  items
}: {
  title: string;
  items: Array<{ key: string; count: number; totalCost: number; totalInputTokens: number; totalOutputTokens: number }>;
}) {
  return (
    <div className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
      <div className="text-sm text-[color:var(--text)]">{title}</div>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-3 text-xs text-[color:var(--muted)]">
            <span className="truncate">{item.key}</span>
            <span>
              {item.count} · ${item.totalCost.toFixed(4)}
            </span>
          </div>
        ))}
        {items.length === 0 ? <div className="text-xs text-[color:var(--muted)]">No data.</div> : null}
      </div>
    </div>
  );
}
