import type { FastifyInstance } from "fastify";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("API contract", () => {
  let app: FastifyInstance;
  let workerHarness: TestExecutionWorkerHarness;
  let adminToken: string;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";
    process.env.RUNNER_INTERNAL_TOKEN = "runner-secret";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    adminToken = (login.json() as { item: { token: string } }).item.token;
  });

  afterAll(async () => {
    if (workerHarness) {
      await workerHarness.stop();
    }
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
    delete process.env.RUNNER_INTERNAL_TOKEN;
  });

  const authHeaders = (): Record<string, string> => ({
    authorization: `Bearer ${adminToken}`
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
      "/workspaces",
      "/repositories",
      "/roadmap",
      "/tasks",
      "/runs",
      "/approvals",
      "/artifacts",
      "/verification/results",
      "/knowledge",
      "/memory/entries",
      "/retrieval/logs",
      "/experiments",
      "/providers",
      "/providers/config",
      "/agents",
      "/skills/installed",
      "/secrets",
      "/schema-docs",
      "/environments",
      "/machines",
      "/local-repos",
      "/versioning/snapshots",
      "/jobs",
      "/chat/threads"
    ];

    for (const endpoint of endpoints) {
      const response = await app.inject({ method: "GET", url: endpoint, headers: authHeaders() });
      expect(response.statusCode, endpoint).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("items");
      expect(Array.isArray(body.items)).toBe(true);
    }
  });

  it("returns detail resources with stable shape", async () => {
    const project = await app.inject({ method: "GET", url: "/projects/proj_001", headers: authHeaders() });
    expect(project.statusCode).toBe(200);
    expect(project.json().item.id).toBe("proj_001");

    const repository = await app.inject({ method: "GET", url: "/repositories/repo_001", headers: authHeaders() });
    expect(repository.statusCode).toBe(200);
    expect(repository.json().item.id).toBe("repo_001");

    const task = await app.inject({ method: "GET", url: "/tasks/task_001", headers: authHeaders() });
    expect(task.statusCode).toBe(200);
    expect(task.json().item.id).toBe("task_001");

    const run = await app.inject({ method: "GET", url: "/runs/run_001", headers: authHeaders() });
    expect(run.statusCode).toBe(200);
    expect(run.json().item.id).toBe("run_001");
  });

  it("returns enriched jobs and supports agent chat endpoint", async () => {
    const jobs = await app.inject({ method: "GET", url: "/jobs", headers: authHeaders() });
    expect(jobs.statusCode).toBe(200);
    const list = jobs.json() as {
      items: Array<{
        id: string;
        title: string;
        status: string;
        actionRequired: boolean;
        actionType?: string;
        resourceId?: string;
      }>;
    };
    expect(Array.isArray(list.items)).toBe(true);
    expect(list.items[0]).toHaveProperty("actionRequired");

    const chat = await app.inject({
      method: "POST",
      url: "/agent/chat",
      headers: authHeaders(),
      payload: {
        message: "Need input for plan review",
        context: { planId: "plan_001" }
      }
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json()).toHaveProperty("item.response");
  });

  it("returns runtime snapshot for selected job", async () => {
    const listResponse = await app.inject({ method: "GET", url: "/jobs", headers: authHeaders() });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json() as { items: Array<{ id: string }> };
    const firstJobId = listBody.items[0]?.id;
    expect(firstJobId).toBeDefined();

    const runtimeResponse = await app.inject({
      method: "GET",
      url: `/jobs/${firstJobId}/runtime`,
      headers: authHeaders()
    });
    expect(runtimeResponse.statusCode).toBe(200);
    const runtimeBody = runtimeResponse.json() as {
      item: {
        job: { id: string };
        dependencies: unknown[];
        logs: Array<{ timestamp: string; event: string; message: string }>;
      };
    };
    expect(runtimeBody.item.job.id).toBe(firstJobId);
    expect(Array.isArray(runtimeBody.item.dependencies)).toBe(true);
    expect(Array.isArray(runtimeBody.item.logs)).toBe(true);
    expect(runtimeBody.item.logs[0]).toHaveProperty("timestamp");
    expect(runtimeBody.item.logs[0]).toHaveProperty("event");
  });

  it("returns telemetry summary for jobs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/jobs/telemetry?windowMinutes=60",
      headers: authHeaders()
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      item?: {
        totalJobs: number;
        failedJobs: number;
        errorRate: number;
        avgDurationMs: number;
        byProject: Array<{ projectId: string; totalJobs: number }>;
      };
    };
    expect(typeof body.item?.totalJobs).toBe("number");
    expect(typeof body.item?.failedJobs).toBe("number");
    expect(typeof body.item?.errorRate).toBe("number");
    expect(typeof body.item?.avgDurationMs).toBe("number");
    expect(Array.isArray(body.item?.byProject)).toBe(true);
  });

  it("streams run events as SSE", async () => {
    const response = await app.inject({ method: "GET", url: "/runs/run_001/events", headers: authHeaders() });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: queued");
    expect(response.body).toContain("event: complete");
  });
});
