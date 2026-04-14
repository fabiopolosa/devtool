import { z } from "zod";
import { artifactRefSchema, idSchema } from "./common.schema.js";

export const verifierStepResultSchema = z.object({
  stepType: z.enum(["lint", "test", "build", "smoke", "visual", "performance"]),
  command: z.string().min(1),
  status: z.enum(["pass", "fail", "skipped"]),
  exitCode: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  outputRef: z.string().optional()
});

export const verifierResultSchema = z.object({
  runId: idSchema,
  taskId: idSchema,
  overallStatus: z.enum(["pass", "fail", "partial", "skipped"]),
  summary: z.string().min(1),
  steps: z.array(verifierStepResultSchema).min(1),
  artifacts: z.array(artifactRefSchema).default([])
});

export type VerifierResult = z.infer<typeof verifierResultSchema>;
export type VerifierStepResult = z.infer<typeof verifierStepResultSchema>;
