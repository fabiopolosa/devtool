import type { McpConnection, McpDelegationRun } from "@cp/domain";
import { describe, expect, it } from "vitest";
import { McpService, type McpStore } from "./service.js";

class InMemoryMcpStore implements McpStore {
  private readonly connections = new Map<string, McpConnection>();
  private readonly runs = new Map<string, McpDelegationRun>();

  async listConnections(): Promise<McpConnection[]> {
    return [...this.connections.values()];
  }

  async getConnection(connectionId: string): Promise<McpConnection | null> {
    return this.connections.get(connectionId) ?? null;
  }

  async createConnection(connection: McpConnection): Promise<McpConnection> {
    this.connections.set(connection.id, connection);
    return connection;
  }

  async updateConnection(connectionId: string, patch: Partial<McpConnection>): Promise<McpConnection> {
    const existing = this.connections.get(connectionId);
    if (!existing) throw new Error("missing connection");
    const next = { ...existing, ...patch };
    this.connections.set(connectionId, next);
    return next;
  }

  async listDelegationRuns(filters?: { connectionId?: string }): Promise<McpDelegationRun[]> {
    const all = [...this.runs.values()];
    if (!filters?.connectionId) return all;
    return all.filter((run) => run.connectionId === filters.connectionId);
  }

  async createDelegationRun(run: McpDelegationRun): Promise<McpDelegationRun> {
    this.runs.set(run.id, run);
    return run;
  }

  async updateDelegationRun(runId: string, patch: Partial<McpDelegationRun>): Promise<McpDelegationRun> {
    const existing = this.runs.get(runId);
    if (!existing) throw new Error("missing run");
    const next = { ...existing, ...patch };
    this.runs.set(runId, next);
    return next;
  }
}

describe("McpService", () => {
  it("runs healthchecks and delegations when enabled", async () => {
    const store = new InMemoryMcpStore();
    await store.createConnection({
      id: "mcp_1",
      name: "openclaw",
      baseUrl: "http://mcp.local",
      enabled: true,
      status: "unknown",
      capabilities: ["diagnostics"],
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "seed",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "seed"
    });

    const service = new McpService({
      store,
      enabled: true,
      fetchImpl: (async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/health")) {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ ok: true, delegated: true }), { status: 200 });
      }) as typeof fetch,
      idGenerator: () => "run_1",
      now: () => new Date("2026-04-14T00:00:00.000Z")
    });

    const health = await service.runHealthcheck("mcp_1", "tester");
    expect(health.status).toBe("healthy");

    const delegated = await service.delegate({
      connectionId: "mcp_1",
      operation: "runtime.check",
      payload: { dryRun: true },
      actor: "tester"
    });
    expect(delegated.status).toBe("completed");
  });
});
