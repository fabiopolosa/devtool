import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";
import { knowledgeScopeSchema } from "./knowledge.schema.js";

export const knowledgeConfigSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  projectId: idSchema.optional(),
  scope: knowledgeScopeSchema,
  autoCapture: z.boolean(),
  captureModes: z.array(z.string().min(1)).default(["generation_output"]),
  requireApproval: z.boolean(),
  maxNodes: z.number().int().min(1).max(100),
  relevanceThreshold: z.number().min(0).max(1),
  versioning: z.boolean(),
  requireReview: z.boolean(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const createKnowledgeConfigSchema = knowledgeConfigSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true
});

export const updateKnowledgeConfigSchema = createKnowledgeConfigSchema.partial();

export type KnowledgeConfigSchema = z.infer<typeof knowledgeConfigSchema>;
export type CreateKnowledgeConfigSchema = z.infer<typeof createKnowledgeConfigSchema>;
export type UpdateKnowledgeConfigSchema = z.infer<typeof updateKnowledgeConfigSchema>;
