import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.schema.js";

export const brainstormQuestionSchema = z.object({
  id: idSchema,
  question: z.string().min(1),
  rationale: z.string().min(1)
});

export const brainstormRoadmapTaskSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  dependencies: z.array(idSchema).default([]),
  targetRepos: z.array(z.string().min(1)).default([]),
  suggestedAgentRole: z.string().min(1),
  suggestedSkills: z.array(z.string().min(1)).default([])
});

export const brainstormSelectedSubpromptSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().min(1),
  prompt: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  sourcePath: z.string().min(1),
  enabled: z.boolean()
});

export const brainstormPlanPayloadSchema = z.object({
  recommendedStack: z.object({
    database: z.string().min(1),
    backend: z.string().min(1),
    frontend: z.string().min(1),
    llmProviders: z.array(z.string().min(1)).default([]),
    vectorStore: z.string().min(1)
  }),
  architecture: z.object({
    repositoryStrategy: z.enum(["monorepo", "microrepo", "hybrid"]),
    packageLayout: z.array(z.string().min(1)).default([]),
    rationale: z.string().min(1)
  }),
  suggestedAgents: z
    .array(
      z.object({
        role: z.string().min(1),
        purpose: z.string().min(1),
        capabilities: z.array(z.string().min(1)).default([])
      })
    )
    .default([]),
  suggestedSkills: z
    .array(
      z.object({
        name: z.string().min(1),
        repositoryUrl: z.string().min(1),
        reason: z.string().min(1)
      })
    )
    .default([]),
  providerBindings: z
    .array(
      z.object({
        capabilityClass: z.string().min(1),
        primaryProvider: z.string().min(1),
        fallbackProviders: z.array(z.string().min(1)).default([]),
        primaryModelHint: z.string().min(1).optional()
      })
    )
    .default([]),
  roadmap: z.array(brainstormRoadmapTaskSchema).default([]),
  assumptions: z.array(z.string().min(1)).default([]),
  risks: z.array(z.string().min(1)).default([]),
  composedPrompt: z.string().min(1),
  selectedSubprompts: z.array(brainstormSelectedSubpromptSchema).default([])
});

export const brainstormPlanSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  title: z.string().min(1),
  executiveSummary: z.string().min(1),
  plan: brainstormPlanPayloadSchema,
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export const brainstormSessionSchema = z.object({
  id: idSchema,
  threadId: idSchema.optional(),
  projectId: idSchema.optional(),
  status: z.enum(["collecting", "planned", "approved", "applied", "archived"]),
  projectIntent: z.string().min(1),
  selectedSubpromptIds: z.array(idSchema).default([]),
  questions: z.array(brainstormQuestionSchema).default([]),
  answers: z.record(z.string()).default({}),
  planId: idSchema.optional(),
  approvedAt: isoDateTimeSchema.optional(),
  appliedAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1)
});

export type BrainstormQuestionSchema = z.infer<typeof brainstormQuestionSchema>;
export type BrainstormRoadmapTaskSchema = z.infer<typeof brainstormRoadmapTaskSchema>;
export type BrainstormPlanPayloadSchema = z.infer<typeof brainstormPlanPayloadSchema>;
export type BrainstormPlanSchema = z.infer<typeof brainstormPlanSchema>;
export type BrainstormSessionSchema = z.infer<typeof brainstormSessionSchema>;
