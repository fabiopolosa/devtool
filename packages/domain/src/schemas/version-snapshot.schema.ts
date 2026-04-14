import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const versionSnapshotFileSchema = z.object({
  path: z.string().min(1),
  contentHash: z.string().min(1),
  content: z.string()
});

export const versionSnapshotTriggerSchema = z.enum(["task_start", "task_end", "manual"]);

export const versionSnapshotSchema = z.object({
  id: idSchema,
  localRepositoryId: idSchema,
  taskId: idSchema.optional(),
  label: z.string().min(1),
  trigger: versionSnapshotTriggerSchema,
  files: z.array(versionSnapshotFileSchema).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export type VersionSnapshotSchema = z.infer<typeof versionSnapshotSchema>;
