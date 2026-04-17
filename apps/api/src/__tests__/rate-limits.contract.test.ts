import type { FastifyInstance } from "fastify";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Execution rate limits", () => {
  let app: FastifyInstance;
  let workerHarness: TestExecutionWorkerHarness;
  let headers: Record<string, string>;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";
    process.env.JOB_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.JOB_RATE_LIMIT_PER_TENANT = "1";
    process.env.JOB_RATE_LIMIT_PER_USER = "1";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { item: { token: string } }).item.token;
    headers = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant_default"
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
    delete process.env.JOB_RATE_LIMIT_WINDOW_MS;
    delete process.env.JOB_RATE_LIMIT_PER_TENANT;
    delete process.env.JOB_RATE_LIMIT_PER_USER;
  });

  it("returns 429 when user/tenant execution limit is exceeded", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/projects/proj_001/coding-workflows",
      payload: {
        title: "rate limit baseline",
        request: "Create baseline coding workflow for rate limit test.",
        mode: "local"
      },
      headers
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/projects/proj_001/coding-workflows",
      payload: {
        title: "rate limit exceeded",
        request: "Second workflow should be rejected by execution rate limit.",
        mode: "local"
      },
      headers
    });
    expect(second.statusCode).toBe(429);
    const body = second.json() as { message?: string };
    expect(body.message).toContain("rate limit");
  });
});
