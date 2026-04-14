import { z } from "zod";
import { taskSpecSchema } from "./task-spec.schema.js";

export const plannerOutputSchema = z.object({
  requestId: z.string().min(1),
  mode: z.enum(["roadmap_proposal", "task_spec", "phased_plan"]),
  normalizedIntent: z.string().min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  roadmapCandidateIds: z.array(z.string().min(1)).default([]),
  taskSpecs: z.array(taskSpecSchema).default([]),
  unresolvedQuestions: z.array(z.string().min(1)).default([])
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
