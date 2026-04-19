import type { AgentConfig } from "@cp/domain";
import {
  AgentService,
  AgentRuntimeProfileValidationError,
  InMemoryAgentRuntimeScheduler,
  UnavailableAgentRuntimeScheduler,
  type AgentConfigStore
} from "./service.js";

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

  it("normalizes runtime profiles and heartbeat policies on create and read", async () => {
    const store = new InMemoryAgentStore([baseAgent()]);
    const service = new AgentService({
      store,
      runtimeScheduler: new InMemoryAgentRuntimeScheduler()
    });

    const listed = await service.listAgents();
    expect(listed[0]?.runtimeProfile?.runtimeKind).toBe("legacy_command");
    expect(listed[0]?.heartbeatPolicy?.interval).toBe("manual");

    const created = await service.createAgent({
      name: "runtime-agent",
      role: "codex_builder",
      icon: "⚙️",
      description: "Runtime managed agent",
      adapterType: "mcp_runtime",
      desiredSkills: ["checks"],
      runtimeConfig: {
        commandPrefix: "devtools-agent",
        cwd: "/Users/andromeda/devtool"
      },
      runtimeProfile: {
        runtimeKind: "mcp_bridge",
        vendor: "openai_codex",
        host: "local_worker",
        launchMode: "queued",
        args: ["--workspace", "/Users/andromeda/devtool"],
        mcpServerRef: "mcp_connection_001",
        metadata: {
          promptSource: "registry"
        }
      },
      heartbeatPolicy: {
        interval: "5m",
        triggers: ["manual", "after_failure"],
        enabled: true,
        metadata: {
          lastHeartbeatAt: "2026-04-14T12:00:00.000Z"
        }
      },
      capabilities: ["coding"],
      status: "active"
    });

    expect(created.runtimeProfile?.runtimeKind).toBe("mcp_bridge");
    expect(created.runtimeProfile?.vendor).toBe("openai_codex");
    expect(created.heartbeatPolicy?.interval).toBe("5m");
    expect(created.heartbeatPolicy?.triggers).toContain("after_failure");
  });

  it("falls back safely for legacy adapter types outside the current enum", async () => {
    const store = new InMemoryAgentStore([
      baseAgent({
        adapterType: "paperclip_cli" as AgentConfig["adapterType"],
        runtimeProfile: {}
      })
    ]);
    const service = new AgentService({
      store,
      runtimeScheduler: new InMemoryAgentRuntimeScheduler()
    });

    const listed = await service.listAgents();
    expect(listed[0]?.adapterType).toBe("custom_cli");
    expect(listed[0]?.runtimeProfile?.runtimeKind).toBe("custom_command");
    expect(listed[0]?.runtimeProfile?.vendor).toBe("generic_cli");
  });

  it("rejects invalid runtime profile combinations", async () => {
    const service = new AgentService({
      store: new InMemoryAgentStore(),
      runtimeScheduler: new InMemoryAgentRuntimeScheduler()
    });

    await expect(
      service.createAgent({
        name: "bad-runtime",
        role: "codex_builder",
        icon: "⚙️",
        description: "Bad runtime profile",
        adapterType: "legacy_cli",
        desiredSkills: [],
        runtimeConfig: {},
        runtimeProfile: {
          runtimeKind: "server_api",
          vendor: "generic_api",
          host: "local_worker",
          launchMode: "queued",
          args: [],
          apiConfigRef: "provider_001",
          metadata: {}
        },
        capabilities: ["coding"],
        status: "active"
      })
    ).rejects.toBeInstanceOf(AgentRuntimeProfileValidationError);
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

  it("fails explicitly when the runtime scheduler is unavailable", async () => {
    const service = new AgentService({
      store: new InMemoryAgentStore([baseAgent()]),
      runtimeScheduler: new UnavailableAgentRuntimeScheduler()
    });

    await expect(service.runHeartbeat("agent_001")).rejects.toThrow(
      "Agent runtime scheduler requires REDIS_URL"
    );
  });
});
