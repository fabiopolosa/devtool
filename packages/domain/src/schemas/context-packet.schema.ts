import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const contextPacketChunkSchema = z.object({
  chunkId: idSchema,
  memoryEntryId: idSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  category: z.string().min(1),
  sourceRef: z.string().optional(),
  confidence: z.number().min(0).max(1),
  tokenEstimate: z.number().int().nonnegative()
});

export const contextPacketSkillInstructionSchema = z.object({
  name: z.string().min(1),
  instructions: z.string().min(1),
  repositoryUrl: z.string().optional(),
  tokenEstimate: z.number().int().nonnegative()
});

export const contextPacketAgentContextSchema = z.object({
  agentId: idSchema,
  agentName: z.string().min(1),
  role: z.string().min(1),
  runtimeConfig: z.record(z.unknown()).default({}),
  runtimeSummary: z.string().min(1),
  desiredSkills: z.array(z.string().min(1)).default([])
});

export const contextPacketSecretReferenceSchema = z.object({
  name: z.string().min(1),
  scope: z.string().min(1),
  description: z.string().optional()
});

export const contextPacketEnvironmentSchema = z.object({
  environmentId: idSchema,
  name: z.string().min(1),
  status: z.string().min(1),
  machines: z.array(
    z.object({
      machineId: idSchema,
      name: z.string().min(1),
      status: z.string().min(1),
      cpuCores: z.number().int().nonnegative(),
      gpuCount: z.number().int().nonnegative(),
      ramGb: z.number().int().nonnegative(),
      agents: z.array(z.string().min(1)).default([]),
      services: z.array(z.string().min(1)).default([])
    })
  )
});

export const contextPacketVersionSnapshotSchema = z.object({
  snapshotId: idSchema,
  label: z.string().min(1),
  trigger: z.string().min(1),
  localRepositoryId: idSchema,
  taskId: idSchema.optional()
});

export const contextPacketNoteSchema = z.object({
  noteId: idSchema,
  path: z.string().min(1),
  title: z.string().min(1),
  scope: z.literal("context-notes"),
  excerpt: z.string().min(1),
  score: z.number().min(0).max(1),
  sourceType: z.literal("context-note").optional()
});

export const contextPacketSchema = z.object({
  packetId: idSchema,
  projectId: idSchema,
  taskId: idSchema.optional(),
  role: z.enum([
    "planner",
    "codex_builder",
    "codex_refactor",
    "claude_debugger",
    "gemini_researcher",
    "image_designer",
    "image_editor",
    "verifier"
  ]),
  query: z.string().min(1),
  chunks: z.array(contextPacketChunkSchema),
  skillInstructions: z.array(contextPacketSkillInstructionSchema).default([]),
  agentContext: contextPacketAgentContextSchema.optional(),
  secretReferences: z.array(contextPacketSecretReferenceSchema).default([]),
  environmentContext: contextPacketEnvironmentSchema.optional(),
  versionSnapshots: z.array(contextPacketVersionSnapshotSchema).default([]),
  contextNotes: z.array(contextPacketNoteSchema).default([]),
  compactSummary: z.string().min(1),
  sourceChunkIds: z.array(idSchema),
  tokenBudgetUsed: z.number().int().nonnegative(),
  generatedAt: z.string().datetime({ offset: true })
});

export type ContextPacket = z.infer<typeof contextPacketSchema>;
