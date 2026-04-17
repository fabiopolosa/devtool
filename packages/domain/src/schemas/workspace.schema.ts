import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const workspaceModeSchema = z.enum(["local", "remote"]);

export const workspaceRuntimeStatusSchema = z.enum([
  "stopped",
  "starting",
  "running",
  "deploying",
  "unknown",
  "error"
]);

export const workspaceSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  projectId: idSchema,
  mode: workspaceModeSchema,
  localPath: z.string().min(1).optional(),
  runtimeStatus: workspaceRuntimeStatusSchema,
  runtimeDetails: z.record(z.unknown()).default({}),
  lastStartedAt: isoDateTimeSchema.optional(),
  lastStoppedAt: isoDateTimeSchema.optional(),
  lastDeployedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type WorkspaceSchema = z.infer<typeof workspaceSchema>;
export type WorkspaceModeSchema = z.infer<typeof workspaceModeSchema>;
export type WorkspaceRuntimeStatusSchema = z.infer<typeof workspaceRuntimeStatusSchema>;
