import { z } from "zod";
import { heartbeatPolicySchema } from "./heartbeat-policy.schema.js";
import { agentLaunchModeSchema, agentRuntimeHostSchema } from "./runtime-profile.schema.js";

export const projectRuntimeProfileSchema = z.object({
  primaryAgentId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  defaultHost: agentRuntimeHostSchema.default("local_worker"),
  defaultExecutionMode: agentLaunchModeSchema.default("queued"),
  heartbeatPolicy: heartbeatPolicySchema.default({
    interval: "manual",
    triggers: ["manual"],
    enabled: true,
    metadata: {}
  }),
  agentSelectionPolicy: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({})
});

export type ProjectRuntimeProfileSchema = z.infer<typeof projectRuntimeProfileSchema>;
