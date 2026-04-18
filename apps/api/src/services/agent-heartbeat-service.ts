import type { AgentConfig } from "@cp/domain";
import { normalizeHeartbeatPolicy } from "@cp/agents";
import { agentsService } from "./agents-service.js";

export type AgentHeartbeatIntervalPreset = "manual" | "1m" | "5m" | "15m" | "30m" | "1h";
export type AgentHeartbeatTriggerPreset = "manual" | "on_startup" | "after_deploy" | "after_failure";

export interface AgentHeartbeatDispatchMetadata {
  reason?: string;
  projectId?: string;
  trigger?: AgentHeartbeatTriggerPreset;
  metadata?: Record<string, unknown>;
}

export interface AgentHeartbeatDispatchInput extends AgentHeartbeatDispatchMetadata {
  tenantId: string;
  actor: string;
  agentId: string;
  timeoutMs?: number;
}

export interface AgentHeartbeatDispatchResult {
  agentId: string;
  jobId: string;
  createdAt: string;
  result: unknown;
}

export interface AgentHeartbeatSweepInput extends AgentHeartbeatDispatchMetadata {
  tenantId: string;
  actor: string;
  trigger?: AgentHeartbeatTriggerPreset;
  limit?: number;
  timeoutMs?: number;
}

export interface AgentHeartbeatSweepSummary {
  items: Array<
    | {
        agentId: string;
        status: "dispatched";
        jobId: string;
        reason: string;
        trigger?: AgentHeartbeatTriggerPreset;
      }
    | {
        agentId: string;
        status: "skipped";
        reason: string;
      }
    | {
        agentId: string;
        status: "error";
        reason: string;
      }
  >;
}

const intervalToMs: Record<AgentHeartbeatIntervalPreset, number | null> = {
  manual: null,
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asDateMs = (value: unknown): number | undefined => {
  const raw = asString(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const nowIso = (): string => new Date().toISOString();

const resolveHeartbeatPolicyMetadata = (agent: AgentConfig): Record<string, unknown> =>
  normalizeHeartbeatPolicy(agent.heartbeatPolicy).metadata;

export const resolveAgentHeartbeatDue = (
  agent: AgentConfig,
  nowMs = Date.now(),
  trigger?: AgentHeartbeatTriggerPreset
): { due: boolean; reason: string } => {
  const policy = normalizeHeartbeatPolicy(agent.heartbeatPolicy);
  if (!policy.enabled) {
    return { due: false, reason: "heartbeat policy is disabled" };
  }

  const triggerList = new Set(policy.triggers);
  if (trigger && triggerList.has(trigger)) {
    return { due: true, reason: `trigger '${trigger}' matched` };
  }

  if (trigger) {
    return { due: false, reason: `trigger '${trigger}' not enabled for agent` };
  }

  const intervalMs = intervalToMs[policy.interval];
  if (!intervalMs) {
    return { due: false, reason: "manual heartbeat interval" };
  }

  const metadata = resolveHeartbeatPolicyMetadata(agent);
  const lastHeartbeatAt = asDateMs(metadata.lastHeartbeatAt);
  if (lastHeartbeatAt === undefined) {
    return { due: true, reason: "no previous heartbeat recorded" };
  }

  return nowMs - lastHeartbeatAt >= intervalMs
    ? { due: true, reason: `interval '${policy.interval}' elapsed` }
    : { due: false, reason: `interval '${policy.interval}' not yet due` };
};

const updateAgentHeartbeatDispatch = async (input: {
  agent: AgentConfig;
  jobId: string;
  trigger?: AgentHeartbeatTriggerPreset;
  reason?: string;
  projectId?: string;
  actor: string;
}): Promise<void> => {
  const policy = normalizeHeartbeatPolicy(input.agent.heartbeatPolicy);
  const metadata = {
    ...policy.metadata,
    lastHeartbeatAt: nowIso(),
    lastHeartbeatJobId: input.jobId,
    lastHeartbeatActor: input.actor,
    lastHeartbeatReason: input.reason ?? "manual",
    lastHeartbeatTrigger: input.trigger ?? "manual",
    ...(input.projectId ? { lastHeartbeatProjectId: input.projectId } : {})
  };
  await agentsService.updateAgent(input.agent.id, {
    heartbeatPolicy: {
      ...policy,
      metadata
    }
  });
};

export const dispatchAgentHeartbeat = async (
  input: AgentHeartbeatDispatchInput
): Promise<AgentHeartbeatDispatchResult> => {
  const agent = await agentsService.getAgent(input.agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  const heartbeatMetadata: Record<string, unknown> = {
    ...(input.metadata ?? {})
  };
  if (input.trigger !== undefined) heartbeatMetadata.trigger = input.trigger;
  if (input.projectId !== undefined) heartbeatMetadata.projectId = input.projectId;
  const job = await agentsService.runHeartbeat(agent.id, {
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
    ...(Object.keys(heartbeatMetadata).length > 0 ? { metadata: heartbeatMetadata } : {})
  });
  const dispatchUpdateInput: Parameters<typeof updateAgentHeartbeatDispatch>[0] = {
    agent,
    jobId: job.jobId,
    actor: input.actor
  };
  if (input.trigger !== undefined) dispatchUpdateInput.trigger = input.trigger;
  if (input.reason !== undefined) dispatchUpdateInput.reason = input.reason;
  if (input.projectId !== undefined) dispatchUpdateInput.projectId = input.projectId;
  await updateAgentHeartbeatDispatch(dispatchUpdateInput);

  return {
    agentId: agent.id,
    jobId: job.jobId,
    createdAt: job.createdAt ?? nowIso(),
    result: job
  };
};

export const dispatchDueAgentHeartbeats = async (
  input: AgentHeartbeatSweepInput
): Promise<AgentHeartbeatSweepSummary> => {
  const agents = await agentsService.listAgents();
  const items: AgentHeartbeatSweepSummary["items"] = [];
  const candidates = agents.filter((agent) => {
    const due = resolveAgentHeartbeatDue(agent, Date.now(), input.trigger);
    return due.due;
  });
  const limitedCandidates =
    typeof input.limit === "number" && input.limit > 0 ? candidates.slice(0, input.limit) : candidates;

  for (const agent of limitedCandidates) {
    const due = resolveAgentHeartbeatDue(agent, Date.now(), input.trigger);
    if (!due.due) {
      items.push({
        agentId: agent.id,
        status: "skipped",
        reason: due.reason
      });
      continue;
    }

    try {
      const dispatchInput: AgentHeartbeatDispatchInput = {
        tenantId: input.tenantId,
        actor: input.actor,
        agentId: agent.id,
        reason: input.reason ?? due.reason
      };
      if (input.projectId !== undefined) dispatchInput.projectId = input.projectId;
      if (input.trigger !== undefined) dispatchInput.trigger = input.trigger;
      if (typeof input.timeoutMs === "number") dispatchInput.timeoutMs = input.timeoutMs;
      const dispatched = await dispatchAgentHeartbeat(dispatchInput);
      items.push({
        agentId: dispatched.agentId,
        status: "dispatched",
        jobId: dispatched.jobId,
        reason: due.reason,
        ...(input.trigger !== undefined ? { trigger: input.trigger } : {})
      });
    } catch (error) {
      items.push({
        agentId: agent.id,
        status: "error",
        reason: error instanceof Error ? error.message : "Unable to dispatch agent heartbeat"
      });
    }
  }

  return { items };
};
