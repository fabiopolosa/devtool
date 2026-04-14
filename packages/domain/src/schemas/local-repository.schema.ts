import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const localRepositoryStatusSchema = z.enum(["active", "disabled", "error"]);

export const localRepositorySchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  rootPath: z.string().min(1),
  description: z.string().min(1),
  status: localRepositoryStatusSchema,
  detectedGit: z.boolean(),
  currentBranch: z.string().min(1).optional(),
  lastCommitSha: z.string().min(1).optional(),
  indexedFileCount: z.number().int().nonnegative(),
  lastScannedAt: z.string().datetime({ offset: true }).optional(),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export type LocalRepositorySchema = z.infer<typeof localRepositorySchema>;
