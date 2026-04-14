import { z } from "zod";
import { budgetLimitsSchema, idSchema } from "@cp/domain";

export const workflowStepTypeSchema = z.enum([
  "retrieval",
  "agent",
  "approval",
  "verification",
  "transition",
  "router",
  "memory_write",
  "artifact_collector",
  "experiment",
  "analytics"
]);

export const workflowStepSchema = z.object({
  id: idSchema,
  type: workflowStepTypeSchema,
  role: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  when: z.string().min(1).optional(),
  next: z.array(idSchema).default([]),
  budgetOverride: budgetLimitsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const workflowTransitionSchema = z.object({
  from: idSchema,
  on: z.string().min(1),
  to: idSchema,
  reason: z.string().min(1).optional()
});

export const workflowDefinitionSchema = z.object({
  id: idSchema,
  version: z.string().min(1),
  description: z.string().min(1).optional(),
  entrypoint: idSchema,
  steps: z.array(workflowStepSchema).min(1),
  transitions: z.array(workflowTransitionSchema).default([]),
  stopConditions: z.array(z.string().min(1)).default([])
});

export type WorkflowStepType = z.infer<typeof workflowStepTypeSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
