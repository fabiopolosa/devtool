import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const skillSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  repositoryUrl: z.string().min(1),
  version: z.string().min(1),
  installed: z.boolean(),
  categories: z.array(z.string().min(1)).default([]),
  instructions: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export type SkillSchema = z.infer<typeof skillSchema>;
