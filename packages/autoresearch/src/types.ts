import type { AuditMetadata, AutoResearchExperiment, AutoResearchRun, ID } from "@cp/domain";
import type { ExperimentVersionRefs } from "./versioning.js";

export type AutoResearchTargetType =
  | "planner_prompt"
  | "routing_rule"
  | "retry_policy"
  | "budget_policy"
  | "context_packet_format"
  | "invocation_order";

export type MetricDirection = "higher_better" | "lower_better";

export interface MetricDefinition {
  name: string;
  direction: MetricDirection;
  weight: number;
}

export interface ExperimentVariant {
  variantId: string;
  label: string;
  description?: string;
  promptVersionRef?: string;
  routingRuleRef?: string;
  policyRef?: string;
  configPatch?: Record<string, unknown>;
  enabled: boolean;
}

export interface ExperimentDefinition extends AuditMetadata {
  id: ID;
  projectId?: ID;
  targetType: AutoResearchTargetType;
  status: AutoResearchExperiment["status"];
  baselineVersionRef: string;
  versionRefs?: ExperimentVersionRefs;
  metricSet: MetricDefinition[];
  variants: ExperimentVariant[];
  notes?: string;
}

export interface ExperimentRunContext {
  experimentId: ID;
  projectId?: ID;
  taskId?: ID;
  runId?: ID;
  targetType: AutoResearchTargetType;
  variantId: string;
  promptVersionRef?: string;
  routingRuleRef?: string;
  policyRef?: string;
}

export interface VariantRunResult {
  variantId: string;
  status: AutoResearchRun["status"];
  metrics: Record<string, number>;
  notes?: string;
}

export interface SelectionOutcome {
  winnerVariantId: string | null;
  winnerScore: number | null;
  orderedVariants: Array<{
    variantId: string;
    score: number;
    metrics: Record<string, number>;
  }>;
  regressionSignals: string[];
  rollbackSuggested: boolean;
  rollbackReason?: string;
}

export interface RollbackSuggestion {
  shouldRollback: boolean;
  reason?: string;
  fallbackVariantId?: string;
}

export interface ExperimentStatusSummary {
  experimentId: ID;
  status: ExperimentDefinition["status"];
  totalRuns: number;
  candidateRuns: number;
  winnerVariantId?: string;
  lastUpdatedAt: string;
}
