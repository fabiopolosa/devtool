import { randomUUID } from "node:crypto";
import {
  buildAgentRuntimeProfile,
  buildHeartbeatPolicy,
  buildProjectRuntimeProfile,
  type AgentConfig,
  type Project,
  type ProjectStatus
} from "@cp/domain";
import { agentsService } from "./agents-service.js";
import { apiStore } from "./api-store.js";

export interface CreateProjectWithCoordinatorInput {
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  policySetId?: string;
  actor: string;
}

export interface CreateProjectWithCoordinatorResult {
  project: Project;
  primaryAgent: AgentConfig;
}

const buildCoordinatorName = (projectName: string): string => `${projectName} Coordinator`;

const buildCoordinatorDescription = (projectName: string): string =>
  `Default coordinating agent for ${projectName}. Finish onboarding to connect API and/or local CLI access.`;

export async function createProjectWithCoordinator(
  input: CreateProjectWithCoordinatorInput
): Promise<CreateProjectWithCoordinatorResult> {
  const now = new Date().toISOString();
  const projectId = randomUUID();

  const primaryAgent = await agentsService.createAgent({
    name: buildCoordinatorName(input.name),
    role: "planner",
    icon: "orbit",
    description: buildCoordinatorDescription(input.name),
    adapterType: "custom_cli",
    desiredSkills: ["checks"],
    runtimeConfig: {
      commandPrefix: "codex",
      metadata: {
        bootstrap: "project_create",
        projectId,
        projectKey: input.key
      }
    },
    runtimeProfile: buildAgentRuntimeProfile("custom_cli", {
      runtimeKind: "desktop_cli",
      vendor: "openai_codex",
      host: "desktop_app",
      launchMode: "interactive",
      metadata: {
        projectId,
        projectKey: input.key,
        bootstrapRole: "project_coordinator",
        onboardingStatus: "pending",
        connectionModes: {
          cliEnabled: true,
          apiEnabled: false,
          preferred: "cli"
        }
      }
    }),
    heartbeatPolicy: buildHeartbeatPolicy({
      interval: "manual",
      triggers: ["manual"],
      enabled: true,
      metadata: {
        bootstrap: "project_create"
      }
    }),
    capabilities: ["chat_reasoning", "coding"],
    status: "active"
  });

  try {
    const project = await apiStore.createProject({
      id: projectId,
      tenantId: input.tenantId,
      key: input.key,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      status:
        input.status === "paused" || input.status === "archived"
          ? input.status
          : "active",
      ...(input.policySetId ? { policySetId: input.policySetId } : {}),
      runtimeProfile: buildProjectRuntimeProfile({
        primaryAgentId: primaryAgent.id,
        defaultHost: "desktop_app",
        defaultExecutionMode: "interactive",
        heartbeatPolicy: buildHeartbeatPolicy({
          interval: "manual",
          triggers: ["manual"],
          enabled: true,
          metadata: {
            bootstrap: "project_create"
          }
        }),
        agentSelectionPolicy: {
          mode: "primary",
          agentIds: [primaryAgent.id]
        },
        metadata: {
          onboardingStatus: "pending",
          coordinatorBootstrap: true,
          coordinatorAgentId: primaryAgent.id,
          localHost: {
            kind: "local_companion",
            status: "unconfigured",
            attached: false
          },
          appTargets: []
        }
      }) as unknown as Record<string, unknown>,
      createdAt: now,
      createdBy: input.actor,
      updatedAt: now,
      updatedBy: input.actor
    } as Project);

    return { project, primaryAgent };
  } catch (error) {
    await apiStore.deleteAgent(primaryAgent.id).catch(() => undefined);
    throw error;
  }
}
