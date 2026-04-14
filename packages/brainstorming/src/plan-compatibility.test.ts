import { describe, expect, it } from "vitest";
import type { LegacyBrainstormPlan } from "@cp/domain";
import { getBrainstormPlanPayload, normalizeBrainstormPlan } from "@cp/domain";

describe("BrainstormPlan compatibility helpers", () => {
  it("reads canonical nested payload from plan.*", () => {
    const canonical = normalizeBrainstormPlan({
      id: "bp_1",
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

  it("falls back to legacy top-level fields when plan is missing", () => {
    const legacy: LegacyBrainstormPlan = {
      id: "legacy_bp",
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
      architecture: {
        repositoryStrategy: "hybrid",
        packageLayout: ["apps/*", "packages/*"],
        rationale: "legacy format"
      },
      roadmap: [
        {
          id: "legacy_task_1",
          title: "Legacy task",
          description: "Backfill legacy payload",
          dependencies: [],
          targetRepos: ["control-plane"],
          suggestedAgentRole: "planner",
          suggestedSkills: ["checks"]
        }
      ],
      composedPrompt: "legacy prompt",
      selectedSubprompts: ["stack_supabase_small"],
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "legacy",
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: "legacy"
    };

    const payload = getBrainstormPlanPayload(legacy);
    expect(payload.recommendedStack.database).toContain("Supabase");
    expect(payload.architecture.repositoryStrategy).toBe("hybrid");
    expect(payload.roadmap).toHaveLength(1);
    expect(payload.selectedSubprompts[0]?.id).toBe("stack_supabase_small");
  });
});
