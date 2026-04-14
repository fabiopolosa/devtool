import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const roadmapProposalSchema = z.object({
  proposalId: idSchema,
  projectId: idSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  items: z
    .array(
      z.object({
        id: idSchema,
        title: z.string().min(1),
        description: z.string().min(1),
        priority: z.number().int().min(0).max(100),
        dependencies: z.array(idSchema).default([]),
        acceptanceCriteria: z.array(z.string().min(1)).default([]),
        requiresApproval: z.boolean().default(true)
      })
    )
    .min(1),
  proposedBy: z.string().min(1)
});

export type RoadmapProposal = z.infer<typeof roadmapProposalSchema>;
