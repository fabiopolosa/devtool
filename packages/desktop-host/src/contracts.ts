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
