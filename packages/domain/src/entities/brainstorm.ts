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
    primaryModelHint?: string;
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

export interface LegacyBrainstormPlan extends Partial<Omit<BrainstormPlan, "plan">> {
  plan?: Partial<BrainstormPlanPayload>;
  recommendedStack?: Partial<BrainstormPlanPayload["recommendedStack"]>;
  architecture?: Partial<BrainstormPlanPayload["architecture"]>;
  suggestedAgents?: BrainstormPlanPayload["suggestedAgents"];
  suggestedSkills?: BrainstormPlanPayload["suggestedSkills"];
  providerBindings?: BrainstormPlanPayload["providerBindings"];
  roadmap?: BrainstormRoadmapTask[];
  assumptions?: string[];
  risks?: string[];
  composedPrompt?: string;
  selectedSubprompts?: BrainstormPlanPayload["selectedSubprompts"] | string[];
}

export type BrainstormPlanLike = BrainstormPlan | LegacyBrainstormPlan;

export interface BrainstormPlanNormalizationOptions {
  warnOnLegacyFallback?: boolean;
  logger?: Pick<Console, "warn">;
}

const fallbackLogger: Pick<Console, "warn"> = console;
const fallbackWarnedPlanIds = new Set<string>();

const toNonEmptyString = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const toRepositoryStrategy = (value: unknown): "monorepo" | "microrepo" | "hybrid" => {
  if (value === "monorepo" || value === "microrepo" || value === "hybrid") return value;
  return "monorepo";
};

const normalizeRoadmapTask = (value: unknown, index: number): BrainstormRoadmapTask => {
  const record = toRecord(value);
  return {
    id: toNonEmptyString(record.id, `legacy_task_${index + 1}`),
    title: toNonEmptyString(record.title, `Legacy task ${index + 1}`),
    description: toNonEmptyString(record.description, "Legacy migrated roadmap task."),
    dependencies: toStringArray(record.dependencies),
    targetRepos: toStringArray(record.targetRepos),
    suggestedAgentRole: toNonEmptyString(record.suggestedAgentRole, "planner"),
    suggestedSkills: toStringArray(record.suggestedSkills)
  };
};

const normalizeSelectedSubprompt = (
  value: unknown,
  index: number
): BrainstormPlanPayload["selectedSubprompts"][number] => {
  if (typeof value === "string") {
    const title = value.trim() || `legacy_subprompt_${index + 1}`;
    return {
      id: title,
      title,
      category: "other",
      summary: "Legacy subprompt reference migrated to canonical format.",
      prompt: `Legacy reference: ${title}`,
      tags: [],
      sourcePath: "legacy",
      enabled: true
    };
  }

  const record = toRecord(value);
  const id = toNonEmptyString(record.id, `legacy_subprompt_${index + 1}`);
  return {
    id,
    title: toNonEmptyString(record.title, id),
    category: toNonEmptyString(record.category, "other"),
    summary: toNonEmptyString(record.summary, "Legacy subprompt migrated to canonical format."),
    prompt: toNonEmptyString(record.prompt, `Legacy reference: ${id}`),
    tags: toStringArray(record.tags),
    sourcePath: toNonEmptyString(record.sourcePath, "legacy"),
    enabled: typeof record.enabled === "boolean" ? record.enabled : true
  };
};

const hasCanonicalPlan = (value: unknown): value is BrainstormPlanPayload => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.recommendedStack === "object" && typeof record.architecture === "object";
};

const buildFallbackPlan = (
  source: LegacyBrainstormPlan,
  partialPlan: Partial<BrainstormPlanPayload>
): BrainstormPlanPayload => {
  const planStack = toRecord(partialPlan.recommendedStack);
  const legacyStack = toRecord(source.recommendedStack);
  const planArchitecture = toRecord(partialPlan.architecture);
  const legacyArchitecture = toRecord(source.architecture);

  const suggestedAgentsSource =
    partialPlan.suggestedAgents ??
    (Array.isArray(source.suggestedAgents) ? source.suggestedAgents : []);
  const suggestedSkillsSource =
    partialPlan.suggestedSkills ??
    (Array.isArray(source.suggestedSkills) ? source.suggestedSkills : []);
  const providerBindingsSource =
    partialPlan.providerBindings ??
    (Array.isArray(source.providerBindings) ? source.providerBindings : []);
  const roadmapSource = partialPlan.roadmap ?? (Array.isArray(source.roadmap) ? source.roadmap : []);
  const assumptionsSource = partialPlan.assumptions ?? source.assumptions;
  const risksSource = partialPlan.risks ?? source.risks;
  const selectedSubpromptsSource =
    partialPlan.selectedSubprompts ??
    (Array.isArray(source.selectedSubprompts) ? source.selectedSubprompts : []);

  return {
    recommendedStack: {
      database: toNonEmptyString(planStack.database ?? legacyStack.database, "unspecified"),
      backend: toNonEmptyString(planStack.backend ?? legacyStack.backend, "unspecified"),
      frontend: toNonEmptyString(planStack.frontend ?? legacyStack.frontend, "unspecified"),
      llmProviders: toStringArray(planStack.llmProviders ?? legacyStack.llmProviders),
      vectorStore: toNonEmptyString(planStack.vectorStore ?? legacyStack.vectorStore, "unspecified")
    },
    architecture: {
      repositoryStrategy: toRepositoryStrategy(
        planArchitecture.repositoryStrategy ?? legacyArchitecture.repositoryStrategy
      ),
      packageLayout: toStringArray(planArchitecture.packageLayout ?? legacyArchitecture.packageLayout),
      rationale: toNonEmptyString(
        planArchitecture.rationale ?? legacyArchitecture.rationale,
        "Legacy plan migrated without explicit architecture rationale."
      )
    },
    suggestedAgents: Array.isArray(suggestedAgentsSource) ? suggestedAgentsSource : [],
    suggestedSkills: Array.isArray(suggestedSkillsSource) ? suggestedSkillsSource : [],
    providerBindings: Array.isArray(providerBindingsSource) ? providerBindingsSource : [],
    roadmap: Array.isArray(roadmapSource)
      ? roadmapSource.map((task, index) => normalizeRoadmapTask(task, index))
      : [],
    assumptions: toStringArray(assumptionsSource),
    risks: toStringArray(risksSource),
    composedPrompt: toNonEmptyString(
      partialPlan.composedPrompt ?? source.composedPrompt,
      "Legacy brainstorm plan migrated to nested plan payload."
    ),
    selectedSubprompts: Array.isArray(selectedSubpromptsSource)
      ? selectedSubpromptsSource.map((item, index) => normalizeSelectedSubprompt(item, index))
      : []
  };
};

const emitFallbackWarning = (
  input: LegacyBrainstormPlan,
  options?: BrainstormPlanNormalizationOptions
): void => {
  if (!options?.warnOnLegacyFallback) return;
  const logger = options.logger ?? fallbackLogger;
  const planId = toNonEmptyString(input.id, "legacy_brainstorm_plan");
  if (fallbackWarnedPlanIds.has(planId)) return;
  fallbackWarnedPlanIds.add(planId);
  logger.warn(
    `[brainstorm-plan] Legacy top-level plan fields detected for "${planId}". Falling back to compatibility mapping.`
  );
};

export const getBrainstormPlanPayload = (
  input: BrainstormPlanLike,
  options?: BrainstormPlanNormalizationOptions
): BrainstormPlanPayload => {
  const partialPlan = hasCanonicalPlan(input.plan) ? input.plan : ((input.plan ?? {}) as Partial<BrainstormPlanPayload>);
  const usesLegacyFallback = !hasCanonicalPlan(input.plan);
  if (usesLegacyFallback) {
    emitFallbackWarning(input, options);
  }
  return buildFallbackPlan(input, partialPlan);
};

export const normalizeBrainstormPlan = (
  input: BrainstormPlanLike,
  options?: BrainstormPlanNormalizationOptions
): BrainstormPlan => {
  const now = new Date().toISOString();
  return {
    id: toNonEmptyString(input.id, `legacy_brainstorm_plan_${Date.now()}`),
    sessionId: toNonEmptyString(input.sessionId, "legacy_session"),
    title: toNonEmptyString(input.title, "Legacy brainstorm plan"),
    executiveSummary: toNonEmptyString(
      input.executiveSummary,
      "Legacy brainstorm plan migrated to canonical nested structure."
    ),
    plan: getBrainstormPlanPayload(input, options),
    createdAt: toNonEmptyString(input.createdAt, now),
    createdBy: toNonEmptyString(input.createdBy, "legacy_migration"),
    updatedAt: toNonEmptyString(input.updatedAt, now),
    updatedBy: toNonEmptyString(input.updatedBy, "legacy_migration")
  };
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
