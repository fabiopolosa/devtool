import type { BudgetEnforcementDecision, EscalationDecision } from "../types/policy.js";
import type { OrchestrationRunRecord } from "../types/run.js";

export interface BudgetEnforcementHook {
  evaluate(run: OrchestrationRunRecord): Promise<BudgetEnforcementDecision>;
}

export interface EscalationHook {
  evaluate(run: OrchestrationRunRecord, reasonCode: string): Promise<EscalationDecision>;
}
