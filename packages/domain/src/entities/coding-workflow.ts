export type CodingWorkflowState =
  | "request"
  | "planning"
  | "awaiting_plan_approval"
  | "plan_rejected"
  | "plan_approved"
  | "task_generation"
  | "awaiting_patch_approval"
  | "executing"
  | "review"
  | "completed"
  | "rejected";

export type CodingWorkflowDecisionStatus = "pending" | "approved" | "rejected" | "revision_requested";

export type CodingWorkflowTimelineEventType =
  | "request_created"
  | "planning_started"
  | "plan_generated"
  | "plan_approved"
  | "plan_rejected"
  | "plan_revision_requested"
  | "task_generation_started"
  | "tasks_created"
  | "patch_proposed"
  | "patch_approved"
  | "patch_rejected"
  | "patch_revision_requested"
  | "execution_started"
  | "review_completed"
  | "workflow_completed";

export interface CodingWorkflowTimelineEvent {
  id: string;
  type: CodingWorkflowTimelineEventType;
  message: string;
  createdAt: string;
  actor: string;
  metadata?: Record<string, unknown>;
}

export interface CodingWorkflowTaskDraft {
  id: string;
  title: string;
  description: string;
  files: string[];
  commands: string[];
  status: "draft" | "ready" | "blocked";
  notes?: string;
}

export interface CodingWorkflowPatchProposal {
  summary: string;
  files: string[];
  commands: string[];
  notes: string[];
}

export interface CodingWorkflowPlan {
  summary: string;
  rationale: string;
  tasks: CodingWorkflowTaskDraft[];
  acceptanceCriteria: string[];
  risks: string[];
  patchProposal?: CodingWorkflowPatchProposal;
}

export interface CodingWorkflow {
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  request: string;
  state: CodingWorkflowState;
  planDecision: CodingWorkflowDecisionStatus;
  patchDecision: CodingWorkflowDecisionStatus;
  plan: CodingWorkflowPlan;
  generatedTaskIds: string[];
  actionRequired: boolean;
  reviewSummary?: string;
  timeline: CodingWorkflowTimelineEvent[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

