import type { CapabilityClass } from "../capabilities.js";

export type AgentRuntimeAdapterType = "paperclip_cli" | "custom_cli" | "mcp_runtime";
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
  capabilities: CapabilityClass[];
  createdAt: string;
  updatedAt: string;
  status: AgentConfigStatus;
}
