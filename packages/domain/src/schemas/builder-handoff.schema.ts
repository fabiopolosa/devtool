import { z } from "zod";
import { artifactRefSchema, idSchema, riskSchema } from "./common.schema.js";

export const builderHandoffSchema = z.object({
  runId: idSchema,
  taskId: idSchema,
  filesChanged: z.array(z.string().min(1)).min(1),
  implementationSummary: z.string().min(1),
  commandsRun: z.array(z.string().min(1)).default([]),
  verificationSnapshot: z.array(
    z.object({
      step: z.string().min(1),
      status: z.enum(["pass", "fail", "skipped"]),
      outputRef: z.string().optional()
    })
  ),
  knownRisks: z.array(riskSchema).default([]),
  suggestedFollowUps: z.array(z.string().min(1)).default([]),
  artifacts: z.array(artifactRefSchema).default([])
});

export type BuilderHandoff = z.infer<typeof builderHandoffSchema>;
