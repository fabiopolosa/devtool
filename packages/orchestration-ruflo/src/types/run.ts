import { z } from "zod";
import { artifactRefSchema, budgetLimitsSchema, idSchema } from "@cp/domain";

export const orchestrationRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "waiting_for_research",
  "waiting_for_debug",
  "blocked",
  "failed",
  "completed",
  "canceled"
]);

export const orchestrationRunEventSchema = z.object({
  id: idSchema,
  runId: idSchema,
  taskId: idSchema,
  eventType: z.enum([
    "run_created",
    "run_started",
    "step_started",
    "step_completed",
    "budget_checked",
    "budget_exceeded",
    "escalated",
    "verification_requested",
    "verification_completed",
    "run_completed",
    "run_failed"
  ]),
  status: orchestrationRunStatusSchema,
  actor: z.string().min(1),
  message: z.string().min(1),
  stepId: idSchema.optional(),
  artifact: artifactRefSchema.optional(),
  budgetSnapshot: budgetLimitsSchema.optional(),
  createdAt: z.string().datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const orchestrationRunRecordSchema = z.object({
  runId: idSchema,
  taskId: idSchema,
  workflowId: idSchema,
  status: orchestrationRunStatusSchema,
  stepId: idSchema.optional(),
  budget: budgetLimitsSchema,
  events: z.array(orchestrationRunEventSchema).default([])
});

export type OrchestrationRunStatus = z.infer<typeof orchestrationRunStatusSchema>;
export type OrchestrationRunEvent = z.infer<typeof orchestrationRunEventSchema>;
export type OrchestrationRunRecord = z.infer<typeof orchestrationRunRecordSchema>;
export type BudgetLimits = z.infer<typeof budgetLimitsSchema>;
