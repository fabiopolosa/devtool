import { z } from "zod";

export const agentRuntimeKindSchema = z.enum([
  "desktop_cli",
  "server_api",
  "mcp_bridge",
  "custom_command",
  "legacy_command"
]);

export const agentRuntimeVendorSchema = z.enum([
  "openai_codex",
  "claude_code",
  "gemini_cli",
  "generic_cli",
  "openai_api",
  "anthropic_api",
  "gemini_api",
  "generic_api"
]);

export const agentRuntimeHostSchema = z.enum(["desktop_app", "local_worker", "remote_worker", "api"]);
export const agentLaunchModeSchema = z.enum(["interactive", "headless", "queued"]);

export const agentRuntimeProfileSchema = z.object({
  runtimeKind: agentRuntimeKindSchema,
  vendor: agentRuntimeVendorSchema,
  host: agentRuntimeHostSchema,
  launchMode: agentLaunchModeSchema,
  command: z.string().min(1).optional(),
  args: z.array(z.string().min(1)).default([]),
  cwd: z.string().min(1).optional(),
  mcpServerRef: z.string().min(1).optional(),
  apiConfigRef: z.string().min(1).optional(),
  workerPoolSize: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).default({})
});

export type AgentRuntimeProfileSchema = z.infer<typeof agentRuntimeProfileSchema>;
export type AgentRuntimeKindSchema = z.infer<typeof agentRuntimeKindSchema>;
export type AgentRuntimeVendorSchema = z.infer<typeof agentRuntimeVendorSchema>;
export type AgentRuntimeHostSchema = z.infer<typeof agentRuntimeHostSchema>;
export type AgentLaunchModeSchema = z.infer<typeof agentLaunchModeSchema>;
