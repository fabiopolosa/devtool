import type { BrainstormPlanPayload, Subprompt } from "@cp/domain";

export interface BuildPromptInput {
  role: string;
  subprompts: Subprompt[];
  plan?: BrainstormPlanPayload;
  context?: Record<string, unknown>;
  registryContext?: {
    tenantId?: string;
    projectId?: string;
    type?: string;
    target?: string;
  };
}

export interface PromptBuilderServiceOptions {
  rolesDir?: string;
  roleFallbackInstructions?: string;
  disableRoleFileFallback?: boolean;
  requireRegistryPrompt?: boolean;
  resolveRoleInstructions?: (
    role: string,
    context?: BuildPromptInput["registryContext"]
  ) => Promise<string | undefined> | string | undefined;
}

const stringifyContext = (value: unknown): string => JSON.stringify(value, null, 2);

const formatRegistryContext = (context: BuildPromptInput["registryContext"] | undefined): string => {
  if (!context) return "registry_context=unknown";
  return [
    `tenant=${context.tenantId ?? "unknown"}`,
    `project=${context.projectId ?? "global"}`,
    `type=${context.type ?? "unknown"}`,
    `target=${context.target ?? "unknown"}`
  ].join(" ");
};

export class PromptBuilderService {
  private readonly requireRegistryPrompt: boolean;
  private readonly resolveRoleInstructions?: PromptBuilderServiceOptions["resolveRoleInstructions"];

  constructor(options: PromptBuilderServiceOptions = {}) {
    void options.rolesDir;
    void options.roleFallbackInstructions;
    void options.disableRoleFileFallback;
    this.requireRegistryPrompt = options.requireRegistryPrompt ?? true;
    this.resolveRoleInstructions = options.resolveRoleInstructions;
  }

  async buildPrompt(input: BuildPromptInput): Promise<string> {
    const role = input.role.trim();
    if (!role) {
      throw new Error("buildPrompt requires a non-empty role");
    }

    const roleInstructions = await this.loadRoleInstructions(role, input.registryContext);
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

  private async loadRoleInstructions(
    role: string,
    context?: BuildPromptInput["registryContext"]
  ): Promise<string> {
    if (this.resolveRoleInstructions) {
      const resolved = await this.resolveRoleInstructions(role, context);
      if (typeof resolved === "string" && resolved.trim().length > 0) {
        return resolved.trim();
      }
      throw new Error(
        `Prompt registry entry not found for role "${role}" (${formatRegistryContext(context)})`
      );
    }

    if (this.requireRegistryPrompt) {
      throw new Error(
        `Prompt registry resolver is required for role "${role}" (${formatRegistryContext(context)})`
      );
    }

    throw new Error(`Prompt registry resolver is required for role "${role}"`);
  }
}

export const buildPrompt = async (
  input: BuildPromptInput,
  options?: PromptBuilderServiceOptions
): Promise<string> => {
  const service = new PromptBuilderService(options);
  return service.buildPrompt(input);
};
