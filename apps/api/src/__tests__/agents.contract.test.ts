import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Agents API contract", () => {
  type InjectRequestOptions = InjectOptions;
  type InjectResponse = LightMyRequestResponse;

  let app: FastifyInstance;
  let workerHarness: TestExecutionWorkerHarness;
  let adminHeaders: Record<string, string>;
  let otherTenantHeaders: Record<string, string>;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.REDIS_URL = "";
    process.env.AUTH_ENABLED = "1";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();

    const { apiStore } = await import("../services/api-store.js");
    const now = new Date().toISOString();
    if (!await apiStore.getTenant("tenant_other")) {
      await apiStore.createTenant({
        id: "tenant_other",
        name: "Tenant Other",
        createdAt: now
      });
    }
    if ((await apiStore.listUserTenants({ userId: "user_admin_001", tenantId: "tenant_other" })).length === 0) {
      await apiStore.createUserTenant({
        id: "user_tenant_admin_other",
        userId: "user_admin_001",
        tenantId: "tenant_other",
        role: "owner",
        createdAt: now
      });
    }

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { item: { token: string } }).item.token;
    adminHeaders = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant_default"
    };
    otherTenantHeaders = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant_other"
    };
  });

  afterAll(async () => {
    if (workerHarness) {
      await workerHarness.stop();
    }
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
  });

  const inject = (options: InjectRequestOptions): Promise<InjectResponse> =>
    app.inject({
      ...options,
      headers: {
        ...adminHeaders,
        ...(options.headers ?? {})
      }
    });

  it("lists workflow runtime definitions", async () => {
    const response = await inject({ method: "GET", url: "/agents/runtime/workflows" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; maxRetries: number }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty("id");
    expect(body.items[0]).toHaveProperty("maxRetries");
  });

  it("supports agents CRUD", async () => {
    const listBefore = await inject({ method: "GET", url: "/agents" });
    expect(listBefore.statusCode).toBe(200);
    const listBeforeBody = listBefore.json() as { items: Array<{ id: string }> };
    const baselineCount = listBeforeBody.items.length;

    const createResponse = await inject({
      method: "POST",
      url: "/agents",
      payload: {
        name: "runtime-debugger",
        role: "claude_debugger",
        icon: "stethoscope",
        description: "Runtime diagnostics agent",
        adapterType: "legacy_cli",
        desiredSkills: ["checks"],
        reportTo: "planner",
        runtimeConfig: {
          commandPrefix: "devtools-agent",
          timeoutMs: 15000
        },
        capabilities: ["chat_reasoning", "coding"],
        status: "active"
      }
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json() as { item: { id: string; name: string; status: string } };
    expect(created.item.name).toBe("runtime-debugger");
    expect(created.item.status).toBe("active");

    const getResponse = await inject({
      method: "GET",
      url: `/agents/${created.item.id}`
    });
    expect(getResponse.statusCode).toBe(200);
    const getBody = getResponse.json() as { item: { id: string; name: string } };
    expect(getBody.item.id).toBe(created.item.id);

    const updateResponse = await inject({
      method: "PUT",
      url: `/agents/${created.item.id}`,
      payload: {
        description: "Updated diagnostics profile",
        status: "degraded"
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    const updated = updateResponse.json() as { item: { description: string; status: string } };
    expect(updated.item.description).toContain("Updated");
    expect(updated.item.status).toBe("degraded");

    const listAfter = await inject({ method: "GET", url: "/agents" });
    const listAfterBody = listAfter.json() as { items: Array<{ id: string }> };
    expect(listAfterBody.items.length).toBe(baselineCount + 1);

    const deleteResponse = await inject({
      method: "DELETE",
      url: `/agents/${created.item.id}`
    });
    expect(deleteResponse.statusCode).toBe(200);
  });

  it("accepts runtime profiles and dispatches manual and scheduled heartbeats", async () => {
    const createResponse = await inject({
      method: "POST",
      url: "/agents",
      payload: {
        name: "heartbeat-managed-agent",
        role: "worker",
        icon: "heart",
        description: "Managed through runtime profiles and heartbeat policies",
        adapterType: "mcp_runtime",
        desiredSkills: ["checks"],
        runtimeConfig: {
          commandPrefix: "devtools-agent"
        },
        runtimeProfile: {
          runtimeKind: "mcp_bridge",
          vendor: "openai_codex",
          host: "local_worker",
          launchMode: "queued",
          args: ["--workspace", "/Users/andromeda/devtool"],
          mcpServerRef: "mcp_connection_001",
          metadata: {
            source: "contract-test"
          }
        },
        heartbeatPolicy: {
          interval: "1m",
          triggers: ["manual", "on_startup"],
          enabled: true,
          metadata: {}
        },
        capabilities: ["coding"],
        status: "active"
      }
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json() as {
      item: {
        id: string;
        runtimeProfile?: { runtimeKind?: string; vendor?: string };
      };
    };
    expect(created.item.runtimeProfile?.runtimeKind).toBe("mcp_bridge");
    expect(created.item.runtimeProfile?.vendor).toBe("openai_codex");

    const manualHeartbeat = await inject({
      method: "POST",
      url: `/agents/${created.item.id}/heartbeat`,
      payload: {
        reason: "manual_check"
      }
    });
    expect(manualHeartbeat.statusCode).toBe(503);
    const manualHeartbeatBody = manualHeartbeat.json() as {
      error?: string;
      message?: string;
    };
    expect(manualHeartbeatBody.error).toBe("scheduler_unavailable");
    expect(manualHeartbeatBody.message).toContain("REDIS_URL");

    const scheduledTick = await inject({
      method: "POST",
      url: "/agents/heartbeat/tick",
      payload: {
        trigger: "on_startup",
        reason: "scheduled_tick"
      }
    });
    expect(scheduledTick.statusCode).toBe(200);
    const scheduledTickBody = scheduledTick.json() as {
      item?: {
        items?: Array<{ agentId: string; status: string; reason?: string }>;
      };
    };
    expect(
      scheduledTickBody.item?.items?.some(
        (entry) => entry.agentId === created.item.id && entry.status === "error"
      )
    ).toBe(true);
  });

  it("executes assigned skill via agent runtime", async () => {
    const skillsResponse = await inject({ method: "GET", url: "/skills/installed" });
    expect(skillsResponse.statusCode).toBe(200);
    const skillsBody = skillsResponse.json() as { items: Array<{ id: string; name: string }> };
    let skill = skillsBody.items[0];
    if (!skill) {
      const uploadResponse = await inject({
        method: "POST",
        url: "/skills/install-upload",
        payload: {
          name: "agent-runner-skill",
          sourceType: "file",
          fileName: "agent-runner-skill.txt",
          contentBase64: Buffer.from("skill: agent runner\nentry: execute").toString("base64"),
          instructions: "Execute a simple skill for agent runtime contract coverage."
        }
      });
      expect(uploadResponse.statusCode).toBe(200);
      const uploadBody = uploadResponse.json() as { item?: { id: string } };
      expect(uploadBody.item?.id).toBeDefined();
      const skillResponse = await inject({ method: "GET", url: "/skills/installed" });
      expect(skillResponse.statusCode).toBe(200);
      const refreshed = skillResponse.json() as { items: Array<{ id: string; name: string }> };
      skill = refreshed.items.find((entry) => entry.id === uploadBody.item?.id);
    }
    expect(skill).toBeDefined();
    if (!skill) {
      throw new Error("Unable to prepare a skill for agent execution contract test");
    }

    const agentResponse = await inject({
      method: "POST",
      url: "/agents",
      payload: {
        name: "skill-runner",
        role: "worker",
        icon: "bolt",
        description: "Executes assigned skills",
        adapterType: "legacy_cli",
        desiredSkills: [skill.id],
        reportTo: "planner",
        runtimeConfig: {},
        capabilities: ["coding"],
        status: "active"
      }
    });
    expect(agentResponse.statusCode).toBe(200);
    const createdAgent = agentResponse.json() as { item: { id: string } };

    const executeResponse = await inject({
      method: "POST",
      url: `/agents/${createdAgent.item.id}/skills/${skill.id}/execute`,
      payload: {
        mode: "local"
      }
    });
    expect(executeResponse.statusCode).toBe(200);
    const executeBody = executeResponse.json() as {
      jobId: string;
      status: string;
      item?: { success?: boolean };
    };
    expect(typeof executeBody.jobId).toBe("string");
    expect(executeBody.status).toBe("done");
    expect(executeBody.item?.success).toBe(true);
  });

  it("blocks agent runtime skill execution across tenants", async () => {
    const installResponse = await inject({
      method: "POST",
      url: "/skills/install-upload",
      payload: {
        name: "agent-cross-tenant-skill",
        sourceType: "file",
        fileName: "agent-cross-tenant-skill.txt",
        contentBase64: Buffer.from("skill: agent cross tenant").toString("base64"),
        instructions: "Tenant isolated skill for agent runtime cross-tenant checks."
      }
    });
    expect(installResponse.statusCode).toBe(200);
    const installBody = installResponse.json() as { item: { id: string } };

    const agentResponse = await inject({
      method: "POST",
      url: "/agents",
      headers: otherTenantHeaders,
      payload: {
        name: "tenant-other-agent",
        role: "worker",
        icon: "bolt",
        description: "Executes assigned skills",
        adapterType: "legacy_cli",
        desiredSkills: [installBody.item.id],
        reportTo: "planner",
        runtimeConfig: {},
        capabilities: ["coding"],
        status: "active"
      }
    });
    expect(agentResponse.statusCode).toBe(200);
    const agent = agentResponse.json() as { item: { id: string } };

    const executeResponse = await inject({
      method: "POST",
      url: `/agents/${agent.item.id}/skills/${installBody.item.id}/execute`,
      headers: otherTenantHeaders,
      payload: {
        mode: "local"
      }
    });

    expect(executeResponse.statusCode).toBe(404);
  });

  it("returns explicit scheduler errors for runtime job paths", async () => {
    const agentResponse = await inject({
      method: "POST",
      url: "/agents",
      payload: {
        name: "runtime-scheduler-check",
        role: "worker",
        icon: "gear",
        description: "Checks runtime scheduler availability",
        adapterType: "legacy_cli",
        desiredSkills: [],
        runtimeConfig: {},
        capabilities: ["coding"],
        status: "active"
      }
    });
    expect(agentResponse.statusCode).toBe(200);
    const agentId = (agentResponse.json() as { item: { id: string } }).item.id;

    const snapshot = await inject({
      method: "GET",
      url: `/agents/${agentId}/jobs/runtime-job-1`
    });
    expect(snapshot.statusCode).toBe(503);
    expect((snapshot.json() as { error?: string }).error).toBe("scheduler_unavailable");

    const events = await inject({
      method: "GET",
      url: `/agents/${agentId}/jobs/runtime-job-1/events?snapshot=1`
    });
    expect(events.statusCode).toBe(503);
    const eventsBody = events.json() as { error?: string; message?: string };
    expect(eventsBody.error).toBe("scheduler_unavailable");
  });
});
