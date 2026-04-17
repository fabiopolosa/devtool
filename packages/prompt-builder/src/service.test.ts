import { describe, expect, it } from "vitest";
import { buildPrompt } from "./service.js";

describe("PromptBuilderService", () => {
  it("builds a single prompt from role + subprompts + context when registry instructions are provided", async () => {
    const prompt = await buildPrompt({
      role: "planner",
      subprompts: [
        {
          id: "stack.fastify-postgres",
          title: "Fastify + PostgreSQL",
          category: "stack",
          summary: "Backend/API stack",
          prompt: "Use Fastify and PostgreSQL.",
          tags: ["backend"],
          sourcePath: "configs/subprompts/stack-postgres-prisma.json",
          enabled: true
        }
      ],
      context: {
        projectIntent: "Build a control plane",
        constraints: ["additive routes"]
      }
    }, {
      resolveRoleInstructions: async (role) =>
        role === "planner" ? "Use registry-backed instructions only." : undefined
    });

    expect(prompt).toContain("ROLE: planner");
    expect(prompt).toContain("SUBPROMPTS:");
    expect(prompt).toContain("Use Fastify and PostgreSQL.");
    expect(prompt).toContain("ADDITIONAL CONTEXT (JSON):");
    expect(prompt).toContain("Use registry-backed instructions only.");
  });

  it("fails closed when no registry instructions are available", async () => {
    await expect(
      buildPrompt({
        role: "planner",
        subprompts: [],
        context: {}
      })
    ).rejects.toThrow('Prompt registry resolver is required for role "planner"');
  });
});
