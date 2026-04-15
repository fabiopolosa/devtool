import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const usageEventSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  projectId: idSchema.optional(),
  jobId: idSchema.optional(),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type UsageEventRecord = z.infer<typeof usageEventSchema>;
