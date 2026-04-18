import {
  buildHeartbeatPolicy,
  buildProjectRuntimeProfile,
  type AgentConfig,
  type HeartbeatIntervalPreset,
  type HeartbeatPolicy,
  type HeartbeatTriggerPreset,
  type Job,
  type Project,
  type ProjectRuntimeProfile
} from "@cp/domain";
import { runWithTenantContext } from "@cp/db";
import { apiStore } from "./api-store.js";
import { dispatchRunnerJob } from "./job-dispatch-service.js";

const nowIso = (): string => new Date().toISOString();

const heartbeatIntervalToMs: Record<HeartbeatIntervalPreset, number | null> = {
  manual: null,
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000
};

const heartbeatTriggerSet = new Set<HeartbeatTriggerPreset>([
  "manual",
  "on_startup",
  "after_deploy",
  "after_failure"
]);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

export type ProjectRuntimeProjectRecord = Project & { runtimeProfile?: ProjectRuntimeProfile };

export interface ProjectRuntimeProfilePatch {
  primaryAgentId?: string | undefined;
  workspaceId?: string | undefined;
  defaultHost?: ProjectRuntimeProfile["defaultHost"] | undefined;
  defaultExecutionMode?: ProjectRuntimeProfile["defaultExecutionMode"] | undefined;
  heartbeatPolicy?:
    | {
        interval?: HeartbeatIntervalPreset | undefined;
        triggers?: HeartbeatTriggerPreset[] | undefined;
        enabled?: boolean | undefined;
        metadata?: Record<string, unknown> | undefined;
      }
    | undefined;
  agentSelectionPolicy?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ProjectHeartbeatTarget {
  agentId: string;
  agentName: string;
}

export interface ProjectHeartbeatJobReference {
  jobId: string;
  resourceId: string;
  agentId: string;
  agentName: string;
  command: string;
  args: string[];
  createdAt: string;
}

export interface ProjectHeartbeatExecutionResult {
  project: ProjectRuntimeProjectRecord;
  runtimeProfile: ProjectRuntimeProfile;
  targets: ProjectHeartbeatTarget[];
  jobs: ProjectHeartbeatJobReference[];
}

export interface ProjectHeartbeatStatusTarget {
  agentId: string;
  agentName: string;
  jobId?: string;
  jobStatus?: Job["status"];
  ready?: boolean;
  updatedAt?: string;
}

export interface ProjectHeartbeatStatus {
  projectId: string;
  projectName: string;
  runtimeProfile: ProjectRuntimeProfile;
  lastTriggeredAt?: string;
  lastTrigger?: HeartbeatTriggerPreset;
  lastTriggeredBy?: string;
  lastReason?: string;
  lastJobIds: string[];
  overallStatus: "idle" | "queued" | "running" | "done" | "error" | "disabled";
  due: boolean;
  targets: ProjectHeartbeatStatusTarget[];
  completedCount: number;
  failedCount: number;
  runningCount: number;
  queuedCount: number;
}

export class ProjectRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectRuntimeError";
  }
}

const readProjectRuntimeProfile = (project: ProjectRuntimeProjectRecord): ProjectRuntimeProfile =>
  buildProjectRuntimeProfile(project.runtimeProfile ?? {});

const writeProjectRuntimeProfile = async (
  tenantId: string,
  projectId: string,
  profile: ProjectRuntimeProfile
): Promise<ProjectRuntimeProjectRecord> =>
  runWithTenantContext({ tenantId }, async () => {
    const updated = await apiStore.updateProject(projectId, {
      runtimeProfile: profile as unknown as Record<string, unknown>
    } as Partial<Project>);
    return updated as ProjectRuntimeProjectRecord;
  });

const normalizeProjectRuntimeProfilePatch = (patch: ProjectRuntimeProfilePatch): ProjectRuntimeProfilePatch => ({
  ...(patch.primaryAgentId ? { primaryAgentId: patch.primaryAgentId } : {}),
  ...(patch.workspaceId ? { workspaceId: patch.workspaceId } : {}),
  ...(patch.defaultHost ? { defaultHost: patch.defaultHost } : {}),
  ...(patch.defaultExecutionMode ? { defaultExecutionMode: patch.defaultExecutionMode } : {}),
  ...(patch.heartbeatPolicy ? { heartbeatPolicy: patch.heartbeatPolicy } : {}),
  ...(patch.agentSelectionPolicy ? { agentSelectionPolicy: patch.agentSelectionPolicy } : {}),
  ...(patch.metadata ? { metadata: patch.metadata } : {})
});

const mergeProjectRuntimeProfile = (
  current: ProjectRuntimeProfile,
  patch: ProjectRuntimeProfilePatch
): ProjectRuntimeProfile => ({
  ...(patch.primaryAgentId !== undefined
    ? { primaryAgentId: patch.primaryAgentId }
    : current.primaryAgentId
      ? { primaryAgentId: current.primaryAgentId }
      : {}),
  ...(patch.workspaceId !== undefined
    ? { workspaceId: patch.workspaceId }
    : current.workspaceId
      ? { workspaceId: current.workspaceId }
      : {}),
  defaultHost: patch.defaultHost ?? current.defaultHost,
  defaultExecutionMode: patch.defaultExecutionMode ?? current.defaultExecutionMode,
  heartbeatPolicy: patch.heartbeatPolicy
    ? (() => {
        const heartbeatPolicyInput: Partial<HeartbeatPolicy> = { ...current.heartbeatPolicy };
        if (patch.heartbeatPolicy?.interval !== undefined) {
          heartbeatPolicyInput.interval = patch.heartbeatPolicy.interval;
        }
        if (patch.heartbeatPolicy?.triggers !== undefined) {
          heartbeatPolicyInput.triggers = patch.heartbeatPolicy.triggers;
        }
        if (patch.heartbeatPolicy?.enabled !== undefined) {
          heartbeatPolicyInput.enabled = patch.heartbeatPolicy.enabled;
        }
        if (patch.heartbeatPolicy?.metadata !== undefined) {
          heartbeatPolicyInput.metadata = patch.heartbeatPolicy.metadata;
        }
        return buildHeartbeatPolicy(heartbeatPolicyInput);
      })()
    : current.heartbeatPolicy,
  agentSelectionPolicy: patch.agentSelectionPolicy ?? current.agentSelectionPolicy,
  metadata: patch.metadata ? { ...current.metadata, ...patch.metadata } : current.metadata
});

const resolveProjectRuntimeTargets = async (input: {
  project: ProjectRuntimeProjectRecord;
  profile: ProjectRuntimeProfile;
  overrideAgentIds?: string[] | undefined;
}): Promise<ProjectHeartbeatTarget[]> => {
  const allAgents = await apiStore.listAgents();
  const byId = new Map(allAgents.map((agent) => [agent.id, agent]));
  const explicitTargets = input.overrideAgentIds ?? [];
  const profileAgentIds = asStringArray(input.profile.agentSelectionPolicy?.["agentIds"]);
  const allActiveAgents = input.profile.agentSelectionPolicy?.["mode"] === "all_active";

  const candidateIds = explicitTargets.length > 0
    ? explicitTargets
    : input.profile.primaryAgentId
      ? [input.profile.primaryAgentId]
      : profileAgentIds.length > 0
        ? profileAgentIds
        : allActiveAgents
          ? allAgents.filter((agent) => agent.status === "active").map((agent) => agent.id)
          : [];

  const targets = candidateIds
    .map((agentId) => byId.get(agentId))
    .filter((agent): agent is AgentConfig => Boolean(agent))
    .map((agent) => ({
      agentId: agent.id,
      agentName: agent.name
    }));

  if (targets.length === 0) {
    throw new ProjectRuntimeError(
      `No heartbeat target agents could be resolved for project ${input.project.id}`
    );
  }

  return targets;
};

const extractLastHeartbeatMetadata = (project: ProjectRuntimeProjectRecord): Record<string, unknown> => {
  const profile = readProjectRuntimeProfile(project);
  return asRecord(profile.metadata?.["heartbeat"] ?? profile.metadata) ?? {};
};

export const getProjectRuntimeProfile = async (input: {
  tenantId: string;
  projectId: string;
}): Promise<ProjectRuntimeProjectRecord> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const project = (await apiStore.getProject(input.projectId)) as ProjectRuntimeProjectRecord | null;
    if (!project) {
      throw new ProjectRuntimeError(`Project not found: ${input.projectId}`);
    }
    const profile = readProjectRuntimeProfile(project);
    if (!project.runtimeProfile) {
      return writeProjectRuntimeProfile(input.tenantId, project.id, profile);
    }
    return project;
  });

export const updateProjectRuntimeProfile = async (input: {
  tenantId: string;
  projectId: string;
  patch: ProjectRuntimeProfilePatch;
}): Promise<ProjectRuntimeProjectRecord> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const project = (await apiStore.getProject(input.projectId)) as ProjectRuntimeProjectRecord | null;
    if (!project) {
      throw new ProjectRuntimeError(`Project not found: ${input.projectId}`);
    }

    const current = readProjectRuntimeProfile(project);
    const patch = normalizeProjectRuntimeProfilePatch(input.patch);
    const next = mergeProjectRuntimeProfile(current, patch);
    return writeProjectRuntimeProfile(input.tenantId, project.id, next);
  });

export const listProjectRuntimeHeartbeatJobs = async (input: {
  tenantId: string;
  projectId: string;
}): Promise<Job[]> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () =>
    apiStore.listJobs({
      projectId: input.projectId,
      resourceType: "project_runtime"
    })
  );

const resolveHeartbeatDue = (input: {
  profile: ProjectRuntimeProfile;
  metadata: Record<string, unknown>;
}): boolean => {
  if (!input.profile.heartbeatPolicy.enabled) return false;
  const lastHeartbeatAt = asString(input.metadata.lastHeartbeatAt);
  const intervalMs = heartbeatIntervalToMs[input.profile.heartbeatPolicy.interval];
  if (intervalMs === null) {
    return false;
  }
  if (!lastHeartbeatAt) {
    return true;
  }
  const parsed = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(parsed)) {
    return true;
  }
  return Date.now() - parsed >= intervalMs;
};

const toJobReference = (job: Job): ProjectHeartbeatJobReference => {
  const payload = asRecord(job.payload) ?? {};
  const agentId = asString(payload.agentId) ?? "unknown";
  const agentName = asString(payload.agentName) ?? agentId;
  return {
    jobId: job.id,
    resourceId: job.resourceId ?? job.id,
    agentId,
    agentName,
    command: "agent.runtime.heartbeat",
    args: [agentId],
    createdAt: job.createdAt
  };
};

export const triggerProjectHeartbeat = async (input: {
  tenantId: string;
  projectId: string;
  actor: string;
  trigger?: HeartbeatTriggerPreset;
  reason?: string;
  agentIds?: string[];
  metadata?: Record<string, unknown>;
  force?: boolean;
}): Promise<ProjectHeartbeatExecutionResult> => {
  const project = await getProjectRuntimeProfile({
    tenantId: input.tenantId,
    projectId: input.projectId
  });
  const profile = readProjectRuntimeProfile(project);
  const trigger = input.trigger ?? "manual";

  if (!heartbeatTriggerSet.has(trigger)) {
    throw new ProjectRuntimeError(`Unsupported heartbeat trigger: ${trigger}`);
  }
  if (!input.force && trigger !== "manual" && !profile.heartbeatPolicy.triggers.includes(trigger)) {
    throw new ProjectRuntimeError(
      `Heartbeat trigger '${trigger}' is not enabled for project ${project.id}`
    );
  }
  if (trigger !== "manual" && !input.force && !profile.heartbeatPolicy.enabled) {
    throw new ProjectRuntimeError(`Heartbeat policy is disabled for project ${project.id}`);
  }

  const targets = await resolveProjectRuntimeTargets({
    project,
    profile,
    ...(input.agentIds ? { overrideAgentIds: input.agentIds } : {})
  });
  const heartbeatMetadata = {
    projectId: project.id,
    projectKey: project.key,
    projectName: project.name,
    trigger,
    reason: input.reason ?? `project heartbeat for ${project.name}`,
    ...(input.metadata ?? {})
  };

  const jobs = await Promise.all(
    targets.map(async (target) => {
      const job = await dispatchRunnerJob({
        tenantId: input.tenantId,
        projectId: project.id,
        type: "agent_runtime",
        title: `Project heartbeat ${project.key} -> ${target.agentName}`,
        createdBy: input.actor,
        resourceType: "project_runtime",
        resourceId: project.id,
        payload: {
          internalAction: "agent.runtime.heartbeat",
          agentId: target.agentId,
          agentName: target.agentName,
          projectId: project.id,
          reason: input.reason ?? `project heartbeat for ${project.name}`,
          metadata: heartbeatMetadata,
          execution: {
            mode: "remote",
            dispatchTarget: "remote_worker"
          }
        }
      });
      return toJobReference(job);
    })
  );

  const nextMetadata = {
    ...(extractLastHeartbeatMetadata(project) ?? {}),
    lastHeartbeatAt: nowIso(),
    lastHeartbeatTrigger: trigger,
    lastHeartbeatReason: input.reason ?? `project heartbeat for ${project.name}`,
    lastHeartbeatJobIds: jobs.map((job) => job.jobId),
    lastHeartbeatAgentIds: targets.map((target) => target.agentId),
    lastHeartbeatStatus: "queued"
  };
  const nextProfile = buildProjectRuntimeProfile({
    ...profile,
    metadata: {
      ...(profile.metadata ?? {}),
      heartbeat: nextMetadata
    }
  });

  const updated = await writeProjectRuntimeProfile(input.tenantId, project.id, nextProfile);
  return {
    project: updated,
    runtimeProfile: nextProfile,
    targets,
    jobs
  };
};

const jobStatusRank: Record<string, number> = {
  error: 4,
  running: 3,
  idle: 2,
  done: 1,
  waiting_user: 1
};

const jobStatusToOverall = (status: string): ProjectHeartbeatStatus["overallStatus"] => {
  if (status === "error") return "error";
  if (status === "running") return "running";
  if (status === "done") return "done";
  if (status === "waiting_user") return "queued";
  return "queued";
};

export const getProjectHeartbeatStatus = async (input: {
  tenantId: string;
  projectId: string;
}): Promise<ProjectHeartbeatStatus> => {
  const project = await getProjectRuntimeProfile({
    tenantId: input.tenantId,
    projectId: input.projectId
  });
  const profile = readProjectRuntimeProfile(project);
  const metadata = extractLastHeartbeatMetadata(project);
  const jobs = await listProjectRuntimeHeartbeatJobs({
    tenantId: input.tenantId,
    projectId: input.projectId
  });
  const targetJobs = jobs
    .filter((job) => asString((asRecord(job.payload) ?? {}).internalAction) === "agent.runtime.heartbeat")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const lastJobsByAgent = new Map<string, Job>();
  for (const job of targetJobs) {
    const agentId = asString((asRecord(job.payload) ?? {}).agentId);
    if (!agentId || lastJobsByAgent.has(agentId)) continue;
    lastJobsByAgent.set(agentId, job);
  }

  let resolvedTargets: ProjectHeartbeatTarget[] = [];
  try {
    resolvedTargets = await resolveProjectRuntimeTargets({
      project,
      profile
    });
  } catch {
    resolvedTargets = [];
  }
  const targets = resolvedTargets.map((target) => {
    const job = lastJobsByAgent.get(target.agentId);
    return {
      agentId: target.agentId,
      agentName: target.agentName,
      ...(job
        ? {
            jobId: job.id,
            jobStatus: job.status,
            ready: job.ready,
            updatedAt: job.updatedAt
          }
        : {})
    };
  });

  const completedCount = targetJobs.filter((job) => job.status === "done").length;
  const failedCount = targetJobs.filter((job) => job.status === "error").length;
  const runningCount = targetJobs.filter((job) => job.status === "running").length;
  const queuedCount = targetJobs.filter((job) => job.status === "idle").length;
  const worstStatus = targetJobs.reduce<string>(
    (current, job) => {
      const nextRank = jobStatusRank[job.status] ?? 0;
      const currentRank = jobStatusRank[current] ?? 0;
      return nextRank > currentRank ? job.status : current;
    },
    "idle"
  );

  const trigger = asString(metadata.lastHeartbeatTrigger) as HeartbeatTriggerPreset | undefined;
  const lastTriggeredAt = asString(metadata.lastHeartbeatAt);
  const lastReason = asString(metadata.lastHeartbeatReason);
  const lastTriggeredBy = asString(metadata.lastTriggeredBy);
  const due = resolveHeartbeatDue({ profile, metadata });

  return {
    projectId: project.id,
    projectName: project.name,
    runtimeProfile: profile,
    ...(lastTriggeredAt ? { lastTriggeredAt } : {}),
    ...(trigger ? { lastTrigger: trigger } : {}),
    ...(lastReason ? { lastReason } : {}),
    ...(lastTriggeredBy ? { lastTriggeredBy } : {}),
    lastJobIds: asStringArray(metadata.lastHeartbeatJobIds),
    overallStatus: profile.heartbeatPolicy.enabled ? jobStatusToOverall(worstStatus) : "disabled",
    due,
    targets,
    completedCount,
    failedCount,
    runningCount,
    queuedCount
  };
};

export const tickProjectHeartbeat = async (input: {
  tenantId: string;
  projectId: string;
  actor: string;
  trigger?: HeartbeatTriggerPreset;
  reason?: string;
  agentIds?: string[];
  metadata?: Record<string, unknown>;
}): Promise<
  | {
      skipped: true;
      reason: string;
      status: ProjectHeartbeatStatus;
    }
  | (ProjectHeartbeatExecutionResult & { skipped?: false })
> => {
  const status = await getProjectHeartbeatStatus({
    tenantId: input.tenantId,
    projectId: input.projectId
  });
  if (!status.due) {
    return {
      skipped: true,
      reason: "heartbeat_not_due",
      status
    };
  }

  const trigger = input.trigger ?? "manual";
  const result = await triggerProjectHeartbeat({
    tenantId: input.tenantId,
    projectId: input.projectId,
    actor: input.actor,
    trigger,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.agentIds ? { agentIds: input.agentIds } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    force: true
  });
  return {
    ...result,
    skipped: false
  };
};

export const projectHeartbeatPolicyIsValid = (policy: Partial<HeartbeatPolicy>): boolean => {
  const interval = policy.interval ?? "manual";
  return interval in heartbeatIntervalToMs;
};
