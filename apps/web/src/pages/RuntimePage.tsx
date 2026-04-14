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

const apiBaseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").trim().replace(/\/$/, "");
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

  return (
    <div className="space-y-5">
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
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
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
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1 text-sm text-white"
                  />
                </label>
              </div>
            );
          })}
          {workflows.length === 0 ? <p className="text-sm text-slate-400">No workflows found.</p> : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="MCP Integration" subtitle="Optional external runtime bridge" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill tone={mcpEnabled ? "good" : "warn"}>{mcpEnabled ? "enabled" : "disabled"}</Pill>
          <span className="text-slate-400">{mcpMessage ?? "No MCP status message"}</span>
          <span className="text-slate-400">connections: {mcpConnections}</span>
        </div>
        <div className="mt-3">
          {mcpEnabled ? (
            <Link
              to="/mcp"
              className="inline-flex items-center border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
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
            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40"
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
          <p className="mt-2 text-xs text-slate-400">
            Selected agent: {selectedAgent.name} · adapter {selectedAgent.adapterType}
          </p>
        ) : null}
        {lastRuntimeJob ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-white">
                Job {lastRuntimeJob.jobId} · {lastRuntimeJob.operation}
              </span>
              <Pill tone={liveState === "completed" ? "good" : liveState === "failed" ? "bad" : "warn"}>
                {liveState}
              </Pill>
            </div>
            <div className="mt-2 max-h-72 space-y-1 overflow-auto rounded-lg bg-slate-950/60 p-2 text-xs text-slate-300">
              {liveLogs.map((line, index) => (
                <div key={`${lastRuntimeJob.jobId}:${index}`}>{line}</div>
              ))}
              {liveLogs.length === 0 ? <div>Waiting for runtime logs...</div> : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
