import type { FastifyInstance } from "fastify";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Agents API contract", () => {
  let app: FastifyInstance;
  let workerHarness: TestExecutionWorkerHarness;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.REDIS_URL = "";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();
  });

  afterAll(async () => {
    if (workerHarness) {
      await workerHarness.stop();
    }
    if (app) {
      await app.close();
    }
  });

  it("lists workflow runtime definitions", async () => {
    const response = await app.inject({ method: "GET", url: "/agents/runtime/workflows" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; maxRetries: number }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0]).toHaveProperty("id");
    expect(body.items[0]).toHaveProperty("maxRetries");
  });

  it("supports agents CRUD", async () => {
    const listBefore = await app.inject({ method: "GET", url: "/agents" });
    expect(listBefore.statusCode).toBe(200);
    const listBeforeBody = listBefore.json() as { items: Array<{ id: string }> };
    const baselineCount = listBeforeBody.items.length;

    const createResponse = await app.inject({
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

    const getResponse = await app.inject({
      method: "GET",
      url: `/agents/${created.item.id}`
    });
    expect(getResponse.statusCode).toBe(200);
    const getBody = getResponse.json() as { item: { id: string; name: string } };
    expect(getBody.item.id).toBe(created.item.id);

    const updateResponse = await app.inject({
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

    const listAfter = await app.inject({ method: "GET", url: "/agents" });
    const listAfterBody = listAfter.json() as { items: Array<{ id: string }> };
    expect(listAfterBody.items.length).toBe(baselineCount + 1);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/agents/${created.item.id}`
    });
    expect(deleteResponse.statusCode).toBe(200);
  });

  it("executes assigned skill via agent runtime", async () => {
    const skillsResponse = await app.inject({ method: "GET", url: "/skills/installed" });
    expect(skillsResponse.statusCode).toBe(200);
    const skillsBody = skillsResponse.json() as { items: Array<{ id: string; name: string }> };
    let skill = skillsBody.items[0];
    if (!skill) {
      const uploadResponse = await app.inject({
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
      const skillResponse = await app.inject({ method: "GET", url: "/skills/installed" });
      expect(skillResponse.statusCode).toBe(200);
      const refreshed = skillResponse.json() as { items: Array<{ id: string; name: string }> };
      skill = refreshed.items.find((entry) => entry.id === uploadBody.item?.id);
    }
    expect(skill).toBeDefined();
    if (!skill) {
      throw new Error("Unable to prepare a skill for agent execution contract test");
    }

    const agentResponse = await app.inject({
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

    const executeResponse = await app.inject({
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
    const installResponse = await app.inject({
      method: "POST",
      url: "/skills/install-upload",
      headers: { "x-tenant-id": "tenant_default" },
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

    const agentResponse = await app.inject({
      method: "POST",
      url: "/agents",
      headers: { "x-tenant-id": "tenant_other" },
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

    const executeResponse = await app.inject({
      method: "POST",
      url: `/agents/${agent.item.id}/skills/${installBody.item.id}/execute`,
      headers: { "x-tenant-id": "tenant_other" },
      payload: {
        mode: "local"
      }
    });

    expect(executeResponse.statusCode).toBe(404);
  });

  it("returns explicit scheduler errors for runtime job paths", async () => {
    const agentResponse = await app.inject({
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

    const snapshot = await app.inject({
      method: "GET",
      url: `/agents/${agentId}/jobs/runtime-job-1`
    });
    expect(snapshot.statusCode).toBe(503);
    expect((snapshot.json() as { error?: string }).error).toBe("scheduler_unavailable");

    const events = await app.inject({
      method: "GET",
      url: `/agents/${agentId}/jobs/runtime-job-1/events?snapshot=1`
    });
    expect(events.statusCode).toBe(503);
    const eventsBody = events.json() as { error?: string; message?: string };
    expect(eventsBody.error).toBe("scheduler_unavailable");
  });
});
