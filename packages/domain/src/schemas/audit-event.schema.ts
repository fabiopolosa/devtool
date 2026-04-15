import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const auditEventSchema = z.object({
  id: idSchema,
  tenantId: idSchema.optional(),
  projectId: idSchema.optional(),
  jobId: idSchema.optional(),
  userId: idSchema.optional(),
  action: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: idSchema.optional(),
  status: z.enum(["success", "failure"]),
  occurredAt: isoDateTimeSchema,
  metadata: z.record(z.unknown()).default({}),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type AuditEventRecord = z.infer<typeof auditEventSchema>;
