import { z } from "zod";
import { budgetLimitsSchema, idSchema } from "./common.schema.js";

export const routingDecisionSchema = z.object({
  decisionId: idSchema,
  taskId: idSchema,
  selectedRole: z.string().min(1),
  selectedCapability: z.string().min(1),
  selectedModelId: z.string().min(1),
  fallbackModelIds: z.array(z.string().min(1)).default([]),
  reasonCodes: z.array(z.string().min(1)).min(1),
  budgetApplied: budgetLimitsSchema,
  policyVersion: z.string().min(1)
});

export type RoutingDecision = z.infer<typeof routingDecisionSchema>;
