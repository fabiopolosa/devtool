import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const subpromptCategorySchema = z.enum([
  "stack",
  "architecture",
  "agents",
  "skills",
  "conventions",
  "planning",
  "other"
]);

export const subpromptSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  category: subpromptCategorySchema,
  summary: z.string().min(1),
  prompt: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  sourcePath: z.string().min(1),
  enabled: z.boolean()
});

export type SubpromptSchema = z.infer<typeof subpromptSchema>;
