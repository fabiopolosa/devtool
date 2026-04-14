import { z } from "zod";
import { budgetLimitsSchema } from "@cp/domain";

export const budgetEnforcementDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1),
  nextBudget: budgetLimitsSchema.optional(),
  requiredApproval: z.boolean().default(false)
});

export const escalationDecisionSchema = z.object({
  shouldEscalate: z.boolean(),
  reasonCode: z.string().min(1),
  targetRole: z.string().min(1).optional(),
  stopRun: z.boolean().default(false)
});

export type BudgetEnforcementDecision = z.infer<typeof budgetEnforcementDecisionSchema>;
export type EscalationDecision = z.infer<typeof escalationDecisionSchema>;
