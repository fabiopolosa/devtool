import { z } from "zod";
import { budgetLimitsSchema, idSchema, repoScopeSchema, riskSchema } from "./common.schema.js";

export const taskSpecSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  type: z.enum(["feature", "bugfix", "refactor", "research", "ops"]),
  goal: z.string().min(1),
  targetRepos: z.array(repoScopeSchema).min(1),
  scopeInclude: z.array(z.string().min(1)).min(1),
  scopeExclude: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  verificationPlan: z.array(z.string().min(1)).min(1),
  budgetLimits: budgetLimitsSchema,
  proposedRouting: z.object({
    primaryRole: z.string().min(1),
    supportingRoles: z.array(z.string().min(1)).default([]),
    capabilityNeeds: z.array(z.string().min(1)).min(1)
  }),
  risks: z.array(riskSchema).default([]),
  approvalsRequired: z.boolean(),
  dependencyTaskIds: z.array(idSchema).default([]),
  skills: z.array(z.string().min(1)).default([]),
  agentId: idSchema.optional()
});

export type TaskSpec = z.infer<typeof taskSpecSchema>;
