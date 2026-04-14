import { z } from "zod";
import { artifactRefSchema, confidenceSchema, idSchema, riskSchema } from "./common.schema.js";

export const debuggerHandoffSchema = z.object({
  runId: idSchema,
  taskId: idSchema,
  suspectedRootCause: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  fixStrategy: z.string().min(1),
  confidence: confidenceSchema,
  remainingUncertainty: z.array(z.string().min(1)).default([]),
  risks: z.array(riskSchema).default([]),
  artifacts: z.array(artifactRefSchema).default([])
});

export type DebuggerHandoff = z.infer<typeof debuggerHandoffSchema>;
