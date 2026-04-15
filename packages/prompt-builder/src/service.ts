import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrainstormPlanPayload, Subprompt } from "@cp/domain";

export interface BuildPromptInput {
  role: string;
  subprompts: Subprompt[];
  plan?: BrainstormPlanPayload;
  context?: Record<string, unknown>;
}

export interface PromptBuilderServiceOptions {
  rolesDir?: string;
  roleFallbackInstructions?: string;
}

const defaultRoleFallbackInstructions =
  "Follow project constraints strictly, keep output compact, and produce inspectable structured artifacts.";

const resolveDefaultRolesDir = (): string => {
  const fallback = path.resolve(process.cwd(), "configs/prompts/roles");
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    fallback,
    path.resolve(process.cwd(), "../../configs/prompts/roles"),
    path.resolve(moduleDir, "../../../configs/prompts/roles"),
    path.resolve(moduleDir, "../../../../configs/prompts/roles")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return fallback;
};

const stringifyContext = (value: unknown): string => JSON.stringify(value, null, 2);

const roleCandidates = (role: string): string[] => {
  const trimmed = role.trim().toLowerCase();
  if (!trimmed) return [];
  return [
    `${trimmed}.md`,
    `${trimmed}.prompt.md`,
    `${trimmed.replace(/_/g, "-")}.md`,
    `${trimmed.replace(/_/g, "-")}.prompt.md`
  ];
};

export class PromptBuilderService {
  private readonly rolesDir: string;
  private readonly roleFallbackInstructions: string;

  constructor(options: PromptBuilderServiceOptions = {}) {
    this.rolesDir = options.rolesDir ?? resolveDefaultRolesDir();
    this.roleFallbackInstructions = options.roleFallbackInstructions ?? defaultRoleFallbackInstructions;
  }

  async buildPrompt(input: BuildPromptInput): Promise<string> {
    const role = input.role.trim();
    if (!role) {
      throw new Error("buildPrompt requires a non-empty role");
    }

    const roleInstructions = await this.loadRoleInstructions(role);
    const subpromptSection =
      input.subprompts.length > 0
        ? input.subprompts
            .map(
              (item, index) =>
                `${index + 1}. [${item.category}] ${item.title}\n` +
                `summary: ${item.summary}\n` +
                `prompt: ${item.prompt}`
            )
            .join("\n\n")
        : "No subprompts selected.";

    const sections = [
      `ROLE: ${role}`,
      "",
      "ROLE INSTRUCTIONS:",
      roleInstructions,
      "",
      "SUBPROMPTS:",
      subpromptSection,
      ""
    ];

    if (input.plan) {
      sections.push("PLAN CONTEXT (JSON):", stringifyContext(input.plan), "");
    }

    if (input.context) {
      sections.push("ADDITIONAL CONTEXT (JSON):", stringifyContext(input.context), "");
    }

    sections.push(
      "OUTPUT RULES:",
      "- Keep the response structured and implementation-oriented.",
      "- Do not expand scope outside explicit constraints.",
      "- Preserve inspectability and deterministic verification gates."
    );

    return sections.join("\n");
  }

  private async loadRoleInstructions(role: string): Promise<string> {
    for (const candidate of roleCandidates(role)) {
      const fullPath = path.resolve(this.rolesDir, candidate);
      if (!existsSync(fullPath)) continue;
      const content = (await readFile(fullPath, "utf8")).trim();
      if (content.length > 0) return content;
    }
    return this.roleFallbackInstructions;
  }
}

export const buildPrompt = async (
  input: BuildPromptInput,
  options?: PromptBuilderServiceOptions
): Promise<string> => {
  const service = new PromptBuilderService(options);
  return service.buildPrompt(input);
};
