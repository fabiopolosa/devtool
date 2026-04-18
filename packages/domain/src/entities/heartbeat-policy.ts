export type HeartbeatIntervalPreset = "manual" | "1m" | "5m" | "15m" | "30m" | "1h";
export type HeartbeatTriggerPreset = "manual" | "on_startup" | "after_deploy" | "after_failure";

export interface HeartbeatPolicy {
  interval: HeartbeatIntervalPreset;
  triggers: HeartbeatTriggerPreset[];
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export const buildHeartbeatPolicy = (
  policy: Partial<HeartbeatPolicy> = {}
): HeartbeatPolicy => ({
  interval: policy.interval ?? "manual",
  triggers: policy.triggers ?? ["manual"],
  enabled: policy.enabled ?? true,
  metadata: policy.metadata ?? {}
});
