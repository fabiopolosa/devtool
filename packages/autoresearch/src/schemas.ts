import { z } from "zod";
import { autoresearchExperimentRecordSchema } from "@cp/domain";

export const metricDefinitionSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["higher_better", "lower_better"]),
  weight: z.number().positive()
});

export const experimentVariantSchema = z.object({
  variantId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  promptVersionRef: z.string().optional(),
  routingRuleRef: z.string().optional(),
  policyRef: z.string().optional(),
  configPatch: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean()
});

export const experimentVersionRefsSchema = z.object({
  prompt: z
    .object({
      promptId: z.string().min(1),
      version: z.string().min(1),
      contentRef: z.string().min(1)
    })
    .optional(),
  routingPolicy: z
    .object({
      policyId: z.string().min(1),
      version: z.string().min(1),
      contentRef: z.string().min(1)
    })
    .optional(),
  budgetPolicy: z
    .object({
      policyId: z.string().min(1),
      version: z.string().min(1),
      contentRef: z.string().min(1)
    })
    .optional(),
  contextPacketFormat: z
    .object({
      formatId: z.string().min(1),
      version: z.string().min(1),
      contentRef: z.string().min(1)
    })
    .optional()
});

export const experimentDefinitionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1).optional(),
  targetType: z.enum([
    "planner_prompt",
    "routing_rule",
    "retry_policy",
    "budget_policy",
    "context_packet_format",
    "invocation_order"
  ]),
  status: z.enum(["draft", "running", "completed", "rolled_back"]),
  baselineVersionRef: z.string().min(1),
  versionRefs: experimentVersionRefsSchema.optional(),
  metricSet: z.array(metricDefinitionSchema).min(1),
  variants: z.array(experimentVariantSchema).min(1),
  notes: z.string().optional()
});

export const variantRunResultSchema = z.object({
  variantId: z.string().min(1),
  status: z.enum(["running", "completed", "failed"]),
  metrics: z.record(z.string(), z.number()),
  notes: z.string().optional()
});

export const selectionOutcomeSchema = z.object({
  winnerVariantId: z.string().nullable(),
  winnerScore: z.number().nullable(),
  orderedVariants: z.array(
    z.object({
      variantId: z.string().min(1),
      score: z.number(),
      metrics: z.record(z.string(), z.number())
    })
  ),
  regressionSignals: z.array(z.string()),
  rollbackSuggested: z.boolean(),
  rollbackReason: z.string().optional()
});

export const rollbackSuggestionSchema = z.object({
  shouldRollback: z.boolean(),
  reason: z.string().optional(),
  fallbackVariantId: z.string().optional()
});

export const experimentRecordSchema = autoresearchExperimentRecordSchema;

export type MetricDefinitionInput = z.infer<typeof metricDefinitionSchema>;
export type ExperimentVariantInput = z.infer<typeof experimentVariantSchema>;
export type ExperimentVersionRefsInput = z.infer<typeof experimentVersionRefsSchema>;
export type ExperimentDefinitionInput = z.infer<typeof experimentDefinitionSchema>;
export type VariantRunResultInput = z.infer<typeof variantRunResultSchema>;
export type SelectionOutcomeInput = z.infer<typeof selectionOutcomeSchema>;
export type RollbackSuggestionInput = z.infer<typeof rollbackSuggestionSchema>;
