import { describe, expect, it } from "vitest";
import type { Subprompt } from "@cp/domain";
import { BrainstormingService } from "./service.js";

describe("BrainstormingService", () => {
  it("loads subprompts and composes a coherent draft", async () => {
    const subpromptCatalog: Subprompt[] = [
      {
        id: "stack_default",
        title: "Default stack",
        category: "stack",
        summary: "Default stack summary",
        prompt: "Use PostgreSQL and Fastify",
        tags: ["stack", "postgres"],
        sourcePath: "memory://stack_default",
        enabled: true
      },
      {
        id: "arch_monorepo",
        title: "Monorepo",
        category: "architecture",
        summary: "Monorepo layout",
        prompt: "Prefer modular monorepo packages",
        tags: ["architecture"],
        sourcePath: "memory://arch_monorepo",
        enabled: true
      }
    ];

    const service = new BrainstormingService({
      subpromptCatalog: {
        list: async (filters) =>
          subpromptCatalog.filter((item) => {
            if (filters?.category && item.category !== filters.category) return false;
            if (filters?.enabled !== undefined && item.enabled !== filters.enabled) return false;
            return true;
          }),
        get: async (id) => subpromptCatalog.find((item) => item.id === id) ?? null
      },
      requireRegistryPrompt: true,
      resolveRoleInstructions: async (role, context) => {
        if (role !== "planner") return undefined;
        expect(context).toMatchObject({
          type: "role",
          target: "planner"
        });
        return "Plan with explicit registry-governed instructions.";
      }
    });
    const all = await service.listSubprompts();
    expect(all.length).toBe(2);

    const draft = await service.composePlanDraft({
      projectIntent: "Build a control-plane with provider routing",
      selectedSubpromptIds: ["stack_default", "arch_monorepo"],
      guidedAnswers: { scope: "mvp" }
    });

    expect(draft.plan.recommendedStack.database.toLowerCase()).toContain("postgres");
    expect(draft.plan.architecture.repositoryStrategy).toBe("monorepo");
    expect(draft.plan.roadmap.length).toBeGreaterThan(0);
    expect(draft.plan.composedPrompt).toContain("ROLE: planner");
    expect(draft.plan.composedPrompt).toContain("ADDITIONAL CONTEXT (JSON):");
  });
});
