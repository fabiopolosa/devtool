import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { InMemoryDatabase, runWithTenantContext } from "@cp/db";
import { AuditLogService } from "../services/audit-log-service.js";
import { UsageService } from "../services/usage-service.js";
import { createAuditRoutes } from "../routes/audit.js";
import { createUsageRoutes } from "../routes/usage.js";

const buildApp = async () => {
  const db = new InMemoryDatabase();
  const auditService = new AuditLogService(db.repository("audit_events"));
  const usageService = new UsageService(db.repository("usage_events"));
  const app = Fastify({ logger: false });
  await app.register(createAuditRoutes(auditService));
  await app.register(createUsageRoutes(usageService));
  return { app, auditService, usageService };
};

describe("audit and usage routes", () => {
  it("returns audit events with filters and summary", async () => {
    const { app, auditService } = await buildApp();

    await runWithTenantContext({ tenantId: "tenant_routes" }, async () => {
      await auditService.record({
        tenantId: "tenant_routes",
        projectId: "project_routes",
        jobId: "job_routes",
        action: "job.start",
        resourceType: "job",
        resourceId: "job_routes",
        status: "success",
        actor: "runner"
      });
      await auditService.record({
        tenantId: "tenant_routes",
        projectId: "project_routes",
        jobId: "job_routes",
        action: "job.end",
        resourceType: "job",
        resourceId: "job_routes",
        status: "success",
        actor: "runner"
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/audit?projectId=project_routes&jobId=job_routes",
      headers: { "x-tenant-id": "tenant_routes" }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ action: string; tenantId?: string }>;
      summary: { total: number; byAction: Array<{ action: string }> };
    };
    expect(body.items).toHaveLength(2);
    expect(body.items.every((item) => item.tenantId === "tenant_routes")).toBe(true);
    expect(body.summary.total).toBe(2);
    expect(body.summary.byAction.map((item) => item.action)).toEqual(["job.end", "job.start"]);

    await app.close();
  });

  it("returns usage events with aggregated summary", async () => {
    const { app, usageService } = await buildApp();

    await runWithTenantContext({ tenantId: "tenant_usage_routes" }, async () => {
      await usageService.record({
        tenantId: "tenant_usage_routes",
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

    const response = await app.inject({
      method: "GET",
      url: "/usage?projectId=project_usage_routes",
      headers: { "x-tenant-id": "tenant_usage_routes" }
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

    await app.close();
  });
});
