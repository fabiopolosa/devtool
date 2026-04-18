import type { AgentRuntimeAdapterType } from "./agent.js";

export type AgentRuntimeKind =
  | "desktop_cli"
  | "server_api"
  | "mcp_bridge"
  | "custom_command"
  | "legacy_command";

export type AgentRuntimeVendor =
  | "openai_codex"
  | "claude_code"
  | "gemini_cli"
  | "generic_cli"
  | "openai_api"
  | "anthropic_api"
  | "gemini_api"
  | "generic_api";

export type AgentRuntimeHost = "desktop_app" | "local_worker" | "remote_worker" | "api";
export type AgentLaunchMode = "interactive" | "headless" | "queued";

export const agentRuntimeAdapterTypeToRuntimeKindMap = {
  mcp_runtime: "mcp_bridge",
  custom_cli: "custom_command",
  legacy_cli: "legacy_command"
} as const satisfies Record<AgentRuntimeAdapterType, AgentRuntimeKind>;

export const resolveAgentRuntimeKind = (adapterType: AgentRuntimeAdapterType): AgentRuntimeKind =>
  agentRuntimeAdapterTypeToRuntimeKindMap[adapterType];

export interface AgentRuntimeProfile {
  runtimeKind: AgentRuntimeKind;
  vendor: AgentRuntimeVendor;
  host: AgentRuntimeHost;
  launchMode: AgentLaunchMode;
  command?: string;
  args: string[];
  cwd?: string;
  mcpServerRef?: string;
  apiConfigRef?: string;
  workerPoolSize?: number;
  metadata: Record<string, unknown>;
}

export const buildAgentRuntimeProfile = (
  adapterType: AgentRuntimeAdapterType,
  profile: Partial<AgentRuntimeProfile> = {}
): AgentRuntimeProfile => ({
  runtimeKind: profile.runtimeKind ?? resolveAgentRuntimeKind(adapterType),
  vendor: profile.vendor ?? "generic_cli",
  host: profile.host ?? "local_worker",
  launchMode: profile.launchMode ?? "headless",
  ...(profile.command ? { command: profile.command } : {}),
  args: profile.args ?? [],
  ...(profile.cwd ? { cwd: profile.cwd } : {}),
  ...(profile.mcpServerRef ? { mcpServerRef: profile.mcpServerRef } : {}),
  ...(profile.apiConfigRef ? { apiConfigRef: profile.apiConfigRef } : {}),
  ...(profile.workerPoolSize !== undefined ? { workerPoolSize: profile.workerPoolSize } : {}),
  metadata: profile.metadata ?? {}
});
