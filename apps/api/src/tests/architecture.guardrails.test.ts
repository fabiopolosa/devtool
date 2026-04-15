import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const sourceRoots = ["apps", "packages", "scripts"].map((segment) => path.join(repoRoot, segment));

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".turbo",
  ".next",
  "artifacts"
]);

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

const isTestFile = (filePath: string): boolean =>
  filePath.includes(`${path.sep}__tests__${path.sep}`) ||
  filePath.endsWith(".test.ts") ||
  filePath.endsWith(".test.tsx") ||
  filePath.endsWith(".spec.ts") ||
  filePath.endsWith(".spec.tsx");

const collectFiles = (root: string): string[] => {
  const output: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredDirectories.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!sourceExtensions.has(path.extname(entry.name))) continue;
      output.push(fullPath);
    }
  }

  return output;
};

const allSourceFiles = sourceRoots.flatMap((root) => collectFiles(root));
const nonTestSourceFiles = allSourceFiles.filter((filePath) => !isTestFile(filePath));

const rel = (filePath: string): string => path.relative(repoRoot, filePath);

const findOffenders = (
  matcher: (content: string, filePath: string) => boolean,
  files = nonTestSourceFiles
): string[] =>
  files
    .filter((filePath) => matcher(readFileSync(filePath, "utf8"), filePath))
    .map((filePath) => rel(filePath));

const isLegacyBrainstormAccess = (content: string): boolean =>
  /\bbrainstormPlan\.(recommendedStack|roadmap|risks)\b/.test(content);

const isForbiddenSubpromptImport = (content: string): boolean =>
  content.includes('from "@cp/subprompts"') || content.includes("from '@cp/subprompts'");

const isForbiddenPromptPattern = (content: string): boolean =>
  /\bcomposePrompt\b/.test(content) ||
  /\bbuildCustomPrompt\b/.test(content) ||
  /\bprompt\s*=/.test(content);

describe("Architecture guardrails", () => {
  it("blocks BrainstormPlan legacy field access (brainstormPlan.*)", () => {
    const offenders = findOffenders((content) => isLegacyBrainstormAccess(content));
    expect(offenders).toEqual([]);
  });

  it("blocks direct @cp/subprompts imports outside prompt-builder", () => {
    const offenders = findOffenders((content, filePath) => {
      if (!isForbiddenSubpromptImport(content)) return false;
      return !filePath.includes(`${path.sep}packages${path.sep}prompt-builder${path.sep}`);
    });
    expect(offenders).toEqual([]);
  });

  it("blocks prompt composition outside packages/prompt-builder", () => {
    const offenders = findOffenders((content, filePath) => {
      if (!isForbiddenPromptPattern(content)) return false;
      return !filePath.includes(`${path.sep}packages${path.sep}prompt-builder${path.sep}`);
    });
    expect(offenders).toEqual([]);
  });

  it("prevents orchestration leakage outside allowed boundaries", () => {
    const allowedSegments = [
      `${path.sep}packages${path.sep}orchestration-ruflo${path.sep}`,
      `${path.sep}apps${path.sep}worker${path.sep}`
    ];
    const orchestratorImportOffenders = findOffenders((content, filePath) => {
      const hasImport =
        content.includes('from "@cp/orchestration-ruflo"') ||
        content.includes("from '@cp/orchestration-ruflo'");
      if (!hasImport) return false;
      return !allowedSegments.some((segment) => filePath.includes(segment));
    });
    expect(orchestratorImportOffenders).toEqual([]);
  });

  it("keeps subprompts package passive and decoupled from providers/plans", () => {
    const subpromptsServicePath = path.join(repoRoot, "packages/subprompts/src/service.ts");
    expect(statSync(subpromptsServicePath).isFile()).toBe(true);
    const content = readFileSync(subpromptsServicePath, "utf8");

    const forbiddenTerms = [
      "@cp/providers",
      "@cp/orchestration-ruflo",
      "ProviderRegistry",
      "RoutingPolicy",
      "brainstormPlan",
      "BrainstormPlan"
    ];

    const hits = forbiddenTerms.filter((term) => content.includes(term));
    expect(hits).toEqual([]);
  });

  it("negative matcher sanity checks", () => {
    expect(isLegacyBrainstormAccess("const x = brainstormPlan.roadmap;")).toBe(true);
    expect(isForbiddenSubpromptImport('import { SubpromptsService } from "@cp/subprompts";')).toBe(
      true
    );
    expect(isForbiddenPromptPattern("const prompt = 'manual';")).toBe(true);
    expect(isForbiddenPromptPattern("const requestText = 'ok';")).toBe(false);
  });
});

describe("Prompt-builder wiring checks", () => {
  it("uses prompt-builder in brainstorming service and avoids manual compose labels", () => {
    const brainstormingServicePath = path.join(repoRoot, "packages/brainstorming/src/service.ts");
    const brainstormingService = readFileSync(brainstormingServicePath, "utf8");
    expect(brainstormingService).toContain("promptBuilderService.buildPrompt(");
    expect(brainstormingService).not.toContain("Subprompt composition:");
  });

  it("exposes subprompt catalog adapters from prompt-builder", () => {
    const promptBuilderSubpromptsPath = path.join(repoRoot, "packages/prompt-builder/src/subprompts.ts");
    expect(statSync(promptBuilderSubpromptsPath).isFile()).toBe(true);
    const content = readFileSync(promptBuilderSubpromptsPath, "utf8");
    expect(content).toContain('from "@cp/subprompts"');
  });
});

describe("Legacy fallback policy", () => {
  it("disallows runtime fallback by keeping canonical-only normalization", () => {
    const brainstormEntityPath = path.join(repoRoot, "packages/domain/src/entities/brainstorm.ts");
    const content = readFileSync(brainstormEntityPath, "utf8");
    expect(content).toContain("Legacy top-level plan fields are not supported");
    expect(content).toContain("Expected brainstormPlan.plan.* structure.");
  });
});

describe("Guardrail hard constraints", () => {
  it("does not allow prompt assignment pattern outside builder scope", () => {
    const offending = findOffenders((content, filePath) => {
      if (!/\bprompt\s*=/.test(content)) return false;
      return !filePath.includes(`${path.sep}packages${path.sep}prompt-builder${path.sep}`);
    });
    expect(offending).toEqual([]);
  });
});
