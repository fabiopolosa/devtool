import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const secretScopeSchema = z.enum(["global", "project", "repository", "provider", "environment"]);

export const secretConfigSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  encryptedValue: z.string().min(1),
  scope: secretScopeSchema,
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export type SecretConfigSchema = z.infer<typeof secretConfigSchema>;
