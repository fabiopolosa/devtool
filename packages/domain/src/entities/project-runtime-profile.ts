import { buildHeartbeatPolicy, type HeartbeatPolicy } from "./heartbeat-policy.js";
import type { AgentLaunchMode, AgentRuntimeHost } from "./runtime-profile.js";

export interface ProjectRuntimeProfile {
  primaryAgentId?: string;
  workspaceId?: string;
  defaultHost: AgentRuntimeHost;
  defaultExecutionMode: AgentLaunchMode;
  heartbeatPolicy: HeartbeatPolicy;
  agentSelectionPolicy: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export const buildProjectRuntimeProfile = (
  profile: Partial<ProjectRuntimeProfile> = {}
): ProjectRuntimeProfile => ({
  ...(profile.primaryAgentId ? { primaryAgentId: profile.primaryAgentId } : {}),
  ...(profile.workspaceId ? { workspaceId: profile.workspaceId } : {}),
  defaultHost: profile.defaultHost ?? "local_worker",
  defaultExecutionMode: profile.defaultExecutionMode ?? "queued",
  heartbeatPolicy: profile.heartbeatPolicy ?? buildHeartbeatPolicy(),
  agentSelectionPolicy: profile.agentSelectionPolicy ?? {},
  metadata: profile.metadata ?? {}
});
