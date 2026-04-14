import type { FastifyInstance } from "fastify";

describe("API contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("serves health and root metadata", async () => {
    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.json()).toMatchObject({ service: "ai-control-plane-api", status: "ok" });

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    const body = health.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.providerHealthchecks)).toBe(true);
  });

  it("returns list contracts for core resources", async () => {
    const endpoints = [
      "/projects",
      "/repositories",
      "/roadmap",
      "/tasks",
      "/runs",
      "/approvals",
      "/artifacts",
      "/verification/results",
      "/memory/entries",
      "/retrieval/logs",
      "/experiments",
      "/providers",
      "/agents",
      "/skills/installed",
      "/secrets",
      "/schema-docs",
      "/environments",
      "/machines",
      "/local-repos",
      "/versioning/snapshots",
      "/chat/threads"
    ];

    for (const endpoint of endpoints) {
      const response = await app.inject({ method: "GET", url: endpoint });
      expect(response.statusCode, endpoint).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("items");
      expect(Array.isArray(body.items)).toBe(true);
    }
  });

  it("returns detail resources with stable shape", async () => {
    const project = await app.inject({ method: "GET", url: "/projects/proj_001" });
    expect(project.statusCode).toBe(200);
    expect(project.json().item.id).toBe("proj_001");

    const repository = await app.inject({ method: "GET", url: "/repositories/repo_001" });
    expect(repository.statusCode).toBe(200);
    expect(repository.json().item.id).toBe("repo_001");

    const task = await app.inject({ method: "GET", url: "/tasks/task_001" });
    expect(task.statusCode).toBe(200);
    expect(task.json().item.id).toBe("task_001");

    const run = await app.inject({ method: "GET", url: "/runs/run_001" });
    expect(run.statusCode).toBe(200);
    expect(run.json().item.id).toBe("run_001");
  });

  it("streams run events as SSE", async () => {
    const response = await app.inject({ method: "GET", url: "/runs/run_001/events" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: queued");
    expect(response.body).toContain("event: complete");
  });
});
