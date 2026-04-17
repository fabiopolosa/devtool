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
    const skill = skillsBody.items[0];
    expect(skill).toBeDefined();
    if (!skill) {
      throw new Error("No installed skill available for agent execution contract test");
    }

    const createResponse = await app.inject({
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
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json() as { item: { id: string } };

    const executeResponse = await app.inject({
      method: "POST",
      url: `/agents/${created.item.id}/skills/${skill.id}/execute`,
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

  it("schedules heartbeat and diagnose jobs and exposes snapshots/events", async () => {
    const listResponse = await app.inject({ method: "GET", url: "/agents" });
    const listBody = listResponse.json() as { items: Array<{ id: string }> };
    const agentId = listBody.items[0]?.id;
    expect(agentId).toBeDefined();

    const heartbeat = await app.inject({
      method: "POST",
      url: `/agents/${agentId}/heartbeat`,
      payload: { reason: "contract-test" }
    });
    expect(heartbeat.statusCode).toBe(200);
    const heartbeatBody = heartbeat.json() as { item: { jobId: string; operation: string } };
    expect(heartbeatBody.item.operation).toBe("heartbeat");
    expect(typeof heartbeatBody.item.jobId).toBe("string");

    const diagnose = await app.inject({
      method: "POST",
      url: `/agents/${agentId}/diagnose`,
      payload: { reason: "contract-test" }
    });
    expect(diagnose.statusCode).toBe(200);
    const diagnoseBody = diagnose.json() as { item: { jobId: string; operation: string } };
    expect(diagnoseBody.item.operation).toBe("diagnose");

    const snapshot = await app.inject({
      method: "GET",
      url: `/agents/${agentId}/jobs/${heartbeatBody.item.jobId}`
    });
    expect(snapshot.statusCode).toBe(200);
    const snapshotBody = snapshot.json() as { item: { state: string; logs: string[] } };
    expect(typeof snapshotBody.item.state).toBe("string");
    expect(Array.isArray(snapshotBody.item.logs)).toBe(true);

    const events = await app.inject({
      method: "GET",
      url: `/agents/${agentId}/jobs/${heartbeatBody.item.jobId}/events?snapshot=1`
    });
    expect(events.statusCode).toBe(200);
    expect(events.headers["content-type"]).toContain("text/event-stream");
    expect(events.body).toContain("event: state");
    expect(events.body).toContain("event: complete");
  });
});
