import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const mcpConnectionSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  baseUrl: z.string().url(),
  authSecretRef: z.string().min(1).optional(),
  enabled: z.boolean(),
  status: z.enum(["unknown", "healthy", "degraded", "down", "disabled"]),
  capabilities: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.unknown()).default({}),
  lastCheckedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const mcpDelegationRunSchema = z.object({
  id: idSchema,
  connectionId: idSchema,
  operation: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  status: z.enum(["queued", "running", "completed", "failed"]),
  response: z.record(z.unknown()).optional(),
  error: z.string().min(1).optional(),
  startedAt: isoDateTimeSchema.optional(),
  endedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type McpConnectionSchema = z.infer<typeof mcpConnectionSchema>;
export type McpDelegationRunSchema = z.infer<typeof mcpDelegationRunSchema>;
