import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const eslintConfigPath = path.join(repoRoot, "eslint.config.mjs");

const lintSnippet = async (code: string, filePath: string) => {
  const eslint = new ESLint({
    overrideConfigFile: eslintConfigPath,
    cwd: repoRoot,
    ignore: false
  });
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) {
    throw new Error(`ESLint did not return a result for ${filePath}`);
  }
  return result;
};

const collectRuleIds = (result: Awaited<ReturnType<typeof lintSnippet>>): string[] =>
  result.messages.map((message) => message.ruleId).filter((ruleId): ruleId is string => Boolean(ruleId));

describe("ESLint guardrail custom rules", () => {
  it("fails on direct prompt variable outside prompt-builder", async () => {
    const result = await lintSnippet(
      "const prompt = 'manual prompt'; export { prompt };",
      path.join(repoRoot, "packages/providers/src/__fixtures__/violating-prompt.ts")
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expect(collectRuleIds(result)).toContain("cp-guardrails/no-direct-prompt-build");
  });

  it("fails on direct @cp/subprompts import outside prompt-builder", async () => {
    const result = await lintSnippet(
      "import { SubpromptsService } from '@cp/subprompts';\nexport default SubpromptsService;",
      path.join(repoRoot, "apps/api/src/services/__fixtures__/violating-subprompts-import.ts")
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expect(collectRuleIds(result)).toContain("cp-guardrails/no-subprompts-outside-builder");
  });

  it("fails on legacy BrainstormPlan field access", async () => {
    const result = await lintSnippet(
      "const brainstormPlan = { roadmap: [] }; const roadmap = brainstormPlan.roadmap; export { roadmap };",
      path.join(repoRoot, "apps/web/src/__fixtures__/violating-brainstorm-legacy.ts")
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expect(collectRuleIds(result)).toContain("cp-guardrails/no-brainstormplan-legacy");
  });

  it("fails on direct orchestration import outside allowed boundaries", async () => {
    const result = await lintSnippet(
      "import { WorkflowLoader } from '@cp/orchestration-ruflo';\nexport { WorkflowLoader };",
      path.join(repoRoot, "apps/api/src/services/__fixtures__/violating-orchestration-import.ts")
    );
    expect(result.errorCount).toBeGreaterThan(0);
    expect(collectRuleIds(result)).toContain("cp-guardrails/no-orchestration-outside-ruflo");
  });

  it("allows prompt-builder boundary", async () => {
    const result = await lintSnippet(
      "import { SubpromptsService } from '@cp/subprompts';\nconst prompt = `allowed ${1}`;\nexport { SubpromptsService, prompt };",
      path.join(repoRoot, "packages/prompt-builder/src/__fixtures__/allowed-prompt-builder.ts")
    );
    expect(result.errorCount).toBe(0);
  });
});
