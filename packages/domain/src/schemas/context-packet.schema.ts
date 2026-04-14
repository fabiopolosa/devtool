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
  compactSummary: z.string().min(1),
  sourceChunkIds: z.array(idSchema),
  tokenBudgetUsed: z.number().int().nonnegative(),
  generatedAt: z.string().datetime({ offset: true })
});

export type ContextPacket = z.infer<typeof contextPacketSchema>;
