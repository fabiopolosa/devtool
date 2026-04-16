import { randomUUID } from "node:crypto";
import { providerNames, type Job, type JobActionType, type JobStatus, type JobType, type ProviderName } from "@cp/domain";
import { apiStore } from "./api-store.js";
import { resolveProviderModelSelection } from "./provider-config-service.js";
import { resolveExecutionRoute } from "./execution-router-service.js";

const nowIso = (): string => new Date().toISOString();
const providerNameSet = new Set<ProviderName>(providerNames);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asProviderName = (value: unknown): ProviderName | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return providerNameSet.has(normalized as ProviderName) ? (normalized as ProviderName) : undefined;
};

const readRequestedProviderOrder = (payload: Record<string, unknown> | undefined): ProviderName[] => {
  if (!payload || !Array.isArray(payload.providerOrder)) return [];
  return payload.providerOrder
    .map((entry) => asProviderName(entry))
    .filter((entry): entry is ProviderName => Boolean(entry));
};

const readRequestedProvider = (payload: Record<string, unknown> | undefined): ProviderName | undefined => {
  const explicit = asProviderName(payload?.providerId) ?? asProviderName(payload?.provider);
  if (explicit) return explicit;
  return readRequestedProviderOrder(payload)[0];
};

const readRequestedModel = (payload: Record<string, unknown> | undefined): string | undefined =>
  asString(payload?.modelId) ?? asString(payload?.model);

const uniqueDependencies = (dependencies?: string[]): string[] =>
  [...new Set((dependencies ?? []).map((item) => item.trim()).filter((item) => item.length > 0))];

const buildDependencyGraph = (jobs: Pick<Job, "id" | "dependencies">[]): Map<string, string[]> => {
  const graph = new Map<string, string[]>();
  for (const job of jobs) {
    graph.set(job.id, uniqueDependencies(job.dependencies));
  }
  return graph;
};

const dependenciesDone = (job: Job, byId: Map<string, Job>): boolean =>
  uniqueDependencies(job.dependencies).every((dependencyId) => byId.get(dependencyId)?.status === "done");

export interface CreateJobInput {
  tenantId: string;
  projectId?: string;
  type: JobType;
  title: string;
  status?: JobStatus;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
  actionRequired?: boolean;
  actionType?: JobActionType;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  dependencies?: string[];
  createdBy: string;
}

export interface ListJobsFilters {
  type?: JobType;
  status?: JobStatus;
  actionRequired?: boolean;
  actionType?: JobActionType;
  resourceType?: string;
  resourceId?: string;
  ready?: boolean;
  projectId?: string;
}

export interface DagValidationResult {
  valid: boolean;
  cycles: string[][];
}

export interface JobRuntimeDependency {
  id: string;
  title: string;
  status: JobStatus;
  ready: boolean;
  updatedAt: string;
}

export interface JobRuntimeLogLine {
  timestamp: string;
  event: "start" | "retry" | "error" | "completed" | "status";
  message: string;
}

export interface JobRuntimeSnapshot {
  job: Job;
  dependencies: JobRuntimeDependency[];
  logs: JobRuntimeLogLine[];
}

const eventPriority: Record<JobRuntimeLogLine["event"], number> = {
  start: 0,
  retry: 1,
  error: 2,
  status: 3,
  completed: 4
};

const pushLogLine = (
  logs: JobRuntimeLogLine[],
  line: JobRuntimeLogLine
): void => {
  logs.push(line);
};

const readPayloadRuntimeLogs = (job: Job): JobRuntimeLogLine[] => {
  const runtimeLogs = job.payload?._runtimeLogs;
  if (!Array.isArray(runtimeLogs)) return [];

  return runtimeLogs
    .map((entry) => {
      if (typeof entry !== "string") return null;
      const match = entry.match(/^\[(.+?)\]\s*(.+)$/);
      if (!match) {
        return {
          timestamp: job.updatedAt,
          event: "status" as const,
          message: entry.trim()
        };
      }

      const rawTimestamp = match[1]?.trim();
      const message = match[2]?.trim() ?? "";
      if (!rawTimestamp || !message) return null;
      const lowered = message.toLowerCase();
      const event: JobRuntimeLogLine["event"] =
        lowered.startsWith("start")
          ? "start"
          : lowered.includes("retry")
            ? "retry"
            : lowered.includes("error")
              ? "error"
              : lowered.includes("done") || lowered.includes("completed")
                ? "completed"
                : "status";
      return {
        timestamp: rawTimestamp,
        event,
        message
      };
    })
    .filter((entry): entry is JobRuntimeLogLine => entry !== null);
};

const buildDerivedLogs = (job: Job): JobRuntimeLogLine[] => {
  const logs: JobRuntimeLogLine[] = [];
  if (job.startedAt) {
    pushLogLine(logs, {
      timestamp: job.startedAt,
      event: "start",
      message: `START job ${job.type}`
    });
  }

  if (job.retryCount > 0) {
    pushLogLine(logs, {
      timestamp: job.updatedAt,
      event: "retry",
      message: `RETRY #${job.retryCount}`
    });
  }

  if (job.status === "error") {
    const lastError = job.payload?.lastError;
    const errorMessage =
      typeof lastError === "object" &&
      lastError !== null &&
      typeof (lastError as Record<string, unknown>).message === "string"
        ? ((lastError as Record<string, unknown>).message as string)
        : "Job failed";
    pushLogLine(logs, {
      timestamp: job.completedAt ?? job.updatedAt,
      event: "error",
      message: `ERROR ${errorMessage}`
    });
  }

  if (job.status === "done") {
    pushLogLine(logs, {
      timestamp: job.completedAt ?? job.updatedAt,
      event: "completed",
      message: "DONE"
    });
  }

  if (logs.length === 0) {
    pushLogLine(logs, {
      timestamp: job.updatedAt,
      event: "status",
      message: `STATUS ${job.status}`
    });
  }

  return logs;
};

const sortRuntimeLogs = (logs: JobRuntimeLogLine[]): JobRuntimeLogLine[] =>
  [...logs].sort((left, right) => {
    const byTime = left.timestamp.localeCompare(right.timestamp);
    if (byTime !== 0) return byTime;
    return eventPriority[left.event] - eventPriority[right.event];
  });

export const listJobs = async (filters?: ListJobsFilters): Promise<Job[]> => {
  const base = await apiStore.listJobs({
    ...(filters?.type ? { type: filters.type } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
    ...(typeof filters?.actionRequired === "boolean" ? { actionRequired: filters.actionRequired } : {}),
    ...(filters?.actionType ? { actionType: filters.actionType } : {}),
    ...(filters?.resourceType ? { resourceType: filters.resourceType } : {}),
    ...(filters?.resourceId ? { resourceId: filters.resourceId } : {}),
    ...(typeof filters?.ready === "boolean" ? { ready: filters.ready } : {})
  });

  if (!filters?.projectId) {
    return base;
  }

  const projectId = filters.projectId;
  const tasks = await apiStore.listTasks(projectId);
  const taskIds = new Set(tasks.map((task) => task.id));
  const sessions = await apiStore.listBrainstormSessions({ projectId });
  const sessionIds = new Set(sessions.map((session) => session.id));
  const planIds = new Set(
    (await apiStore.listBrainstormPlans()).filter((plan) => sessionIds.has(plan.sessionId)).map((plan) => plan.id)
  );

  return base.filter((job) => {
    if (job.projectId) return job.projectId === projectId;
    if (job.resourceType === "project") return job.resourceId === projectId;
    if (job.resourceType === "task") return !!job.resourceId && taskIds.has(job.resourceId);
    if (job.resourceType === "brainstorm")
      return !!job.resourceId && (sessionIds.has(job.resourceId) || planIds.has(job.resourceId));
    return false;
  });
};

export const getJob = async (jobId: string): Promise<Job | null> => apiStore.getJob(jobId);

export const getJobRuntimeSnapshot = async (jobId: string): Promise<JobRuntimeSnapshot | null> => {
  const job = await getJob(jobId);
  if (!job) return null;

  const dependencyIds = uniqueDependencies(job.dependencies);
  const dependencyJobs = await Promise.all(
    dependencyIds.map(async (dependencyId) => apiStore.getJob(dependencyId))
  );

  const dependencies: JobRuntimeDependency[] = dependencyJobs
    .filter((dependency): dependency is Job => dependency !== null)
    .map((dependency) => ({
      id: dependency.id,
      title: dependency.title,
      status: dependency.status,
      ready: dependency.ready,
      updatedAt: dependency.updatedAt
    }));

  const rawLogs = readPayloadRuntimeLogs(job);
  const logs = sortRuntimeLogs(rawLogs.length > 0 ? rawLogs : buildDerivedLogs(job));

  return {
    job,
    dependencies,
    logs
  };
};

export const validateDAG = (jobs: Pick<Job, "id" | "dependencies">[]): DagValidationResult => {
  const graph = buildDependencyGraph(jobs);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];

  const visit = (node: string, path: string[]): void => {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      cycles.push(start >= 0 ? [...path.slice(start), node] : [...path, node]);
      return;
    }

    visiting.add(node);
    const deps = graph.get(node) ?? [];
    for (const dep of deps) {
      if (!graph.has(dep)) continue;
      visit(dep, [...path, node]);
    }
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) {
    visit(node, []);
  }

  return { valid: cycles.length === 0, cycles };
};

const assertDependenciesExist = (
  dependencies: string[],
  jobs: Pick<Job, "id">[],
  currentJobId?: string
): void => {
  const allowedIds = new Set(jobs.map((job) => job.id));
  if (currentJobId) {
    allowedIds.add(currentJobId);
  }
  const missing = dependencies.filter((dependencyId) => !allowedIds.has(dependencyId));
  if (missing.length > 0) {
    throw new Error(`Unknown dependency ids: ${missing.join(", ")}`);
  }
};

const assertValidDag = async (nextJobs: Pick<Job, "id" | "dependencies">[]): Promise<void> => {
  const result = validateDAG(nextJobs);
  if (result.valid) return;
  const pretty = result.cycles.map((cycle) => cycle.join(" -> ")).join("; ");
  throw new Error(`Invalid DAG: cycle detected (${pretty})`);
};

const applyReadiness = async (): Promise<void> => {
  const jobs = await apiStore.listJobs();
  const byId = new Map(jobs.map((job) => [job.id, job]));
  for (const job of jobs) {
    const depsDone = dependenciesDone(job, byId);
    const expectedReady = job.status === "idle" && depsDone;
    const expectedDependsOnCount = uniqueDependencies(job.dependencies).length;

    if (job.ready !== expectedReady || job.dependsOnCount !== expectedDependsOnCount) {
      await apiStore.updateJob(job.id, {
        ready: expectedReady,
        dependsOnCount: expectedDependsOnCount,
        updatedAt: nowIso()
      });
    }
  }
};

const statusLifecyclePatch = (
  status: JobStatus,
  current: Job
): Partial<Pick<Job, "startedAt" | "completedAt" | "ready" | "actionRequired">> => {
  if (status === "running") {
    return {
      ...(current.startedAt ? {} : { startedAt: nowIso() }),
      ready: false
    };
  }

  if (status === "done") {
    return {
      completedAt: nowIso(),
      actionRequired: false,
      ready: false
    };
  }

  if (status === "error") {
    return {
      completedAt: nowIso(),
      actionRequired: true,
      ready: false
    };
  }

  if (status === "idle") {
    return {};
  }

  return {};
};

const resolveProjectScope = async (input: CreateJobInput): Promise<string | undefined> => {
  if (input.projectId?.trim()) {
    return input.projectId.trim();
  }

  if (input.resourceType === "project" && input.resourceId) {
    return input.resourceId;
  }

  if (input.resourceType === "task" && input.resourceId) {
    const task = await apiStore.getTask(input.resourceId);
    return task?.projectId;
  }

  if (input.resourceType === "brainstorm" && input.resourceId) {
    const session = await apiStore.getBrainstormSession(input.resourceId);
    if (session?.projectId) return session.projectId;

    const plan = await apiStore.getBrainstormPlan(input.resourceId);
    if (plan) {
      const sourceSession = await apiStore.getBrainstormSession(plan.sessionId);
      return sourceSession?.projectId;
    }
  }

  return undefined;
};

export const createJob = async (input: CreateJobInput): Promise<Job> => {
  const timestamp = nowIso();
  const dependencies = uniqueDependencies(input.dependencies);
  const all = await apiStore.listJobs();
  const draftId = randomUUID();

  if (dependencies.includes(draftId)) {
    throw new Error("Invalid DAG: a job cannot depend on itself");
  }

  assertDependenciesExist(dependencies, all);
  await assertValidDag([...all, { id: draftId, dependencies }]);

  const byId = new Map(all.map((job) => [job.id, job]));
  const status = input.status ?? "idle";
  const priority = Number.isFinite(input.priority) ? Math.trunc(input.priority ?? 0) : 0;
  const retryCount = Number.isFinite(input.retryCount) ? Math.max(0, Math.trunc(input.retryCount ?? 0)) : 0;
  const maxRetries = Number.isFinite(input.maxRetries) ? Math.max(0, Math.trunc(input.maxRetries ?? 3)) : 3;
  const initialReady = status === "idle" && dependencies.every((dependencyId) => byId.get(dependencyId)?.status === "done");
  const startedAt = status === "running" ? timestamp : undefined;
  const completedAt = status === "done" || status === "error" ? timestamp : undefined;
  const projectId = await resolveProjectScope(input);
  const payloadProvided = asRecord(input.payload);
  let payloadRecord = payloadProvided ?? {};

  if (input.type === "generation") {
    const requestedProvider = readRequestedProvider(payloadRecord);
    const requestedModelId = readRequestedModel(payloadRecord);
    const requestedProviderOrder = readRequestedProviderOrder(payloadRecord);
    const hasRequestedSelection =
      Boolean(requestedProvider) || Boolean(requestedModelId) || requestedProviderOrder.length > 0;
    const shouldResolveSelection = Boolean(payloadProvided) || hasRequestedSelection;

    if (shouldResolveSelection) {
      const providerSelection = await resolveProviderModelSelection({
        tenantId: input.tenantId,
        ...(projectId ? { projectId } : {}),
        ...(requestedProvider ? { requestedProvider } : {}),
        ...(requestedModelId ? { requestedModelId } : {}),
        ...(requestedProviderOrder.length > 0 ? { requestedProviderOrder } : {}),
        capabilityClass: "coding"
      });

      payloadRecord = {
        ...payloadRecord,
        provider: providerSelection.provider,
        providerId: providerSelection.provider,
        providerOrder: providerSelection.providerOrder,
        ...(providerSelection.modelId ? { modelId: providerSelection.modelId, model: providerSelection.modelId } : {}),
        providerResolution: {
          source: providerSelection.source,
          provider: providerSelection.provider,
          providerConfigId: providerSelection.providerConfigId,
          ...(providerSelection.modelId ? { modelId: providerSelection.modelId } : {}),
          resolvedAt: timestamp
        }
      };
    }
  }

  const executionRoute = await resolveExecutionRoute({
    tenantId: input.tenantId,
    ...(projectId ? { projectId } : {}),
    type: input.type,
    title: input.title,
    payload: payloadRecord
  });
  const existingExecution = asRecord(payloadRecord.execution) ?? {};
  const payload = {
    ...payloadRecord,
    execution: {
      ...existingExecution,
      ...executionRoute
    }
  };

  const item = await apiStore.createJob({
    id: draftId,
    tenantId: input.tenantId,
    ...(projectId ? { projectId } : {}),
    type: input.type,
    title: input.title,
    status,
    priority,
    retryCount,
    maxRetries,
    actionRequired: input.actionRequired ?? false,
    ...(input.actionType ? { actionType: input.actionType } : {}),
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    payload,
    dependencies,
    dependsOnCount: dependencies.length,
    ready: initialReady,
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  await applyReadiness();
  return item;
};

export const updateJob = async (
  jobId: string,
  patch: Partial<
    Pick<
      Job,
      | "status"
      | "actionRequired"
      | "actionType"
      | "resourceType"
      | "resourceId"
      | "priority"
      | "retryCount"
      | "maxRetries"
      | "payload"
      | "dependencies"
      | "ready"
      | "startedAt"
      | "completedAt"
    >
  >
): Promise<Job> => {
  const current = await getJob(jobId);
  if (!current) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const normalizedDependencies = patch.dependencies ? uniqueDependencies(patch.dependencies) : current.dependencies;
  if (normalizedDependencies.includes(jobId)) {
    throw new Error("Invalid DAG: a job cannot depend on itself");
  }

  const all = await apiStore.listJobs();
  const allWithoutCurrent = all.filter((job) => job.id !== jobId);
  assertDependenciesExist(normalizedDependencies, allWithoutCurrent, jobId);

  const nextGraph = all.map((job) =>
    job.id === jobId
      ? {
          id: job.id,
          dependencies: normalizedDependencies
        }
      : { id: job.id, dependencies: uniqueDependencies(job.dependencies) }
  );
  await assertValidDag(nextGraph);

  const next = await apiStore.updateJob(jobId, {
    ...patch,
    ...(patch.dependencies ? { dependencies: normalizedDependencies, dependsOnCount: normalizedDependencies.length } : {}),
    updatedAt: nowIso()
  });
  await applyReadiness();
  return next;
};

export const updateJobStatus = async (
  jobId: string,
  status: JobStatus,
  patch?: Partial<Pick<Job, "actionRequired" | "actionType" | "resourceType" | "resourceId">>
): Promise<Job> => {
  const current = await getJob(jobId);
  if (!current) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (status === "running" && !current.ready) {
    throw new Error(`Job ${jobId} cannot start: dependencies are not completed`);
  }

  const lifecyclePatch = statusLifecyclePatch(status, current);
  const updated = await updateJob(jobId, {
    status,
    ...lifecyclePatch,
    ...(patch ?? {})
  });
  await applyReadiness();
  return updated;
};

export const getExecutableJobs = async (projectId?: string): Promise<Job[]> => {
  await applyReadiness();
  const jobs = await listJobs({
    status: "idle",
    ready: true,
    ...(projectId ? { projectId } : {})
  });
  return jobs.sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
};
