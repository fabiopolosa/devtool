import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const codingWorkflowStateSchema = z.enum([
  "request",
  "planning",
  "awaiting_plan_approval",
  "plan_rejected",
  "plan_approved",
  "task_generation",
  "awaiting_patch_approval",
  "executing",
  "review",
  "completed",
  "rejected"
]);

export const codingWorkflowDecisionStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "revision_requested"
]);

export const codingWorkflowTimelineEventSchema = z.object({
  id: idSchema,
  type: z.enum([
    "request_created",
    "planning_started",
    "plan_generated",
    "plan_approved",
    "plan_rejected",
    "plan_revision_requested",
    "task_generation_started",
    "tasks_created",
    "patch_proposed",
    "patch_approved",
    "patch_rejected",
    "patch_revision_requested",
    "execution_started",
    "review_completed",
    "workflow_completed"
  ]),
  message: z.string().min(1),
  createdAt: isoDateTimeSchema,
  actor: z.string().min(1),
  metadata: z.record(z.unknown()).optional()
});

export const codingWorkflowTaskDraftSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  files: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  status: z.enum(["draft", "ready", "blocked"]),
  notes: z.string().min(1).optional()
});

export const codingWorkflowPatchProposalSchema = z.object({
  summary: z.string().min(1),
  files: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  notes: z.array(z.string().min(1)).default([])
});

export const codingWorkflowPlanSchema = z.object({
  summary: z.string().min(1),
  rationale: z.string().min(1),
  tasks: z.array(codingWorkflowTaskDraftSchema).default([]),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  risks: z.array(z.string().min(1)).default([]),
  patchProposal: codingWorkflowPatchProposalSchema.optional()
});

export const codingWorkflowSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  projectId: idSchema,
  title: z.string().min(1),
  request: z.string().min(1),
  state: codingWorkflowStateSchema,
  planDecision: codingWorkflowDecisionStatusSchema,
  patchDecision: codingWorkflowDecisionStatusSchema,
  plan: codingWorkflowPlanSchema,
  generatedTaskIds: z.array(idSchema).default([]),
  actionRequired: z.boolean(),
  reviewSummary: z.string().min(1).optional(),
  timeline: z.array(codingWorkflowTimelineEventSchema).default([]),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type CodingWorkflowStateSchema = z.infer<typeof codingWorkflowStateSchema>;
export type CodingWorkflowDecisionStatusSchema = z.infer<typeof codingWorkflowDecisionStatusSchema>;
export type CodingWorkflowTimelineEventSchema = z.infer<typeof codingWorkflowTimelineEventSchema>;
export type CodingWorkflowTaskDraftSchema = z.infer<typeof codingWorkflowTaskDraftSchema>;
export type CodingWorkflowPatchProposalSchema = z.infer<typeof codingWorkflowPatchProposalSchema>;
export type CodingWorkflowPlanSchema = z.infer<typeof codingWorkflowPlanSchema>;
export type CodingWorkflowSchema = z.infer<typeof codingWorkflowSchema>;

