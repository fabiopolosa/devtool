import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Panel, Pill, SectionHeading } from "@/components/common";
import { useAppStore } from "@/store/app-store";

type WorkerMachine = {
  id: string;
  name: string;
  host: string;
  status: "online" | "degraded" | "offline" | "maintenance" | string;
  services: string[];
  agents: string[];
  lastHeartbeatAt?: string;
  metadata?: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const parseMode = (machine: WorkerMachine): "local" | "remote" | "hybrid" | "unknown" => {
  const execution = asRecord(machine.metadata)?.execution;
  const modeRaw = asRecord(execution)?.mode;
  if (typeof modeRaw === "string") {
    const mode = modeRaw.trim().toLowerCase();
    if (mode === "local" || mode === "remote" || mode === "hybrid") return mode;
  }
  if (machine.agents.includes("local-worker")) return "local";
  if (machine.agents.includes("remote-worker")) return "remote";
  if (machine.services.includes("shell")) return "local";
  if (machine.services.includes("internal_runner")) return "remote";
  return "unknown";
};

const hasFreshHeartbeat = (timestamp?: string): boolean => {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= 45_000;
};

const isRunning = (machine: WorkerMachine): boolean =>
  (machine.status === "online" || machine.status === "degraded") && hasFreshHeartbeat(machine.lastHeartbeatAt);

const isExecutionWorker = (machine: WorkerMachine): boolean => parseMode(machine) !== "unknown";

export function WorkersPage() {
  const { authActions } = useAppStore();
  const [items, setItems] = useState<WorkerMachine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pendingStopId, setPendingStopId] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const { response, body } = await authActions.apiFetchJson<{
        items?: WorkerMachine[];
        message?: string;
      }>("/machines");
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load workers (HTTP ${response.status})`);
      }
      setItems((body.items ?? []).filter((machine) => isExecutionWorker(machine)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load workers");
    } finally {
      setLoading(false);
    }
  }, [authActions]);

  useEffect(() => {
    void load();
  }, [load]);

  const stopWorker = useCallback(
    async (machine: WorkerMachine) => {
      setPendingStopId(machine.id);
      setError(undefined);
      try {
        const { response, body } = await authActions.apiFetchJson<{ item?: WorkerMachine; message?: string }>(
          `/execution/workers/${machine.id}/heartbeat`,
          {
            method: "POST",
            body: JSON.stringify({
              status: "offline",
              capabilities: machine.services
            })
          }
        );
        if (!response.ok) {
          throw new Error(body.message ?? `Unable to stop worker (HTTP ${response.status})`);
        }
        await load();
      } catch (stopError) {
        setError(stopError instanceof Error ? stopError.message : "Unable to stop worker");
      } finally {
        setPendingStopId(undefined);
      }
    },
    [authActions, load]
  );

  const ordered = useMemo(
    () =>
      [...items].sort((left, right) => {
        const leftRunning = isRunning(left) ? 0 : 1;
        const rightRunning = isRunning(right) ? 0 : 1;
        if (leftRunning !== rightRunning) return leftRunning - rightRunning;
        return left.name.localeCompare(right.name);
      }),
    [items]
  );

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Workers"
          subtitle="Execution worker status, capabilities, and heartbeat"
          action={
            <Button variant="secondary" onClick={() => void load()}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <p className="text-sm text-[color:var(--muted)]">
          Start workers from CLI with <code>devtools worker start</code>. Stop marks the worker offline immediately.
        </p>
        {error ? <p className="mt-2 text-sm text-[color:var(--bad)]">{error}</p> : null}
      </Panel>

      <div className="grid gap-3">
        {ordered.map((machine) => {
          const mode = parseMode(machine);
          const running = isRunning(machine);
          return (
            <Panel key={machine.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="label">{mode} worker</div>
                  <div className="mt-1 text-base font-semibold">{machine.name}</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    {machine.id} · host {machine.host}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={running ? "good" : "default"}>{running ? "running" : "stopped"}</Pill>
                  <Pill tone={machine.status === "degraded" ? "warn" : machine.status === "offline" ? "default" : "accent"}>
                    {machine.status}
                  </Pill>
                  {running ? (
                    <Button
                      variant="secondary"
                      onClick={() => void stopWorker(machine)}
                    >
                      {pendingStopId === machine.id ? "Stopping..." : "Stop"}
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 text-xs text-[color:var(--muted)]">
                last heartbeat: {machine.lastHeartbeatAt ?? "n/a"}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {machine.services.map((service) => (
                  <Pill key={`${machine.id}:${service}`} tone="accent">
                    {service}
                  </Pill>
                ))}
                {machine.services.length === 0 ? (
                  <span className="text-xs text-[color:var(--muted)]">No capabilities declared.</span>
                ) : null}
              </div>
            </Panel>
          );
        })}
        {!loading && ordered.length === 0 ? (
          <Panel>
            <p className="text-sm text-[color:var(--muted)]">No workers registered.</p>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
