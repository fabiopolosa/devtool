import type { AgentConfig } from "@cp/domain";
import { AgentService, InMemoryAgentRuntimeScheduler, type AgentConfigStore } from "./service.js";

class InMemoryAgentStore implements AgentConfigStore {
  private readonly rows = new Map<string, AgentConfig>();

  constructor(initial: AgentConfig[] = []) {
    for (const row of initial) {
      this.rows.set(row.id, row);
    }
  }

  async listAgents(): Promise<AgentConfig[]> {
    return [...this.rows.values()];
  }

  async getAgent(agentId: string): Promise<AgentConfig | null> {
    return this.rows.get(agentId) ?? null;
  }

  async createAgent(agent: AgentConfig): Promise<AgentConfig> {
    this.rows.set(agent.id, agent);
    return agent;
  }

  async updateAgent(agentId: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
    const existing = this.rows.get(agentId);
    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    const next = { ...existing, ...patch };
    this.rows.set(agentId, next);
    return next;
  }

  async deleteAgent(agentId: string): Promise<void> {
    this.rows.delete(agentId);
  }
}

const baseAgent = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "agent_001",
  name: "builder",
  role: "codex_builder",
  icon: "🛠️",
  description: "Builder agent",
  adapterType: "legacy_cli",
  desiredSkills: ["checks"],
  runtimeConfig: {},
  capabilities: ["coding"],
  createdAt: "2026-04-14T00:00:00.000Z",
  updatedAt: "2026-04-14T00:00:00.000Z",
  status: "active",
  ...overrides
});

describe("@cp/agents AgentService", () => {
  it("creates, updates, and deletes agent configs", async () => {
    const store = new InMemoryAgentStore();
    const service = new AgentService({
      store,
      runtimeScheduler: new InMemoryAgentRuntimeScheduler(),
      idGenerator: () => "agent_created",
      now: () => new Date("2026-04-14T12:00:00.000Z")
    });

    const created = await service.createAgent({
      name: "runtime-agent",
      role: "codex_builder",
      icon: "⚙️",
      description: "Runtime managed agent",
      adapterType: "legacy_cli",
      desiredSkills: ["checks"],
      runtimeConfig: { commandPrefix: "devtools-agent" },
      capabilities: ["coding"],
      status: "active"
    });

    expect(created.id).toBe("agent_created");
    expect((await service.listAgents()).length).toBe(1);

    const updated = await service.updateAgent(created.id, { status: "paused" });
    expect(updated.status).toBe("paused");

    await service.deleteAgent(created.id);
    expect((await service.listAgents()).length).toBe(0);
  });

  it("queues heartbeat and diagnose jobs", async () => {
    const store = new InMemoryAgentStore([baseAgent()]);
    const scheduler = new InMemoryAgentRuntimeScheduler();
    const service = new AgentService({
      store,
      runtimeScheduler: scheduler
    });

    const heartbeat = await service.runHeartbeat("agent_001", { reason: "ui_manual" });
    const diagnose = await service.diagnoseAgent("agent_001", { reason: "ui_manual" });

    expect(heartbeat.status).toBe("queued");
    expect(diagnose.status).toBe("queued");

    const snapshot = await service.getRuntimeJob(heartbeat.jobId);
    expect(snapshot?.operation).toBe("heartbeat");
    expect(snapshot?.logs[0]).toContain("[queued]");
  });

  it("fails runtime actions for missing agents", async () => {
    const service = new AgentService({
      store: new InMemoryAgentStore(),
      runtimeScheduler: new InMemoryAgentRuntimeScheduler()
    });

    await expect(service.runHeartbeat("missing")).rejects.toThrow("Agent not found");
    await expect(service.diagnoseAgent("missing")).rejects.toThrow("Agent not found");
  });
});
