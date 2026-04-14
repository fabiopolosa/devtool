import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BrainstormingService } from "./service.js";

describe("BrainstormingService", () => {
  it("loads subprompts and composes a coherent draft", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "brainstorming-subprompts-"));
    await writeFile(
      path.join(dir, "stack.json"),
      JSON.stringify({
        id: "stack_default",
        title: "Default stack",
        category: "stack",
        summary: "Default stack summary",
        prompt: "Use PostgreSQL and Fastify",
        tags: ["stack", "postgres"],
        enabled: true
      })
    );
    await writeFile(
      path.join(dir, "architecture.yaml"),
      [
        "id: arch_monorepo",
        "title: Monorepo",
        "category: architecture",
        "summary: Monorepo layout",
        "prompt: Prefer modular monorepo packages",
        "tags:",
        "  - architecture",
        "enabled: true"
      ].join("\n")
    );

    const service = new BrainstormingService({ subpromptsDir: dir });
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
    expect(draft.plan.composedPrompt).toContain("User intent");
  });
});
