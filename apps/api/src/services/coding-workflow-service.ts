import { randomUUID } from "node:crypto";
import type { CodingWorkflow, CodingWorkflowPatchProposal, CodingWorkflowPlan, CodingWorkflowTaskDraft, Task } from "@cp/domain";
import { apiStore } from "./api-store.js";
import { buildCompactKnowledgeContext, formatCompactKnowledgeContext } from "./knowledge-service.js";

const nowIso = (): string => new Date().toISOString();

const normalizeSummary = (value: string): string => value.trim().replace(/\s+/g, " ");

const splitKeywords = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 2);

const deriveFocusFiles = (request: string): string[] => {
  const keywords = new Set(splitKeywords(request));
  const files = ["apps/api/src/routes", "apps/api/src/services"];
  if (keywords.has("ui") || keywords.has("frontend") || keywords.has("dashboard")) {
    files.push("apps/web/src/pages", "apps/web/src/components");
  }
  if (keywords.has("db") || keywords.has("database") || keywords.has("migration")) {
    files.push("packages/db/src/schema.ts", "packages/db/migrations");
  }
  if (keywords.has("prompt") || keywords.has("brainstorm")) {
    files.push("packages/prompt-builder/src", "packages/subprompts/src");
  }
  return [...new Set(files)];
};

const createTaskDrafts = (request: string): CodingWorkflowTaskDraft[] => {
  const focusFiles = deriveFocusFiles(request);
  const baseCommand = request.toLowerCase().includes("test") ? "pnpm test" : "pnpm typecheck";
  return [
    {
      id: `coding_task_${randomUUID().slice(0, 8)}`,
      title: "Clarify scope and constraints",
      description: `Review the request and define the minimum safe implementation: ${normalizeSummary(request)}`,
      files: focusFiles.slice(0, 2),
      commands: [baseCommand],
      status: "draft",
      notes: "Keep the implementation additive and preserve tenant scoping."
    },
    {
      id: `coding_task_${randomUUID().slice(0, 8)}`,
      title: "Implement the requested change",
      description: "Apply the structured code changes and keep runtime contracts stable.",
      files: focusFiles,
      commands: ["pnpm lint", "pnpm test"],
      status: "draft"
    },
    {
      id: `coding_task_${randomUUID().slice(0, 8)}`,
      title: "Verify and review",
      description: "Validate the patch, summarize the result, and capture follow-up notes.",
      files: ["apps/api/src", "apps/web/src"],
      commands: ["pnpm build"],
      status: "draft"
    }
  ];
};

const buildPlan = (request: string, knowledgeContextSummary?: string): CodingWorkflowPlan => {
  const taskDrafts = createTaskDrafts(request);
  const normalizedRequest = normalizeSummary(request);
  return {
    summary: `Plan to implement: ${normalizedRequest}`,
    rationale:
      [
        "Keep development changes explicit, reviewable, and gated by human approval before patch execution.",
        knowledgeContextSummary ? `Knowledge context:\n${knowledgeContextSummary}` : undefined
      ]
        .filter(Boolean)
        .join("\n\n"),
    tasks: taskDrafts,
    acceptanceCriteria: [
      "Plan remains additive and scoped to the selected project.",
      "Generated tasks are reviewable before any execution.",
      "Patch approval moves the workflow into execution and review states."
    ],
    risks: [
      "Changes that span multiple packages should keep the project boundary explicit.",
      "Approval gates must remain the only way to move from planning to execution."
    ]
  };
};

const buildPatchProposal = (plan: CodingWorkflowPlan): CodingWorkflowPatchProposal => ({
  summary: `Execute approved plan: ${plan.summary}`,
  files: plan.tasks.flatMap((task) => task.files),
  commands: ["pnpm typecheck", "pnpm lint", "pnpm test", "pnpm build"],
  notes: [
    "Patch execution is gated by human approval.",
    "The workflow transitions to review and completed once execution is simulated."
  ]
});

const appendTimeline = (
  workflow: CodingWorkflow,
  type: CodingWorkflow["timeline"][number]["type"],
  message: string,
  actor: string,
  metadata?: Record<string, unknown>
): CodingWorkflow => ({
  ...workflow,
  timeline: [
    ...workflow.timeline,
    {
      id: randomUUID(),
      type,
      message,
      createdAt: nowIso(),
      actor,
      ...(metadata ? { metadata } : {})
    }
  ],
  updatedAt: nowIso(),
  updatedBy: actor
});

const updateWorkflow = async (workflow: CodingWorkflow): Promise<CodingWorkflow> =>
  apiStore.updateCodingWorkflow(workflow.id, workflow);

const createTaskRecords = async (
  workflow: CodingWorkflow,
  actor: string
): Promise<Task[]> => {
  const createdAt = nowIso();
  const tasks: Task[] = [];

  for (const taskDraft of workflow.plan.tasks) {
    const task: Task = {
      id: randomUUID(),
      tenantId: workflow.tenantId,
      projectId: workflow.projectId,
      title: taskDraft.title,
      type: "feature",
      state: "draft",
      goal: taskDraft.description,
      scopeInclude: taskDraft.files.length > 0 ? taskDraft.files : ["implementation"],
      scopeExclude: [],
      constraints: ["Preserve existing public contracts.", "Keep tenant/project isolation intact."],
      targetRepositoryIds: [],
      successCriteria: workflow.plan.acceptanceCriteria.length > 0 ? workflow.plan.acceptanceCriteria : ["Plan approved"],
      verificationPlan: taskDraft.commands.length > 0 ? taskDraft.commands : ["pnpm typecheck", "pnpm lint"],
      dependencyTaskIds: [],
      riskNotes: workflow.plan.risks,
      budget: {
        maxRetries: 2,
        maxCostUsd: 10,
        maxInputTokens: 40000,
        maxOutputTokens: 4000
      },
      approvalsRequired: true,
      createdAt,
      createdBy: actor,
      updatedAt: createdAt,
      updatedBy: actor
    };
    tasks.push(await apiStore.createTask(task));
  }

  return tasks;
};

export interface CodingWorkflowCreateInput {
  tenantId: string;
  projectId: string;
  title: string;
  request: string;
  actor: string;
}

export interface CodingWorkflowActionResult {
  item: CodingWorkflow;
  generatedTasks?: Task[];
}

export interface CodingWorkflowStoreFilters {
  projectId?: string;
  state?: CodingWorkflow["state"];
}

export const listCodingWorkflows = async (filters: CodingWorkflowStoreFilters): Promise<CodingWorkflow[]> =>
  apiStore.listCodingWorkflows(filters);

export const getCodingWorkflow = async (
  workflowId: string,
  projectId: string,
  tenantId: string
): Promise<CodingWorkflow | null> => {
  const item = await apiStore.getCodingWorkflow(workflowId);
  if (!item) return null;
  if (item.tenantId !== tenantId) return null;
  if (item.projectId !== projectId) return null;
  return item;
};

export const createCodingWorkflow = async (input: CodingWorkflowCreateInput): Promise<CodingWorkflow> => {
  const now = nowIso();
  const knowledgeContext = await buildCompactKnowledgeContext({
    tenantId: input.tenantId,
    projectId: input.projectId,
    query: input.request,
    limit: 5,
    includeContextNotes: true
  });
  const knowledgeContextSummary = knowledgeContext.length > 0 ? formatCompactKnowledgeContext(knowledgeContext) : undefined;
  const workflow: CodingWorkflow = {
    id: randomUUID(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    title: normalizeSummary(input.title) || "Coding request",
    request: normalizeSummary(input.request),
    state: "awaiting_plan_approval",
    planDecision: "pending",
    patchDecision: "pending",
    plan: buildPlan(input.request, knowledgeContextSummary),
    generatedTaskIds: [],
    actionRequired: true,
    timeline: [
      {
        id: randomUUID(),
        type: "request_created",
        message: "Coding request created",
        createdAt: now,
        actor: input.actor
      },
      {
        id: randomUUID(),
        type: "planning_started",
        message: "Structured plan generated and ready for approval",
        createdAt: now,
        actor: input.actor
      },
      {
        id: randomUUID(),
        type: "plan_generated",
        message: "Plan prepared with generated tasks, verification outline, and knowledge context",
        createdAt: now,
        actor: input.actor,
        metadata: {
          taskCount: 3,
          ...(knowledgeContextSummary ? { knowledgeContextCount: knowledgeContext.length } : {})
        }
      }
    ],
    createdAt: now,
    createdBy: input.actor,
    updatedAt: now,
    updatedBy: input.actor
  };

  return apiStore.createCodingWorkflow(workflow);
};

export const requestPlanRevision = async (
  workflowId: string,
  projectId: string,
  tenantId: string,
  actor: string,
  note = "Revision requested"
): Promise<CodingWorkflow> => {
  const existing = await getCodingWorkflow(workflowId, projectId, tenantId);
  if (!existing) throw new Error("Coding workflow not found");

  const next = appendTimeline(
    {
      ...existing,
      state: "planning",
      planDecision: "revision_requested",
      patchDecision: existing.patchDecision,
      actionRequired: true
    },
    "plan_revision_requested",
    note,
    actor
  );
  return updateWorkflow(next);
};

export const rejectPlan = async (
  workflowId: string,
  projectId: string,
  tenantId: string,
  actor: string,
  reason = "Plan rejected"
): Promise<CodingWorkflow> => {
  const existing = await getCodingWorkflow(workflowId, projectId, tenantId);
  if (!existing) throw new Error("Coding workflow not found");

  const next = appendTimeline(
    {
      ...existing,
      state: "plan_rejected",
      planDecision: "rejected",
      patchDecision: "pending",
      actionRequired: false
    },
    "plan_rejected",
    reason,
    actor
  );
  return updateWorkflow(next);
};

export const approvePlan = async (
  workflowId: string,
  projectId: string,
  tenantId: string,
  actor: string
): Promise<CodingWorkflowActionResult> => {
  const existing = await getCodingWorkflow(workflowId, projectId, tenantId);
  if (!existing) throw new Error("Coding workflow not found");
  if (existing.state !== "awaiting_plan_approval" && existing.state !== "planning") {
    throw new Error(`Workflow is not awaiting plan approval: ${existing.state}`);
  }

  const patchProposal = buildPatchProposal(existing.plan);
  const workflowWithProposal = appendTimeline(
    {
      ...existing,
      state: "task_generation",
      planDecision: "approved",
      patchDecision: "pending",
      plan: {
        ...existing.plan,
        patchProposal
      }
    },
    "plan_approved",
    "Plan approved",
    actor
  );

  const workflowWithGeneration = appendTimeline(
    workflowWithProposal,
    "task_generation_started",
    "Task generation started",
    actor
  );

  const generatedTasks = await createTaskRecords(workflowWithGeneration, actor);
  const next = appendTimeline(
    {
      ...workflowWithGeneration,
      state: "awaiting_patch_approval",
      generatedTaskIds: generatedTasks.map((task) => task.id),
      actionRequired: true
    },
    "tasks_created",
    "Generated development tasks are ready for patch approval",
    actor,
    { generatedTaskIds: generatedTasks.map((task) => task.id) }
  );

  const stored = await updateWorkflow(next);
  return { item: stored, generatedTasks };
};

export const requestPatchRevision = async (
  workflowId: string,
  projectId: string,
  tenantId: string,
  actor: string,
  note = "Patch revision requested"
): Promise<CodingWorkflow> => {
  const existing = await getCodingWorkflow(workflowId, projectId, tenantId);
  if (!existing) throw new Error("Coding workflow not found");

  const next = appendTimeline(
    {
      ...existing,
      state: "awaiting_patch_approval",
      patchDecision: "revision_requested",
      actionRequired: true
    },
    "patch_revision_requested",
    note,
    actor
  );
  return updateWorkflow(next);
};

export const rejectPatch = async (
  workflowId: string,
  projectId: string,
  tenantId: string,
  actor: string,
  reason = "Patch rejected"
): Promise<CodingWorkflow> => {
  const existing = await getCodingWorkflow(workflowId, projectId, tenantId);
  if (!existing) throw new Error("Coding workflow not found");

  const next = appendTimeline(
    {
      ...existing,
      state: "rejected",
      patchDecision: "rejected",
      actionRequired: false
    },
    "patch_rejected",
    reason,
    actor
  );
  return updateWorkflow(next);
};

export const approvePatch = async (
  workflowId: string,
  projectId: string,
  tenantId: string,
  actor: string
): Promise<CodingWorkflow> => {
  const existing = await getCodingWorkflow(workflowId, projectId, tenantId);
  if (!existing) throw new Error("Coding workflow not found");
  if (existing.state !== "awaiting_patch_approval") {
    throw new Error(`Workflow is not awaiting patch approval: ${existing.state}`);
  }

  const workflowWithExecution = appendTimeline(
    {
      ...existing,
      state: "executing",
      patchDecision: "approved",
      actionRequired: false
    },
    "patch_approved",
    "Patch approved",
    actor
  );

  const updatedTasks: Task[] = [];
  for (const taskId of workflowWithExecution.generatedTaskIds) {
    const task = await apiStore.getTask(taskId);
    if (!task) continue;
    updatedTasks.push(
      await apiStore.updateTask(taskId, {
        state: "completed",
        updatedAt: nowIso(),
        updatedBy: actor
      })
    );
  }

  const reviewed = appendTimeline(
    {
      ...workflowWithExecution,
      state: "review",
      reviewSummary: "Execution completed and ready for review"
    },
    "review_completed",
    "Execution finished and review is available",
    actor,
    { updatedTaskIds: updatedTasks.map((task) => task.id) }
  );

  const completed = appendTimeline(
    {
      ...reviewed,
      state: "completed",
      actionRequired: false
    },
    "workflow_completed",
    "Workflow completed successfully",
    actor
  );

  return updateWorkflow(completed);
};
