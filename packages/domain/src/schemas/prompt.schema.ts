import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const promptRegistryScopeSchema = z.enum(["system", "tenant", "project"]);
export const promptRegistryStatusSchema = z.enum(["active", "draft", "deprecated"]);

export const promptRegistrySchema = z.object({
  id: idSchema,
  type: z.string().min(1),
  scope: promptRegistryScopeSchema,
  target: z.string().min(1),
  version: z.string().min(1),
  content: z.string().min(1),
  status: promptRegistryStatusSchema,
  tenantId: idSchema.optional(),
  projectId: idSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export const promptRegistryCreateSchema = promptRegistrySchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true
});

export const promptRegistryUpdateSchema = promptRegistryCreateSchema.partial().extend({
  status: promptRegistryStatusSchema.optional()
});

export type PromptRegistrySchema = z.infer<typeof promptRegistrySchema>;
