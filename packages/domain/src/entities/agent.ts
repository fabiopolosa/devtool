import type { CapabilityClass } from "../capabilities.js";
import type { HeartbeatPolicy } from "./heartbeat-policy.js";
import type { AgentRuntimeProfile } from "./runtime-profile.js";

export type AgentRuntimeAdapterType = "legacy_cli" | "custom_cli" | "mcp_runtime";
export type AgentConfigStatus = "active" | "paused" | "degraded" | "error";

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  icon: string;
  description: string;
  adapterType: AgentRuntimeAdapterType;
  desiredSkills: string[];
  reportTo?: string;
  runtimeConfig: Record<string, unknown>;
  runtimeProfile?: AgentRuntimeProfile;
  heartbeatPolicy?: HeartbeatPolicy;
  capabilities: CapabilityClass[];
  createdAt: string;
  updatedAt: string;
  status: AgentConfigStatus;
}
