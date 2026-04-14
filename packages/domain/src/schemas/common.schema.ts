import { z } from "zod";

export const idSchema = z.string().min(1);
export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const artifactRefSchema = z.object({
  artifactId: idSchema,
  uri: z.string().min(1),
  type: z.string().min(1),
  summary: z.string().min(1)
});

export const repoScopeSchema = z.object({
  repositoryId: idSchema,
  paths: z.array(z.string().min(1)).default([])
});

export const confidenceSchema = z.number().min(0).max(1);

export const budgetLimitsSchema = z.object({
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxLatencyMs: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional(),
  maxRetries: z.number().int().min(0).default(1)
});

export const riskSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  mitigation: z.string().min(1)
});
