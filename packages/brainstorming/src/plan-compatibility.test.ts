import { describe, expect, it } from "vitest";
import { getBrainstormPlanPayload, normalizeBrainstormPlan } from "@cp/domain";

describe("BrainstormPlan canonical contract", () => {
  it("reads canonical nested payload from plan.*", () => {
    const canonical = normalizeBrainstormPlan({
      id: "bp_1",
      tenantId: "tenant_default",
      sessionId: "bs_1",
      title: "Plan",
      executiveSummary: "Summary",
      plan: {
        recommendedStack: {
          database: "PostgreSQL",
          backend: "Fastify",
          frontend: "React",
          llmProviders: ["openai"],
          vectorStore: "pgvector"
        },
        architecture: {
          repositoryStrategy: "monorepo",
          packageLayout: ["apps/api", "apps/web"],
          rationale: "shared contracts"
        },
        suggestedAgents: [],
        suggestedSkills: [],
        providerBindings: [],
        roadmap: [],
        assumptions: [],
        risks: [],
        composedPrompt: "prompt",
        selectedSubprompts: []
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "test",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "test"
    });

    const plan = getBrainstormPlanPayload(canonical);
    expect(plan.recommendedStack.database).toBe("PostgreSQL");
    expect(plan.architecture.repositoryStrategy).toBe("monorepo");
  });

  it("throws when legacy top-level plan fields are provided", () => {
    expect(() =>
      getBrainstormPlanPayload({
        id: "legacy_bp",
        tenantId: "tenant_default",
        sessionId: "legacy_bs",
        title: "Legacy plan",
        executiveSummary: "Legacy summary",
        recommendedStack: {
          database: "Supabase PostgreSQL",
          backend: "Fastify",
          frontend: "React",
          llmProviders: ["gemini"],
          vectorStore: "pgvector"
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "legacy",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "legacy"
      })
    ).toThrow(/Legacy top-level plan fields are not supported/);
  });

  it("throws when canonical plan payload is missing", () => {
    expect(() =>
      getBrainstormPlanPayload({
        id: "missing_plan_bp",
        tenantId: "tenant_default",
        sessionId: "missing_plan_bs",
        title: "Missing plan payload",
        executiveSummary: "Missing plan summary",
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "test",
        updatedAt: "2026-01-01T00:00:00.000Z",
        updatedBy: "test"
      })
    ).toThrow(/Invalid or missing canonical plan payload/);
  });
});
