import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const jobStatusSchema = z.enum(["idle", "running", "waiting_user", "done", "error"]);
export const jobActionTypeSchema = z.enum(["input", "approve", "review"]);
export const jobTypeSchema = z.enum([
  "ingestion",
  "processing",
  "generation",
  "review",
  "deployment",
  "brainstorm",
  "brainstorm_apply",
  "agent_runtime",
  "system"
]);

export const jobSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  projectId: idSchema.optional(),
  type: jobTypeSchema,
  title: z.string().min(1),
  status: jobStatusSchema,
  priority: z.number().int(),
  retryCount: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
  actionRequired: z.boolean(),
  actionType: jobActionTypeSchema.optional(),
  resourceType: z.string().min(1).optional(),
  resourceId: idSchema.optional(),
  payload: z.record(z.unknown()).optional(),
  dependencies: z.array(idSchema),
  dependsOnCount: z.number().int().min(0),
  ready: z.boolean(),
  startedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  createdBy: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export type JobSchema = z.infer<typeof jobSchema>;
export type JobStatusSchema = z.infer<typeof jobStatusSchema>;
export type JobActionTypeSchema = z.infer<typeof jobActionTypeSchema>;
export type JobTypeSchema = z.infer<typeof jobTypeSchema>;
