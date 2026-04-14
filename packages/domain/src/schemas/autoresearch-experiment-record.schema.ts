import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const autoresearchExperimentRecordSchema = z.object({
  experimentId: idSchema,
  runId: idSchema,
  targetType: z.enum([
    "planner_prompt",
    "routing_rule",
    "retry_policy",
    "budget_policy",
    "context_packet_format",
    "invocation_order"
  ]),
  variantId: z.string().min(1),
  baselineRef: z.string().min(1),
  metrics: z.record(z.string(), z.number()),
  outcome: z.enum(["candidate", "winner", "rejected", "rolled_back"]),
  notes: z.string().min(1)
});

export type AutoResearchExperimentRecord = z.infer<typeof autoresearchExperimentRecordSchema>;
