import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { runWithTenantContext } from "@cp/db";
import { auditLogService } from "../services/audit-log-service.js";
import { usageService } from "../services/usage-service.js";

const buildTestApp = async () => {
  const { buildApp: createApp } = await import("../app.js");
  const app = await createApp();
  return { app };
};

describe("audit and usage routes", () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";
    process.env.DEVTOOLS_API_KEY = "audit-contract-api-key";
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    delete process.env.AUTH_ENABLED;
    delete process.env.DEVTOOLS_API_KEY;
  });

  it("returns audit events with filters and summary", async () => {
    const built = await buildTestApp();
    app = built.app;

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@control-plane.local",
        password: "viewer123!"
      }
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().item.token as string;

    await runWithTenantContext({ tenantId: "tenant_default" }, async () => {
      await auditLogService.record({
        tenantId: "tenant_default",
        projectId: "project_routes",
        jobId: "job_routes",
        action: "job.start",
        resourceType: "job",
        resourceId: "job_routes",
        status: "success",
        actor: "runner"
      });
      await auditLogService.record({
        tenantId: "tenant_default",
        projectId: "project_routes",
        jobId: "job_routes",
        action: "job.end",
        resourceType: "job",
        resourceId: "job_routes",
        status: "success",
        actor: "runner"
      });
    });

    const authHeaders = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant_default"
    };
    const response = await app.inject({
      method: "GET",
      url: "/audit?projectId=project_routes&jobId=job_routes",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ action: string; tenantId?: string }>;
      summary: { total: number; byAction: Array<{ action: string }> };
    };
    expect(body.items).toHaveLength(2);
    expect(body.items.every((item) => item.tenantId === "tenant_default")).toBe(true);
    expect(body.summary.total).toBe(2);
    expect(body.summary.byAction.map((item) => item.action)).toEqual(["job.end", "job.start"]);

  });

  it("returns usage events with aggregated summary", async () => {
    const built = await buildTestApp();
    app = built.app;

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "viewer@control-plane.local",
        password: "viewer123!"
      }
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().item.token as string;

    await runWithTenantContext({ tenantId: "tenant_default" }, async () => {
      await usageService.record({
        tenantId: "tenant_default",
        projectId: "project_usage_routes",
        jobId: "job_usage_routes",
        provider: "openai",
        model: "gpt-5",
        inputTokens: 120,
        outputTokens: 80,
        cost: 0.006,
        metadata: { capability: "coding" },
        actor: "runner"
      });
    });

    const authHeaders = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant_default"
    };
    const response = await app.inject({
      method: "GET",
      url: "/usage?projectId=project_usage_routes",
      headers: authHeaders
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ provider: string; model: string }>;
      summary: { totalCount: number; totalCost: number; byProvider: Array<{ key: string }> };
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.provider).toBe("openai");
    expect(body.summary.totalCount).toBe(1);
    expect(body.summary.totalCost).toBeCloseTo(0.006, 6);
    expect(body.summary.byProvider.map((item) => item.key)).toEqual(["openai"]);

  });
});
