import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const knowledgeScopeSchema = z.enum(["system", "tenant", "project"]);

const embeddingVectorSchema = z.array(z.number()).min(1);

export const knowledgeNodeSchema = z.object({
  id: idSchema,
  tenantId: idSchema.optional(),
  projectId: idSchema.optional(),
  scope: knowledgeScopeSchema,
  path: z
    .string()
    .min(2)
    .regex(/^\/[a-z0-9/_\-.]+$/i, "path must be absolute and slash-scoped"),
  content: z.string().min(1),
  embedding: embeddingVectorSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const createKnowledgeNodeSchema = knowledgeNodeSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true
});

export const updateKnowledgeNodeSchema = createKnowledgeNodeSchema.partial();

export type KnowledgeScopeSchema = z.infer<typeof knowledgeScopeSchema>;
export type KnowledgeNodeSchema = z.infer<typeof knowledgeNodeSchema>;
export type CreateKnowledgeNodeSchema = z.infer<typeof createKnowledgeNodeSchema>;
export type UpdateKnowledgeNodeSchema = z.infer<typeof updateKnowledgeNodeSchema>;
