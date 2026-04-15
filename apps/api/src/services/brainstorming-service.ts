import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BrainstormingService,
  type BrainstormComposeInput,
  type BrainstormPlanDraft
} from "@cp/brainstorming";
import type {
  BrainstormPlan,
  BrainstormSession,
  CapabilityClass,
  Project,
  ProjectProviderBinding,
  ProjectRepositoryLink,
  ProviderConfig,
  ProviderModel,
  ProviderName,
  Repository,
  RoadmapItem,
  Task
} from "@cp/domain";
import { capabilityClasses, providerNames } from "@cp/domain";
import { apiStore } from "./api-store.js";
import { skillsService } from "./skills-service.js";
import { getSubprompt, listSubprompts, syncSubpromptsCatalog } from "./subprompts-service.js";

export interface StartBrainstormInput {
  projectIntent: string;
  threadId?: string;
  projectId?: string;
  selectedSubpromptIds?: string[];
  guidedAnswers?: Record<string, string>;
  actor?: string;
  generatePlan?: boolean;
}

export interface ApplyBrainstormPlanInput {
  planId: string;
  actor?: string;
  projectName?: string;
  projectKey?: string;
  description?: string;
  repositoryIds?: string[];
  repositoryUrls?: string[];
}

export interface BrainstormStartResult {
  session: BrainstormSession;
  plan?: BrainstormPlan;
}

export interface BrainstormApplyResult {
  session: BrainstormSession;
  project: Project;
  repositories: Repository[];
  roadmapItems: RoadmapItem[];
  tasks: Task[];
  providerBindings: ProjectProviderBinding[];
  skillInstallResults: Array<{ name: string; installed: boolean; warning?: string }>;
}

const resolveDefaultPromptRolesDir = (): string => {
  const fromCwd = path.resolve(process.cwd(), "configs/prompts/roles");
  if (existsSync(fromCwd)) {
    return fromCwd;
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../../../configs/prompts/roles");
};

const promptRolesDir = process.env.PROMPT_ROLES_DIR?.trim() || resolveDefaultPromptRolesDir();

const brainstormingService = new BrainstormingService({
  subpromptCatalog: {
    list: (filters) => listSubprompts(filters),
    get: (subpromptId) => getSubprompt(subpromptId)
  },
  rolesDir: promptRolesDir
});

const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const nowIso = (): string => new Date().toISOString();

const toProviderName = (value: string): ProviderName | null => {
  const normalized = value.trim().toLowerCase();
  return providerNames.includes(normalized as ProviderName) ? (normalized as ProviderName) : null;
};

const toCapabilityClass = (value: string): CapabilityClass | null => {
  const normalized = value.trim().toLowerCase();
  return capabilityClasses.includes(normalized as CapabilityClass) ? (normalized as CapabilityClass) : null;
};

const defaultAuthRef = (provider: ProviderName): string => `secret://${provider}/api-key`;

const inferVcsProvider = (url: string): Repository["vcsProvider"] => {
  const normalized = url.toLowerCase();
  if (normalized.includes("github.com")) return "github";
  if (normalized.includes("gitlab.com")) return "gitlab";
  if (normalized.includes("bitbucket.org")) return "bitbucket";
  return "other";
};

const inferRepositoryName = (url: string): string => {
  const lastSegment = url.split("/").filter(Boolean).at(-1) ?? "repository";
  return lastSegment.replace(/\.git$/i, "");
};

const buildDraftInput = (input: StartBrainstormInput): BrainstormComposeInput => ({
  projectIntent: input.projectIntent,
  selectedSubpromptIds: input.selectedSubpromptIds ?? [],
  guidedAnswers: input.guidedAnswers ?? {},
  ...(input.actor ? { actor: input.actor } : {})
});

const defaultTaskFromRoadmap = (projectId: string, roadmapItem: RoadmapItem, repositoryIds: string[]): Task => {
  const createdAt = nowIso();
  return {
    id: randomUUID(),
    projectId,
    roadmapItemId: roadmapItem.id,
    title: roadmapItem.title,
    type: "feature",
    state: "approved",
    goal: roadmapItem.description,
    scopeInclude: ["implementation"],
    scopeExclude: [],
    constraints: ["Keep existing API contracts unchanged."],
    targetRepositoryIds: repositoryIds,
    successCriteria: ["Verifier passes required checks"],
    verificationPlan: ["lint", "test", "build"],
    dependencyTaskIds: [],
    riskNotes: [],
    budget: {
      maxRetries: 2,
      maxCostUsd: 25,
      maxInputTokens: 120000,
      maxOutputTokens: 8000
    },
    approvalsRequired: true,
    createdAt,
    createdBy: "brainstorming_service",
    updatedAt: createdAt,
    updatedBy: "brainstorming_service"
  };
};

async function ensureProviderConfig(provider: ProviderName, actor: string): Promise<ProviderConfig> {
  const existing = (await apiStore.listProviderConfigs()).find((item) => item.provider === provider);
  if (existing) return existing;
  const createdAt = nowIso();
  return apiStore.createProviderConfig({
    id: randomUUID(),
    provider,
    authRef: defaultAuthRef(provider),
    enabled: true,
    timeoutMs: 30000,
    metadata: { source: "brainstorm_apply" },
    createdAt,
    createdBy: actor,
    updatedAt: createdAt,
    updatedBy: actor
  });
}

async function ensureProviderModel(
  providerConfigId: string,
  capabilityClass: CapabilityClass,
  modelIdHint: string | undefined,
  actor: string
): Promise<ProviderModel> {
  const models = await apiStore.listProviderModels();
  const existing =
    models.find(
      (model) =>
        model.providerConfigId === providerConfigId &&
        model.capabilityClass === capabilityClass &&
        (!modelIdHint || model.modelId === modelIdHint)
    ) ??
    models.find(
      (model) =>
        model.providerConfigId === providerConfigId && model.capabilityClass === capabilityClass
    );
  if (existing) return existing;

  const createdAt = nowIso();
  return apiStore.createProviderModel({
    id: randomUUID(),
    providerConfigId,
    modelId: modelIdHint?.trim() || `${capabilityClass}-default`,
    capabilityClass,
    contextWindow: 128000,
    maxOutputTokens: 8192,
    pricingMeta: {},
    enabled: true,
    createdAt,
    createdBy: actor,
    updatedAt: createdAt,
    updatedBy: actor
  });
}

async function createBindingsFromPlan(
  projectId: string,
  plan: BrainstormPlan,
  actor: string
): Promise<ProjectProviderBinding[]> {
  const output: ProjectProviderBinding[] = [];
  const planPayload = plan.plan;
  for (const binding of planPayload.providerBindings) {
    const capabilityClass = toCapabilityClass(binding.capabilityClass);
    const primaryProvider = toProviderName(binding.primaryProvider);
    if (!capabilityClass || !primaryProvider) continue;

    const primaryConfig = await ensureProviderConfig(primaryProvider, actor);
    const primaryModel = await ensureProviderModel(
      primaryConfig.id,
      capabilityClass,
      binding.primaryModelHint,
      actor
    );

    const fallbackModelIds: string[] = [];
    for (const fallbackProviderRaw of binding.fallbackProviders) {
      const fallbackProvider = toProviderName(fallbackProviderRaw);
      if (!fallbackProvider) continue;
      const fallbackConfig = await ensureProviderConfig(fallbackProvider, actor);
      const fallbackModel = await ensureProviderModel(
        fallbackConfig.id,
        capabilityClass,
        undefined,
        actor
      );
      fallbackModelIds.push(fallbackModel.id);
    }

    const createdAt = nowIso();
    output.push(
      await apiStore.createProviderBinding({
        id: randomUUID(),
        projectId,
        capabilityClass,
        primaryModelId: primaryModel.id,
        fallbackModelIds,
        enabled: true,
        createdAt,
        createdBy: actor,
        updatedAt: createdAt,
        updatedBy: actor
      })
    );
  }
  return output;
}

async function ensureRepositoriesForPlan(
  projectId: string,
  input: ApplyBrainstormPlanInput,
  actor: string
): Promise<Repository[]> {
  const repositories: Repository[] = [];
  const allRepositories = await apiStore.listRepositories();
  for (const repositoryId of input.repositoryIds ?? []) {
    const existing = allRepositories.find((repo) => repo.id === repositoryId);
    if (!existing) continue;
    repositories.push(existing);
  }

  for (const repositoryUrl of input.repositoryUrls ?? []) {
    const existing = allRepositories.find((repo) => repo.url === repositoryUrl);
    if (existing) {
      repositories.push(existing);
      continue;
    }
    const createdAt = nowIso();
    const created = await apiStore.createRepository({
      id: randomUUID(),
      name: inferRepositoryName(repositoryUrl),
      url: repositoryUrl,
      vcsProvider: inferVcsProvider(repositoryUrl),
      defaultBranch: "main",
      status: "active",
      createdAt,
      createdBy: actor,
      updatedAt: createdAt,
      updatedBy: actor
    });
    repositories.push(created);
  }

  const uniqueRepositories = [...new Map(repositories.map((repo) => [repo.id, repo])).values()];
  if (uniqueRepositories.length === 0) {
    const fallback = allRepositories[0];
    if (fallback) uniqueRepositories.push(fallback);
  }

  for (const [index, repository] of uniqueRepositories.entries()) {
    const createdAt = nowIso();
    const role: ProjectRepositoryLink["role"] = index === 0 ? "primary" : "secondary";
    await apiStore.createProjectRepositoryLink({
      id: randomUUID(),
      projectId,
      repositoryId: repository.id,
      role,
      rulesRef: "brainstorm_apply",
      createdAt,
      createdBy: actor,
      updatedAt: createdAt,
      updatedBy: actor
    });
  }

  return uniqueRepositories;
}

async function installSkillsFromPlan(plan: BrainstormPlan): Promise<
  Array<{ name: string; installed: boolean; warning?: string }>
> {
  const output: Array<{ name: string; installed: boolean; warning?: string }> = [];
  const planPayload = plan.plan;
  for (const skill of planPayload.suggestedSkills) {
    const result = await skillsService.installSkill({
      name: skill.name,
      repositoryUrl: skill.repositoryUrl,
      description: skill.reason
    });
    output.push({
      name: skill.name,
      installed: result.installed,
      ...(result.error ? { warning: result.error } : {})
    });
  }
  return output;
}

export async function startBrainstormSession(input: StartBrainstormInput): Promise<BrainstormStartResult> {
  const actor = input.actor?.trim() || "brainstorming_service";
  await syncSubpromptsCatalog();
  const selected =
    input.selectedSubpromptIds && input.selectedSubpromptIds.length > 0
      ? input.selectedSubpromptIds
      : (await listSubprompts({ enabled: true })).slice(0, 4).map((item) => item.id);

  const createdAt = nowIso();
  const session: BrainstormSession = await apiStore.createBrainstormSession({
    id: randomUUID(),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    status: "collecting",
    projectIntent: input.projectIntent,
    selectedSubpromptIds: selected,
    questions: brainstormingService.defaultGuidedQuestions(input.projectIntent),
    answers: input.guidedAnswers ?? {},
    createdAt,
    createdBy: actor,
    updatedAt: createdAt,
    updatedBy: actor
  });

  if (input.generatePlan === false) {
    return { session };
  }

  const draft: BrainstormPlanDraft = await brainstormingService.composePlanDraft(buildDraftInput(input));
  const plan = brainstormingService.makePlanEntity(session.id, draft, actor);
  const persistedPlan = await apiStore.createBrainstormPlan(plan);
  const updatedSession = await apiStore.updateBrainstormSession(session.id, {
    status: "planned",
    planId: persistedPlan.id,
    answers: input.guidedAnswers ?? {},
    updatedAt: nowIso(),
    updatedBy: actor
  });
  return {
    session: updatedSession,
    plan: persistedPlan
  };
}

export async function listBrainstormSessions(filters?: {
  threadId?: string;
  projectId?: string;
  status?: BrainstormSession["status"];
}): Promise<BrainstormSession[]> {
  return apiStore.listBrainstormSessions(filters);
}

export async function getBrainstormSession(sessionId: string): Promise<BrainstormSession | null> {
  return apiStore.getBrainstormSession(sessionId);
}

export async function getBrainstormPlan(planId: string): Promise<BrainstormPlan | null> {
  return apiStore.getBrainstormPlan(planId);
}

export async function listBrainstormPlans(sessionId?: string): Promise<BrainstormPlan[]> {
  return apiStore.listBrainstormPlans(sessionId ? { sessionId } : undefined);
}

export async function approveBrainstormPlan(planId: string, actor = "brainstorming_service"): Promise<BrainstormSession> {
  const plan = await apiStore.getBrainstormPlan(planId);
  if (!plan) {
    throw new Error(`Brainstorm plan not found: ${planId}`);
  }
  const approvedAt = nowIso();
  return apiStore.updateBrainstormSession(plan.sessionId, {
    status: "approved",
    approvedAt,
    updatedAt: approvedAt,
    updatedBy: actor
  });
}

export async function applyBrainstormPlan(
  input: ApplyBrainstormPlanInput
): Promise<BrainstormApplyResult> {
  const actor = input.actor?.trim() || "brainstorming_service";
  const plan = await apiStore.getBrainstormPlan(input.planId);
  if (!plan) {
    throw new Error(`Brainstorm plan not found: ${input.planId}`);
  }
  const session = await apiStore.getBrainstormSession(plan.sessionId);
  if (!session) {
    throw new Error(`Brainstorm session not found: ${plan.sessionId}`);
  }
  if (session.status !== "approved" && session.status !== "applied") {
    throw new Error(
      `Brainstorm session ${session.id} must be approved before project creation (current status: ${session.status}).`
    );
  }

  const createdAt = nowIso();
  const baseName = input.projectName?.trim() || plan.title;
  const project = await apiStore.createProject({
    id: randomUUID(),
    key: input.projectKey?.trim() || toSlug(baseName) || `project-${Date.now()}`,
    name: baseName,
    description: input.description?.trim() || plan.executiveSummary,
    status: "active",
    policySetId: "policy-main",
    createdAt,
    createdBy: actor,
    updatedAt: createdAt,
    updatedBy: actor
  });

  const repositories = await ensureRepositoriesForPlan(project.id, input, actor);
  const repositoryIds = repositories.map((repo) => repo.id);

  const roadmapItems: RoadmapItem[] = [];
  const tasks: Task[] = [];
  const planPayload = plan.plan;
  for (const [index, roadmapTask] of planPayload.roadmap.entries()) {
    const roadmapItemCreatedAt = nowIso();
    const roadmapItem = await apiStore.createRoadmapItem({
      id: randomUUID(),
      projectId: project.id,
      title: roadmapTask.title,
      description: roadmapTask.description,
      state: "approved",
      priority: 60 - index,
      orderIndex: index + 1,
      createdAt: roadmapItemCreatedAt,
      createdBy: actor,
      updatedAt: roadmapItemCreatedAt,
      updatedBy: actor
    });
    roadmapItems.push(roadmapItem);

    const task = await apiStore.createTask(defaultTaskFromRoadmap(project.id, roadmapItem, repositoryIds));
    tasks.push(task);
  }

  const providerBindings = await createBindingsFromPlan(project.id, plan, actor);
  const skillInstallResults = await installSkillsFromPlan(plan);

  const appliedAt = nowIso();
  const updatedSession = await apiStore.updateBrainstormSession(plan.sessionId, {
    status: "applied",
    projectId: project.id,
    approvedAt: session.approvedAt ?? appliedAt,
    appliedAt,
    updatedAt: appliedAt,
    updatedBy: actor
  });

  return {
    session: updatedSession,
    project,
    repositories,
    roadmapItems,
    tasks,
    providerBindings,
    skillInstallResults
  };
}
