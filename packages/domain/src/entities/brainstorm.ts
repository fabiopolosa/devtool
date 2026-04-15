import { brainstormPlanPayloadSchema, brainstormPlanSchema } from "../schemas/brainstorm.schema.js";

export type BrainstormSessionStatus = "collecting" | "planned" | "approved" | "applied" | "archived";

export interface BrainstormQuestion {
  id: string;
  question: string;
  rationale: string;
}

export interface BrainstormRoadmapTask {
  id: string;
  title: string;
  description: string;
  dependencies: string[];
  targetRepos: string[];
  suggestedAgentRole: string;
  suggestedSkills: string[];
}

export interface BrainstormPlanPayload {
  recommendedStack: {
    database: string;
    backend: string;
    frontend: string;
    llmProviders: string[];
    vectorStore: string;
  };
  architecture: {
    repositoryStrategy: "monorepo" | "microrepo" | "hybrid";
    packageLayout: string[];
    rationale: string;
  };
  suggestedAgents: Array<{
    role: string;
    purpose: string;
    capabilities: string[];
  }>;
  suggestedSkills: Array<{
    name: string;
    repositoryUrl: string;
    reason: string;
  }>;
  providerBindings: Array<{
    capabilityClass: string;
    primaryProvider: string;
    fallbackProviders: string[];
    primaryModelHint?: string | undefined;
  }>;
  roadmap: BrainstormRoadmapTask[];
  assumptions: string[];
  risks: string[];
  composedPrompt: string;
  selectedSubprompts: Array<{
    id: string;
    title: string;
    category: string;
    summary: string;
    prompt: string;
    tags: string[];
    sourcePath: string;
    enabled: boolean;
  }>;
}

export interface BrainstormPlan {
  id: string;
  sessionId: string;
  title: string;
  executiveSummary: string;
  plan: BrainstormPlanPayload;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type BrainstormPlanLike = BrainstormPlan | (Partial<BrainstormPlan> & Record<string, unknown>);

export interface BrainstormPlanNormalizationOptions {
  // Reserved for future strictness toggles. Legacy fallback is intentionally not supported.
}

const legacyTopLevelPlanFields = [
  "recommendedStack",
  "architecture",
  "suggestedAgents",
  "suggestedSkills",
  "providerBindings",
  "roadmap",
  "assumptions",
  "risks",
  "composedPrompt",
  "selectedSubprompts"
] as const;

const toPlanId = (input: BrainstormPlanLike): string =>
  typeof input.id === "string" && input.id.trim().length > 0 ? input.id : "unknown_brainstorm_plan";

const assertNoLegacyTopLevelPlanFields = (input: BrainstormPlanLike): void => {
  const record = input as Record<string, unknown>;
  const offenders = legacyTopLevelPlanFields.filter((field) => field in record);
  if (offenders.length === 0) return;
  throw new Error(
    `[brainstorm-plan] Legacy top-level plan fields are not supported (${offenders.join(", ")}). ` +
      `Use brainstormPlan.plan.* only.`
  );
};

export const getBrainstormPlanPayload = (
  input: BrainstormPlanLike,
  _options?: BrainstormPlanNormalizationOptions
): BrainstormPlanPayload => {
  assertNoLegacyTopLevelPlanFields(input);
  const planCandidate = (input as Record<string, unknown>).plan;
  const parsed = brainstormPlanPayloadSchema.safeParse(planCandidate);
  if (parsed.success) return parsed.data;

  throw new Error(
    `[brainstorm-plan] Invalid or missing canonical plan payload for "${toPlanId(input)}". ` +
      `Expected brainstormPlan.plan.* structure.`
  );
};

export const normalizeBrainstormPlan = (
  input: BrainstormPlanLike,
  options?: BrainstormPlanNormalizationOptions
): BrainstormPlan => {
  void options;
  assertNoLegacyTopLevelPlanFields(input);
  const parsed = brainstormPlanSchema.safeParse({
    ...input,
    plan: getBrainstormPlanPayload(input)
  });
  if (parsed.success) return parsed.data;

  throw new Error(
    `[brainstorm-plan] Invalid canonical brainstorm plan payload for "${toPlanId(input)}". ` +
      `Expected required metadata + nested plan.* fields.`
  );
};

export interface BrainstormSession {
  id: string;
  threadId?: string;
  projectId?: string;
  status: BrainstormSessionStatus;
  projectIntent: string;
  selectedSubpromptIds: string[];
  questions: BrainstormQuestion[];
  answers: Record<string, string>;
  planId?: string;
  approvedAt?: string;
  appliedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
