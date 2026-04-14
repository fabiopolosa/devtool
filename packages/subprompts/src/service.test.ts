import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SubpromptsService } from "./service.js";

describe("SubpromptsService", () => {
  it("loads filesystem subprompts and composes a merged prompt", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cp-subprompts-"));
    await writeFile(
      path.join(dir, "stack.json"),
      JSON.stringify({
        id: "stack_postgres",
        title: "PostgreSQL stack",
        category: "stack",
        summary: "Use PostgreSQL + Prisma",
        prompt: "Prefer PostgreSQL + Prisma for medium projects.",
        tags: ["postgres", "prisma"],
        enabled: true
      })
    );
    await writeFile(
      path.join(dir, "architecture.yaml"),
      [
        "id: architecture_monorepo",
        "title: Monorepo architecture",
        "category: architecture",
        "summary: Monorepo with clear package boundaries",
        "prompt: Keep apps/* and packages/* with explicit contracts.",
        "tags:",
        "  - monorepo",
        "enabled: true"
      ].join("\n")
    );

    const service = new SubpromptsService({ subpromptsDir: dir });
    const all = await service.list();
    expect(all).toHaveLength(2);
    const filtered = await service.list({ tag: "postgres" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("stack_postgres");

    const composed = await service.compose({
      selectedIds: ["stack_postgres", "architecture_monorepo"],
      additionalInstructions: ["Enforce deterministic verification gates."]
    });
    expect(composed.selectedSubprompts).toHaveLength(2);
    expect(composed.composedPrompt).toContain("Subprompt composition");
    expect(composed.composedPrompt).toContain("PostgreSQL");
  });

  it("fails on invalid category and duplicate ids in development mode", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cp-subprompts-invalid-"));
    await writeFile(
      path.join(dir, "one.json"),
      JSON.stringify({
        id: "dup_id",
        title: "A",
        category: "stack",
        summary: "A",
        prompt: "A",
        tags: [],
        enabled: true
      })
    );
    await writeFile(
      path.join(dir, "two.json"),
      JSON.stringify({
        id: "dup_id",
        title: "B",
        category: "invalid-category",
        summary: "B",
        prompt: "B",
        tags: [],
        enabled: true
      })
    );

    const service = new SubpromptsService({ subpromptsDir: dir });
    await expect(service.list()).rejects.toThrow();
  });
});
