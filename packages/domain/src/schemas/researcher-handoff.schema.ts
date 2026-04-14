import { z } from "zod";
import { artifactRefSchema, idSchema } from "./common.schema.js";

export const researcherHandoffSchema = z.object({
  runId: idSchema,
  taskId: idSchema,
  questionAnswered: z.string().min(1),
  sourcesConsulted: z.array(
    z.object({
      title: z.string().min(1),
      url: z.string().url(),
      sourceType: z.enum(["official_docs", "spec", "release_note", "issue", "article"])
    })
  ),
  recommendedPath: z.string().min(1),
  caveats: z.array(z.string().min(1)).default([]),
  breakingChangeRisk: z.enum(["low", "medium", "high"]),
  artifacts: z.array(artifactRefSchema).default([])
});

export type ResearcherHandoff = z.infer<typeof researcherHandoffSchema>;
