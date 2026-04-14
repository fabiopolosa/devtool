import type { AgentConfig, TaskSpec } from "@cp/domain";

export interface TaskExecutionRoutingInput {
  taskSpec: Pick<TaskSpec, "agentId" | "proposedRouting">;
  availableAgents: Array<
    Pick<AgentConfig, "id" | "name" | "role" | "status" | "runtimeConfig" | "desiredSkills">
  >;
  defaultRole?: string;
}

export interface TaskExecutionRoutingDecision {
  selectedRole: string;
  selectedAgentId?: string;
  selectedAgentName?: string;
  source: "task_agent_override" | "proposed_routing" | "default_fallback";
  reason: string;
  runtimeConfig: Record<string, unknown>;
  desiredSkills: string[];
}

export const resolveTaskExecutionRouting = (
  input: TaskExecutionRoutingInput
): TaskExecutionRoutingDecision => {
  const defaultRole = input.defaultRole ?? "codex_builder";

  if (input.taskSpec.agentId) {
    const matchedAgent = input.availableAgents.find((agent) => agent.id === input.taskSpec.agentId);
    if (matchedAgent) {
      return {
        selectedRole: matchedAgent.role,
        selectedAgentId: matchedAgent.id,
        selectedAgentName: matchedAgent.name,
        source: "task_agent_override",
        reason: `task.spec.agentId matched configured agent (${matchedAgent.status})`,
        runtimeConfig: { ...matchedAgent.runtimeConfig },
        desiredSkills: [...matchedAgent.desiredSkills]
      };
    }
  }

  const proposedRole = input.taskSpec.proposedRouting.primaryRole?.trim();
  if (proposedRole) {
    return {
      selectedRole: proposedRole,
      source: "proposed_routing",
      reason: input.taskSpec.agentId
        ? "task.spec.agentId not found, using proposed primary role"
        : "using planner proposed primary role",
      runtimeConfig: {},
      desiredSkills: []
    };
  }

  return {
    selectedRole: defaultRole,
    source: "default_fallback",
    reason: "missing explicit agent assignment and proposed primary role",
    runtimeConfig: {},
    desiredSkills: []
  };
};
