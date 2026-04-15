import { describe, expect, it } from "vitest";
import { buildPrompt } from "./service.js";

describe("PromptBuilderService", () => {
  it("builds a single prompt from role + subprompts + context", async () => {
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
    });

    expect(prompt).toContain("ROLE: planner");
    expect(prompt).toContain("SUBPROMPTS:");
    expect(prompt).toContain("Use Fastify and PostgreSQL.");
    expect(prompt).toContain("ADDITIONAL CONTEXT (JSON):");
  });
});
