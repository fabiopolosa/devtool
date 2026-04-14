import { z } from "zod";
import { artifactRefSchema, idSchema, riskSchema } from "./common.schema.js";

export const refactorHandoffSchema = z.object({
  runId: idSchema,
  taskId: idSchema,
  refactorGoals: z.array(z.string().min(1)).min(1),
  behaviorPreservationNotes: z.array(z.string().min(1)).min(1),
  filesChanged: z.array(z.string().min(1)).min(1),
  commandsRun: z.array(z.string().min(1)).default([]),
  knownRisks: z.array(riskSchema).default([]),
  artifacts: z.array(artifactRefSchema).default([])
});

export type RefactorHandoff = z.infer<typeof refactorHandoffSchema>;
