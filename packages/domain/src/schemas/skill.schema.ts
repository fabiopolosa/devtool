import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const skillScopeSchema = z.enum(["system", "tenant", "user"]);
export const skillSourceTypeSchema = z.enum(["github", "file", "zip"]);
export const skillValidationStatusSchema = z.enum(["pending", "valid", "invalid"]);

export const skillSandboxProfileSchema = z.object({
  filesystem: z.enum(["read_only", "workspace_only", "full"]),
  network: z.boolean(),
  networkAllowlist: z.array(z.string().min(1)).default([]),
  process: z.boolean()
});

export const skillExecutionConfigSchema = z.object({
  commandAllowlist: z.array(z.string().min(1)).default([]),
  requireConfirmation: z.boolean().default(true),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(45_000),
  entryCommand: z.string().min(1).optional(),
  entryArgs: z.array(z.string().min(1)).default([])
});

export const skillVersionRecordSchema = z.object({
  version: z.string().min(1),
  sourceRef: z.string().min(1).optional(),
  installedAt: z.string().datetime({ offset: true }),
  installedBy: z.string().min(1),
  notes: z.string().min(1).optional()
});

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
  updatedBy: z.string().min(1),
  scope: skillScopeSchema.default("tenant"),
  sourceType: skillSourceTypeSchema.default("github"),
  sourceRef: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  validationStatus: skillValidationStatusSchema.default("pending"),
  validationErrors: z.array(z.string().min(1)).default([]),
  validationWarnings: z.array(z.string().min(1)).default([]),
  lastValidatedAt: z.string().datetime({ offset: true }).optional(),
  sandboxProfile: skillSandboxProfileSchema.default({
    filesystem: "workspace_only",
    network: false,
    networkAllowlist: [],
    process: true
  }),
  executionConfig: skillExecutionConfigSchema.default({
    commandAllowlist: [],
    requireConfirmation: true,
    timeoutMs: 45_000,
    entryArgs: []
  }),
  currentVersion: z.string().min(1).optional(),
  versionHistory: z.array(skillVersionRecordSchema).default([]),
  metadata: z.record(z.unknown()).default({})
});

export type SkillSchema = z.infer<typeof skillSchema>;
