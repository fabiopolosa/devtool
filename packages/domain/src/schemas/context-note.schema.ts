import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const contextNoteSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  projectId: idSchema,
  path: z
    .string()
    .min(2)
    .regex(/^\/[a-z0-9/_\-.]+$/i, "path must be absolute and slash-scoped"),
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  linkRefs: z.array(z.string().min(1)).default([]),
  pinned: z.boolean(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const createContextNoteSchema = contextNoteSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true
});

export const updateContextNoteSchema = createContextNoteSchema.partial();

export type ContextNoteSchema = z.infer<typeof contextNoteSchema>;
export type CreateContextNoteSchema = z.infer<typeof createContextNoteSchema>;
export type UpdateContextNoteSchema = z.infer<typeof updateContextNoteSchema>;
