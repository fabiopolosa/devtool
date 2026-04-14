import { z } from "zod";

export const projectConfigSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  defaultBudgetPolicyVersion: z.string().min(1),
  defaultRoutingPolicyVersion: z.string().min(1),
  memoryPolicy: z.object({
    crossProjectSharing: z.boolean().default(false),
    allowedProjectIds: z.array(z.string().min(1)).default([]),
    freshnessTtlHours: z.number().int().positive().default(168)
  }),
  verificationPolicy: z.object({
    requiredSteps: z.array(z.enum(["lint", "test", "build", "smoke", "visual", "performance"])).min(1),
    failOnAnyStep: z.boolean().default(true)
  }),
  providerDefaults: z.object({
    capabilityBindings: z.record(z.string(), z.object({
      primaryModel: z.string().min(1),
      fallbackModels: z.array(z.string().min(1)).default([])
    }))
  })
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
