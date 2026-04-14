import { z } from "zod";

export const taskLifecycleSchema = z.object({
  allowedStates: z.array(
    z.enum([
      "draft",
      "proposed",
      "approved",
      "queued",
      "running",
      "waiting_for_research",
      "waiting_for_debug",
      "waiting_for_approval",
      "verification_failed",
      "completed",
      "archived",
      "canceled"
    ])
  ),
  terminalStates: z.array(z.enum(["completed", "archived", "canceled"])),
  requiredForCompletion: z.object({
    verificationPass: z.literal(true),
    approvalsSatisfied: z.literal(true)
  })
});

export const taskRunLifecycleSchema = z.object({
  allowedStates: z.array(z.enum(["queued", "running", "waiting", "failed", "completed", "canceled"])),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0),
    backoffStrategy: z.enum(["fixed", "exponential"])
  })
});

export const roadmapLifecycleSchema = z.object({
  allowedStates: z.array(
    z.enum(["draft", "proposed", "approved", "in_progress", "completed", "converted", "rejected", "archived"])
  )
});

export const approvalLifecycleSchema = z.object({
  allowedStates: z.array(z.enum(["pending", "approved", "rejected", "expired"])),
  defaultState: z.literal("pending")
});

export type TaskLifecycleDefinition = z.infer<typeof taskLifecycleSchema>;
export type TaskRunLifecycleDefinition = z.infer<typeof taskRunLifecycleSchema>;
export type RoadmapLifecycleDefinition = z.infer<typeof roadmapLifecycleSchema>;
export type ApprovalLifecycleDefinition = z.infer<typeof approvalLifecycleSchema>;
