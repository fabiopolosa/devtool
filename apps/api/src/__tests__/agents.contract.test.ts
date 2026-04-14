import type { FastifyInstance } from "fastify";

describe("Agents API contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.REDIS_URL = "";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
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
        adapterType: "paperclip_cli",
        desiredSkills: ["checks"],
        reportTo: "planner",
        runtimeConfig: {
          commandPrefix: "paperclipai",
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
