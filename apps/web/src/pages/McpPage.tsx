import { useCallback, useEffect, useState } from "react";
import type { McpConnection, McpDelegationRun } from "@cp/domain";
import { Button, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type McpStatusResponse = { enabled: boolean; message?: string };

export function McpPage() {
  const { auth, authActions } = useAppStore();
  const [status, setStatus] = useState<McpStatusResponse>({ enabled: false, message: "Loading..." });
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [runs, setRuns] = useState<McpDelegationRun[]>([]);
  const [name, setName] = useState("openclaw-default");
  const [baseUrl, setBaseUrl] = useState("http://localhost:7777");
  const [authSecretRef, setAuthSecretRef] = useState("secret://provider/openclaw-token");
  const [error, setError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    setError(undefined);
    try {
      const [statusResponse, connectionsResponse, runsResponse] = await Promise.all([
        authActions.apiFetch("/mcp/status"),
        authActions.apiFetch("/mcp/connections"),
        authActions.apiFetch("/mcp/runs")
      ]);

      const statusBody = (await statusResponse.json()) as McpStatusResponse;
      const connectionsBody = (await connectionsResponse.json()) as { items?: McpConnection[]; message?: string };
      const runsBody = (await runsResponse.json()) as { items?: McpDelegationRun[]; message?: string };

      if (!statusResponse.ok) {
        throw new Error(statusBody.message ?? `Unable to load MCP status (HTTP ${statusResponse.status})`);
      }
      if (!connectionsResponse.ok) {
        throw new Error(connectionsBody.message ?? `Unable to load MCP connections (HTTP ${connectionsResponse.status})`);
      }
      if (!runsResponse.ok) {
        throw new Error(runsBody.message ?? `Unable to load MCP runs (HTTP ${runsResponse.status})`);
      }

      setStatus(statusBody);
      setConnections(connectionsBody.items ?? []);
      setRuns(runsBody.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load MCP panel");
    }
  }, [authActions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createConnection = async (): Promise<void> => {
    setError(undefined);
    try {
      const response = await authActions.apiFetch("/mcp/connections", {
        method: "POST",
        body: JSON.stringify({
          name,
          baseUrl,
          authSecretRef,
          enabled: true,
          capabilities: ["diagnostics", "auto_config"]
        })
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to save MCP connection (HTTP ${response.status})`);
      }
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save MCP connection");
    }
  };

  const runHealthcheck = async (connectionId: string): Promise<void> => {
    setError(undefined);
    try {
      const response = await authActions.apiFetch(`/mcp/connections/${connectionId}/healthcheck`, {
        method: "POST",
        body: JSON.stringify({})
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to run MCP healthcheck (HTTP ${response.status})`);
      }
      await refresh();
    } catch (healthError) {
      setError(healthError instanceof Error ? healthError.message : "Unable to run MCP healthcheck");
    }
  };

  const runDelegate = async (connectionId: string): Promise<void> => {
    setError(undefined);
    try {
      const response = await authActions.apiFetch("/mcp/delegate", {
        method: "POST",
        body: JSON.stringify({
          connectionId,
          operation: "provider.auto_config",
          payload: { dryRun: true }
        })
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to delegate MCP operation (HTTP ${response.status})`);
      }
      await refresh();
    } catch (delegateError) {
      setError(delegateError instanceof Error ? delegateError.message : "Unable to delegate MCP operation");
    }
  };

  if (!auth.enabled) {
    return (
      <Panel>
        <SectionHeading title="MCP" subtitle="External runtime bridge" />
        <p className="text-sm text-[color:var(--muted)]">
          MCP controls are available when authentication is enabled.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="MCP"
          subtitle="External runtime bridge"
          action={
            <Button variant="secondary" onClick={() => void refresh()}>
              Refresh
            </Button>
          }
        />
        <div className="flex items-center gap-2 text-sm">
          <Pill tone={status.enabled ? "good" : "warn"}>{status.enabled ? "enabled" : "disabled"}</Pill>
          <span className="text-[color:var(--muted)]">{status.message ?? "No status message"}</span>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <Panel>
        <SectionHeading title="Connection setup" subtitle="Optional: configure OpenClaw or custom MCP server" />
        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-none border border-[color:var(--line)] bg-black/20 px-3 py-2 text-sm text-[color:var(--text)]"
            placeholder="Connection name"
          />
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="rounded-none border border-[color:var(--line)] bg-black/20 px-3 py-2 text-sm text-[color:var(--text)]"
            placeholder="Base URL"
          />
          <input
            value={authSecretRef}
            onChange={(event) => setAuthSecretRef(event.target.value)}
            className="rounded-none border border-[color:var(--line)] bg-black/20 px-3 py-2 text-sm text-[color:var(--text)]"
            placeholder="secret://provider/openclaw-token"
          />
        </div>
        <div className="mt-3">
          <Button variant="primary" onClick={() => void createConnection()}>
            Save connection
          </Button>
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Connections" subtitle={`${connections.length} configured`} />
        <div className="space-y-2">
          {connections.map((connection) => (
            <div key={connection.id} className="border border-[color:var(--line)] bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-[color:var(--text)]">{connection.name}</div>
                  <div className="text-xs text-[color:var(--muted)]">
                    {connection.baseUrl} · {connection.authSecretRef ?? "no secret ref"}
                  </div>
                </div>
                <Pill tone={connection.status === "healthy" ? "good" : connection.status === "down" ? "bad" : "warn"}>
                  {connection.status}
                </Pill>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void runHealthcheck(connection.id)}>
                  Healthcheck
                </Button>
                <Button variant="primary" onClick={() => void runDelegate(connection.id)}>
                  Delegate dry-run
                </Button>
              </div>
            </div>
          ))}
          {connections.length === 0 ? (
            <p className="text-sm text-[color:var(--muted)]">No MCP connections configured.</p>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <SectionHeading title="Delegation runs" subtitle={`${runs.length} records`} />
        <div className="space-y-1 text-xs text-[color:var(--muted)]">
          {runs.map((run) => (
            <div key={run.id} className="border border-[color:var(--line)] bg-black/20 p-2">
              <span className="font-semibold text-[color:var(--text)]">{run.operation}</span> ·{" "}
              <span>{run.status}</span> · {run.connectionId}
              {run.error ? <span className="ml-2 text-rose-300">({run.error})</span> : null}
            </div>
          ))}
          {runs.length === 0 ? <div>No MCP run recorded yet.</div> : null}
        </div>
      </Panel>
    </div>
  );
}
