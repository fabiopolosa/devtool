import { describe, expect, it } from "vitest";
import { InMemoryDatabase, runWithTenantContext } from "@cp/db";
import { AuditLogService } from "../services/audit-log-service.js";
import { UsageService } from "../services/usage-service.js";

describe("audit and usage services", () => {
  it("records audit events with tenant/project/job scope and summarizes actions", async () => {
    const db = new InMemoryDatabase();
    const service = new AuditLogService(db.repository("audit_events"));

    await runWithTenantContext({ tenantId: "tenant_a" }, async () => {
      await service.record({
        tenantId: "tenant_a",
        projectId: "project_a",
        jobId: "job_a",
        action: "job.start",
        resourceType: "job",
        resourceId: "job_a",
        status: "success",
        actor: "runner"
      });
      await service.record({
        tenantId: "tenant_a",
        projectId: "project_a",
        jobId: "job_a",
        action: "job.error",
        resourceType: "job",
        resourceId: "job_a",
        status: "failure",
        actor: "runner"
      });
    });

    const items = await service.list({ tenantId: "tenant_a", projectId: "project_a", jobId: "job_a" });
    const summary = await service.summary({ tenantId: "tenant_a", projectId: "project_a", jobId: "job_a" });

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.tenantId === "tenant_a")).toBe(true);
    expect(summary.total).toBe(2);
    expect(summary.success).toBe(1);
    expect(summary.failure).toBe(1);
    expect(summary.byAction.map((item) => item.action)).toEqual(["job.error", "job.start"]);
  });

  it("records usage events and aggregates totals by provider/model", async () => {
    const db = new InMemoryDatabase();
    const service = new UsageService(db.repository("usage_events"));
    const tenantId = "tenant_usage";

    await runWithTenantContext({ tenantId }, async () => {
      await service.record({
        tenantId,
        projectId: "project_usage",
        jobId: "job_usage_1",
        provider: "openai",
        model: "gpt-5",
        inputTokens: 1000,
        outputTokens: 500,
        cost: 0.03,
        metadata: { capability: "coding" },
        actor: "runner"
      });
      await service.record({
        tenantId,
        projectId: "project_usage",
        jobId: "job_usage_2",
        provider: "openai",
        model: "gpt-5",
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.006,
        metadata: { capability: "coding" },
        actor: "runner"
      });
      await service.record({
        tenantId,
        projectId: "project_usage",
        jobId: "job_usage_3",
        provider: "anthropic",
        model: "claude-4",
        inputTokens: 400,
        outputTokens: 100,
        cost: 0.01,
        metadata: { capability: "chat_reasoning" },
        actor: "runner"
      });
    });

    const items = await service.list({ tenantId, projectId: "project_usage" });
    const summary = await service.summary({ tenantId, projectId: "project_usage" });

    expect(items).toHaveLength(3);
    expect(summary.totalCount).toBe(3);
    expect(summary.totalCost).toBeCloseTo(0.046, 6);
    expect(summary.totalInputTokens).toBe(1600);
    expect(summary.totalOutputTokens).toBe(700);
    expect(summary.byProvider[0]?.key).toBe("openai");
    expect(summary.byModel.some((item) => item.key === "gpt-5")).toBe(true);
  });
});
