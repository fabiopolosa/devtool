import { z } from "zod";

export const heartbeatIntervalPresetSchema = z.enum(["manual", "1m", "5m", "15m", "30m", "1h"]);
export const heartbeatTriggerPresetSchema = z.enum([
  "manual",
  "on_startup",
  "after_deploy",
  "after_failure"
]);

export const heartbeatPolicySchema = z.object({
  interval: heartbeatIntervalPresetSchema.default("manual"),
  triggers: z.array(heartbeatTriggerPresetSchema).default(["manual"]),
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({})
});

export type HeartbeatPolicySchema = z.infer<typeof heartbeatPolicySchema>;
export type HeartbeatIntervalPresetSchema = z.infer<typeof heartbeatIntervalPresetSchema>;
export type HeartbeatTriggerPresetSchema = z.infer<typeof heartbeatTriggerPresetSchema>;
