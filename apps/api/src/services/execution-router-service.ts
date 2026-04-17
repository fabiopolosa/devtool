import { randomUUID } from "node:crypto";
import type { Environment, Job, Machine, JobType } from "@cp/domain";
import { runWithTenantContext } from "@cp/db";
import { apiStore } from "./api-store.js";
import { auditLogService } from "./audit-log-service.js";
import { usageService } from "./usage-service.js";

const nowIso = (): string => new Date().toISOString();

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
    .filter((entry) => entry.length > 0);
};

export const executionModes = ["remote", "local", "hybrid"] as const;
export type ExecutionMode = (typeof executionModes)[number];

export const executionDispatchTargets = ["remote_worker", "local_worker", "hybrid"] as const;
export type ExecutionDispatchTarget = (typeof executionDispatchTargets)[number];

export const localExecutionAdapters = ["internal_runner", "codex", "claude", "gemini", "shell", "docker"] as const;
export type LocalExecutionAdapter = (typeof localExecutionAdapters)[number];

const executionModeSet = new Set<ExecutionMode>(executionModes);
const executionAdapterSet = new Set<LocalExecutionAdapter>(localExecutionAdapters);
const workerHeartbeatMaxAgeMs = Math.max(
  5_000,
  Number.parseInt(process.env.EXECUTION_WORKER_HEARTBEAT_MAX_AGE_MS ?? "", 10) || 45_000
);

const toExecutionMode = (value: unknown): ExecutionMode | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return executionModeSet.has(normalized as ExecutionMode) ? (normalized as ExecutionMode) : undefined;
};

const toLocalExecutionAdapter = (value: unknown): LocalExecutionAdapter | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return executionAdapterSet.has(normalized as LocalExecutionAdapter)
    ? (normalized as LocalExecutionAdapter)
    : undefined;
};

const inferRequiredCapabilities = (input: {
  adapter: LocalExecutionAdapter;
  type: JobType;
  payload: Record<string, unknown>;
  explicitCapabilities: string[];
}): string[] => {
  if (input.explicitCapabilities.length > 0) return [...new Set(input.explicitCapabilities)];
  if (input.adapter === "internal_runner") return ["internal_runner"];
  if (input.type === "generation" && input.adapter === "shell") return ["shell"];
  return [input.adapter];
};

const defaultDispatchTargetForMode = (mode: ExecutionMode): ExecutionDispatchTarget => {
  if (mode === "local") return "local_worker";
  if (mode === "hybrid") return "hybrid";
  return "remote_worker";
};

const parseTimestampMs = (value: unknown): number | undefined => {
  const timestamp = asString(value);
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const machineSupportsLocalExecution = (machine: Machine): boolean => {
  if (machine.agents.includes("local-worker")) return true;
  if (machine.agents.includes("remote-worker")) return false;
  const metadata = asRecord(machine.metadata) ?? {};
  const execution = asRecord(metadata.execution) ?? {};
  const mode = asString(execution.mode)?.toLowerCase();
  if (mode === "remote") return false;
  if (mode === "local" || mode === "hybrid") return true;
  const services = machine.services.map((entry) => entry.toLowerCase());
  return services.includes("shell") || services.includes("docker");
};

const machineSupportsRemoteExecution = (machine: Machine): boolean => {
  if (machine.agents.includes("remote-worker")) return true;
  const metadata = asRecord(machine.metadata) ?? {};
  const execution = asRecord(metadata.execution) ?? {};
  const mode = asString(execution.mode)?.toLowerCase();
  if (mode === "remote" || mode === "hybrid") return true;
  if (mode === "local") return false;
  if (machine.agents.includes("local-worker")) return false;
  const services = machine.services.map((entry) => entry.toLowerCase());
  return services.includes("internal_runner") && !services.includes("shell");
};

const machineIsActive = (machine: Machine): boolean => {
  if (machine.status !== "online" && machine.status !== "degraded") return false;
  const heartbeatMs = parseTimestampMs(machine.lastHeartbeatAt);
  if (heartbeatMs === undefined) return true;
  return Date.now() - heartbeatMs <= workerHeartbeatMaxAgeMs;
};

export interface ExecutionWorkerAvailability {
  localMachineId?: string;
  remoteMachineId?: string;
}

export const getExecutionWorkerAvailability = async (
  tenantId: string
): Promise<ExecutionWorkerAvailability> => {
  if (typeof apiStore.listMachines !== "function") return {};

  try {
    return await runWithTenantContext({ tenantId }, async () => {
      const machines = await apiStore.listMachines();
      const local = machines.find((machine) => machineIsActive(machine) && machineSupportsLocalExecution(machine));
      const remote = machines.find((machine) => machineIsActive(machine) && machineSupportsRemoteExecution(machine));
      return {
        ...(local ? { localMachineId: local.id } : {}),
        ...(remote ? { remoteMachineId: remote.id } : {})
      };
    });
  } catch {
    return {};
  }
};

const inferAdapter = (input: {
  payload: Record<string, unknown>;
  mode: ExecutionMode;
}): LocalExecutionAdapter => {
  const payloadExecution = asRecord(input.payload.execution);
  const explicit =
    toLocalExecutionAdapter(payloadExecution?.adapter) ??
    toLocalExecutionAdapter(input.payload.adapter) ??
    toLocalExecutionAdapter(input.payload.executionAdapter);
  if (explicit) return explicit;
  if (typeof input.payload.internalAction === "string") return "internal_runner";
  if (input.mode === "remote") return "internal_runner";
  return "shell";
};

export interface ExecutionRouteDecision {
  mode: ExecutionMode;
  dispatchTarget: ExecutionDispatchTarget;
  adapter: LocalExecutionAdapter;
  requiredCapabilities: string[];
  source: "payload" | "system";
  reason: string;
  resolvedAt: string;
}

export interface ResolveExecutionRouteInput {
  tenantId: string;
  projectId?: string;
  type: JobType;
  title: string;
  payload?: Record<string, unknown>;
}

export const resolveExecutionRoute = async (
  input: ResolveExecutionRouteInput
): Promise<ExecutionRouteDecision> => {
  const payload = asRecord(input.payload) ?? {};
  const payloadExecution = asRecord(payload.execution);
  const requestedMode =
    toExecutionMode(payloadExecution?.mode) ??
    toExecutionMode(payload.mode) ??
    toExecutionMode(payload.executionMode);
  const systemDefaultMode = toExecutionMode(process.env.EXECUTION_DEFAULT_MODE) ?? "remote";
  const bypassWorkerAvailabilityChecks = process.env.NODE_ENV === "test";
  const workerAvailability = await getExecutionWorkerAvailability(input.tenantId);
  const autoResolvedMode: ExecutionMode | undefined = workerAvailability.localMachineId
    ? "local"
    : workerAvailability.remoteMachineId
      ? "remote"
      : undefined;
  const mode = requestedMode ?? autoResolvedMode ?? systemDefaultMode;
  const adapter = inferAdapter({ payload, mode });
  const requiredCapabilities = inferRequiredCapabilities({
    adapter,
    type: input.type,
    payload,
    explicitCapabilities: asStringArray(payloadExecution?.requiredCapabilities)
  });
  if (!bypassWorkerAvailabilityChecks) {
    if (mode === "local" && !workerAvailability.localMachineId) {
      throw new Error(
        "No local worker available. Start one with 'devtools worker start --mode local'."
      );
    }
    if (mode === "remote" && !workerAvailability.remoteMachineId) {
      throw new Error(
        "No remote worker available. Start the remote worker service or retry with '--mode local'."
      );
    }
    if (mode === "hybrid" && !workerAvailability.localMachineId && !workerAvailability.remoteMachineId) {
      throw new Error(
        "No workers available for hybrid mode. Start a local worker or bring a remote worker online."
      );
    }
    if (!requestedMode && !autoResolvedMode) {
      throw new Error(
        "No execution workers are available. Start 'devtools worker start --mode local' or bring a remote worker online."
      );
    }
  }
  const dispatchTarget = defaultDispatchTargetForMode(mode);
  const source = requestedMode ? "payload" : "system";
  const reason =
    source === "payload"
      ? `requested mode=${mode} from job payload`
      : mode === "local" && workerAvailability.localMachineId
        ? `auto-selected mode=local because worker ${workerAvailability.localMachineId} is online`
        : mode === "remote" && workerAvailability.remoteMachineId
          ? `auto-selected mode=remote because worker ${workerAvailability.remoteMachineId} is online`
          : bypassWorkerAvailabilityChecks
            ? `test-mode defaulted to system execution mode=${mode}`
            : `defaulted to system execution mode=${mode}`;

  return {
    mode,
    dispatchTarget,
    adapter,
    requiredCapabilities,
    source,
    reason,
    resolvedAt: nowIso()
  };
};

const dependenciesDone = (job: Job, byId: Map<string, Job>): boolean =>
  (job.dependencies ?? []).every((dependencyId) => byId.get(dependencyId)?.status === "done");

const refreshTenantJobReadiness = async (tenantId: string): Promise<void> => {
  await runWithTenantContext({ tenantId }, async () => {
    const jobs = await apiStore.listJobs();
    const byId = new Map(jobs.map((job) => [job.id, job]));
    for (const job of jobs) {
      const expectedDependsOnCount = job.dependencies.length;
      const expectedReady = job.status === "idle" && dependenciesDone(job, byId);
      if (job.dependsOnCount === expectedDependsOnCount && job.ready === expectedReady) continue;
      await apiStore.updateJob(job.id, {
        dependsOnCount: expectedDependsOnCount,
        ready: expectedReady,
        updatedAt: nowIso()
      });
    }
  });
};

const ensureLocalEnvironment = async (tenantId: string, actor: string): Promise<Environment> =>
  runWithTenantContext({ tenantId }, async () => {
    const environments = await apiStore.listEnvironments();
    const existing = environments.find((item) => item.type === "local") ?? environments[0];
    if (existing) return existing;
    const now = nowIso();
    return apiStore.createEnvironment({
      id: randomUUID(),
      name: "Local Execution",
      description: "Auto-generated local execution environment.",
      type: "local",
      status: "active",
      notes: [],
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    });
  });

export interface RegisterExecutionWorkerInput {
  tenantId: string;
  actor: string;
  machineId?: string;
  name?: string;
  host?: string;
  mode?: ExecutionMode;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export const registerExecutionWorker = async (
  input: RegisterExecutionWorkerInput
): Promise<Machine> => {
  const now = nowIso();
  const environment = await ensureLocalEnvironment(input.tenantId, input.actor);
  const executionMode = input.mode ?? "local";
  const workerAgentTag = executionMode === "remote" ? "remote-worker" : "local-worker";
  const capabilitySet = [...new Set((input.capabilities ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  const workerName = input.name?.trim() || "Local Worker";
  const workerHost = input.host?.trim() || "localhost";
  const metadata = {
    ...((input.metadata ?? {}) as Record<string, unknown>),
    execution: {
      mode: executionMode,
      capabilities: capabilitySet
    }
  };

  return runWithTenantContext({ tenantId: input.tenantId }, async () => {
    let machine: Machine | null = null;
    if (input.machineId) {
      machine = await apiStore.getMachine(input.machineId);
    }

    if (!machine) {
      const existingByHost = (await apiStore.listMachines(environment.id)).find(
        (item) => item.host === workerHost && item.name === workerName
      );
      machine = existingByHost ?? null;
    }

    if (!machine) {
      return apiStore.createMachine({
        id: input.machineId?.trim() || randomUUID(),
        environmentId: environment.id,
        name: workerName,
        host: workerHost,
        status: "online",
        cpuCores: 0,
        gpuCount: 0,
        ramGb: 0,
        services: capabilitySet,
        agents: [workerAgentTag],
        lastHeartbeatAt: now,
        metadata,
        createdAt: now,
        createdBy: input.actor,
        updatedAt: now,
        updatedBy: input.actor
      });
    }

    return apiStore.updateMachine(machine.id, {
      environmentId: environment.id,
      name: workerName,
      host: workerHost,
      status: "online",
      services: capabilitySet.length > 0 ? capabilitySet : machine.services,
      agents: [...new Set([...(machine.agents ?? []), workerAgentTag])],
      lastHeartbeatAt: now,
      metadata: {
        ...(machine.metadata ?? {}),
        ...metadata
      },
      updatedAt: now,
      updatedBy: input.actor
    });
  });
};

export interface HeartbeatExecutionWorkerInput {
  tenantId: string;
  machineId: string;
  actor: string;
  status?: Machine["status"];
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export const heartbeatExecutionWorker = async (
  input: HeartbeatExecutionWorkerInput
): Promise<Machine> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const machine = await apiStore.getMachine(input.machineId);
    if (!machine) {
      throw new Error(`Machine not found: ${input.machineId}`);
    }
    const capabilities = [...new Set((input.capabilities ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
    return apiStore.updateMachine(machine.id, {
      ...(input.status ? { status: input.status } : {}),
      ...(capabilities.length > 0 ? { services: capabilities } : {}),
      lastHeartbeatAt: nowIso(),
      ...(input.metadata
        ? {
            metadata: {
              ...(machine.metadata ?? {}),
              ...input.metadata
            }
          }
        : {}),
      updatedAt: nowIso(),
      updatedBy: input.actor
    });
  });

interface JobExecutionMetadata {
  mode: ExecutionMode;
  dispatchTarget: ExecutionDispatchTarget;
  adapter: LocalExecutionAdapter;
  requiredCapabilities: string[];
  assignedMachineId?: string;
}

const parseJobExecutionMetadata = (job: Job): JobExecutionMetadata => {
  const payload = asRecord(job.payload) ?? {};
  const execution = asRecord(payload.execution) ?? {};
  const mode = toExecutionMode(execution.mode) ?? "remote";
  const dispatchTarget = ((): ExecutionDispatchTarget => {
    const raw = asString(execution.dispatchTarget)?.toLowerCase();
    if (raw === "local_worker" || raw === "hybrid" || raw === "remote_worker") {
      return raw;
    }
    return defaultDispatchTargetForMode(mode);
  })();
  const adapter = inferAdapter({ payload, mode });
  const requiredCapabilities = asStringArray(execution.requiredCapabilities);
  const assignedMachineId = asString(execution.assignedMachineId);
  return {
    mode,
    dispatchTarget,
    adapter,
    ...(assignedMachineId ? { assignedMachineId } : {}),
    requiredCapabilities: requiredCapabilities.length > 0 ? requiredCapabilities : inferRequiredCapabilities({
      adapter,
      type: job.type,
      payload,
      explicitCapabilities: []
    })
  };
};

const workerCanRunJob = (
  job: Job,
  input: { mode: ExecutionMode; capabilities: string[]; machineId: string }
): boolean => {
  const metadata = parseJobExecutionMetadata(job);
  if (metadata.assignedMachineId && metadata.assignedMachineId !== input.machineId) return false;
  if (metadata.dispatchTarget === "remote_worker") return false;
  if (input.mode === "remote") return false;
  if (metadata.dispatchTarget === "local_worker" && input.mode === "hybrid") return true;
  if (metadata.dispatchTarget === "hybrid" && (input.mode === "local" || input.mode === "hybrid")) {
    const available = new Set(input.capabilities.map((entry) => entry.toLowerCase()));
    return metadata.requiredCapabilities.every((required) => available.has(required.toLowerCase()));
  }
  if (metadata.dispatchTarget !== "local_worker") return false;
  const available = new Set(input.capabilities.map((entry) => entry.toLowerCase()));
  return metadata.requiredCapabilities.every((required) => available.has(required.toLowerCase()));
};

export interface ClaimExecutionJobsInput {
  tenantId: string;
  machineId: string;
  actor: string;
  mode?: ExecutionMode;
  capabilities?: string[];
  limit?: number;
}

export const claimExecutionJobs = async (input: ClaimExecutionJobsInput): Promise<Job[]> => {
  const mode = input.mode ?? "local";
  const capabilities = [...new Set((input.capabilities ?? []).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(50, Math.trunc(input.limit ?? 5))) : 5;

  return runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const machine = await apiStore.getMachine(input.machineId);
    if (!machine) {
      throw new Error(`Machine not found: ${input.machineId}`);
    }

    const candidates = (await apiStore.listJobs({ status: "idle", ready: true })).sort((left, right) => {
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.createdAt.localeCompare(right.createdAt);
    });

    const claimed: Job[] = [];
    for (const candidate of candidates) {
      if (claimed.length >= limit) break;
      if (!workerCanRunJob(candidate, { mode, capabilities, machineId: input.machineId })) continue;
      const latest = await apiStore.getJob(candidate.id);
      if (!latest || latest.status !== "idle" || !latest.ready) continue;

      const payload = asRecord(latest.payload) ?? {};
      const execution = asRecord(payload.execution) ?? {};
      const updated = await apiStore.updateJob(latest.id, {
        status: "running",
        ready: false,
        actionRequired: false,
        startedAt: latest.startedAt ?? nowIso(),
        payload: {
          ...payload,
          execution: {
            ...execution,
            claimedByMachineId: input.machineId,
            claimedAt: nowIso(),
            claimedMode: mode
          }
        },
        updatedAt: nowIso()
      });
      claimed.push(updated);
      await auditLogService.record({
        tenantId: input.tenantId,
        ...(updated.projectId ? { projectId: updated.projectId } : {}),
        jobId: updated.id,
        action: "execution.job.claim",
        resourceType: "job",
        resourceId: updated.id,
        status: "success",
        metadata: {
          machineId: input.machineId,
          mode
        },
        actor: input.actor
      });
    }

    return claimed;
  });
};

export interface CompleteExecutionJobInput {
  tenantId: string;
  jobId: string;
  machineId: string;
  actor: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
  usage?: {
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    metadata?: Record<string, unknown>;
  };
}

export const completeExecutionJob = async (
  input: CompleteExecutionJobInput
): Promise<Job> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const job = await apiStore.getJob(input.jobId);
    if (!job) throw new Error(`Job not found: ${input.jobId}`);
    const payload = asRecord(job.payload) ?? {};
    const execution = asRecord(payload.execution) ?? {};
    const metadata = parseJobExecutionMetadata(job);
    const completedAt = nowIso();
    const updated = await apiStore.updateJob(job.id, {
      status: "done",
      actionRequired: false,
      ready: false,
      completedAt,
      payload: {
        ...payload,
        output: {
          stage: "local_worker",
          machineId: input.machineId,
          ...(input.result !== undefined ? { result: input.result } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {})
        },
        execution: {
          ...execution,
          completedByMachineId: input.machineId,
          completedAt
        }
      },
      updatedAt: completedAt
    });

    await refreshTenantJobReadiness(input.tenantId);

    await auditLogService.record({
      tenantId: input.tenantId,
      ...(updated.projectId ? { projectId: updated.projectId } : {}),
      jobId: updated.id,
      action: "execution.job.complete",
      resourceType: "job",
      resourceId: updated.id,
      status: "success",
      metadata: {
        machineId: input.machineId,
        mode: metadata.mode,
        dispatchTarget: metadata.dispatchTarget,
        adapter: metadata.adapter
      },
      actor: input.actor
    });

    if (input.usage) {
      await usageService.record({
        tenantId: input.tenantId,
        ...(updated.projectId ? { projectId: updated.projectId } : {}),
        jobId: updated.id,
        provider: input.usage.provider ?? "local",
        model: input.usage.model ?? metadata.adapter,
        inputTokens: Math.max(0, Math.trunc(input.usage.inputTokens ?? 0)),
        outputTokens: Math.max(0, Math.trunc(input.usage.outputTokens ?? 0)),
        cost: Number((input.usage.cost ?? 0).toFixed(6)),
        metadata: {
          localUsage: true,
          executionMode: metadata.mode,
          dispatchTarget: metadata.dispatchTarget,
          machineId: input.machineId,
          ...(input.usage.metadata ?? {})
        },
        actor: input.actor
      });
    }

    return updated;
  });

export interface FailExecutionJobInput {
  tenantId: string;
  jobId: string;
  machineId: string;
  actor: string;
  error: string;
  metadata?: Record<string, unknown>;
}

export const failExecutionJob = async (
  input: FailExecutionJobInput
): Promise<Job> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const job = await apiStore.getJob(input.jobId);
    if (!job) throw new Error(`Job not found: ${input.jobId}`);
    const payload = asRecord(job.payload) ?? {};
    const execution = asRecord(payload.execution) ?? {};
    const failedAt = nowIso();
    const updated = await apiStore.updateJob(job.id, {
      status: "error",
      actionRequired: true,
      ready: false,
      completedAt: failedAt,
      payload: {
        ...payload,
        lastError: {
          at: failedAt,
          message: input.error,
          ...(input.metadata ? { metadata: input.metadata } : {})
        },
        execution: {
          ...execution,
          failedByMachineId: input.machineId,
          failedAt
        }
      },
      updatedAt: failedAt
    });

    await refreshTenantJobReadiness(input.tenantId);
    await auditLogService.record({
      tenantId: input.tenantId,
      ...(updated.projectId ? { projectId: updated.projectId } : {}),
      jobId: updated.id,
      action: "execution.job.fail",
      resourceType: "job",
      resourceId: updated.id,
      status: "failure",
      metadata: {
        machineId: input.machineId
      },
      actor: input.actor
    });
    return updated;
  });
