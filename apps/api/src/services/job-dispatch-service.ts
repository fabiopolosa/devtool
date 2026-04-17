import type { Job, JobType } from "@cp/domain";
import { createJob, getJob, updateJob } from "./jobs-service.js";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const unclaimedFastFailMs = Math.max(
  1_000,
  Number.parseInt(process.env.RUNNER_UNCLAIMED_FAST_FAIL_MS ?? "", 10) || 4_500
);
const remoteIdleFastFailMs = Math.max(
  1_000,
  Number.parseInt(process.env.RUNNER_REMOTE_IDLE_FAST_FAIL_MS ?? "", 10) || 4_500
);

export interface DispatchRunnerJobInput {
  tenantId: string;
  createdBy: string;
  type: JobType;
  title: string;
  payload: Record<string, unknown>;
  projectId?: string;
  resourceType?: string;
  resourceId?: string;
  priority?: number;
  maxRetries?: number;
}

export interface AwaitRunnerJobOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export const dispatchRunnerJob = async (input: DispatchRunnerJobInput): Promise<Job> =>
  createJob({
    tenantId: input.tenantId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    type: input.type,
    title: input.title,
    status: "idle",
    ...(typeof input.priority === "number" ? { priority: input.priority } : {}),
    ...(typeof input.maxRetries === "number" ? { maxRetries: input.maxRetries } : {}),
    actionRequired: false,
    ...(input.resourceType ? { resourceType: input.resourceType } : {}),
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    payload: input.payload,
    createdBy: input.createdBy
  });

export const awaitRunnerJobCompletion = async (
  jobId: string,
  options: AwaitRunnerJobOptions = {}
): Promise<Job> => {
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? 120_000);
  const pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 500);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const elapsedMs = Date.now() - startedAt;
    const item = await getJob(jobId);
    if (!item) {
      throw new Error(`Dispatched job not found: ${jobId}`);
    }

    if (item.status === "done" || item.status === "waiting_user") {
      return item;
    }

    if (item.status === "error") {
      const payload = asRecord(item.payload);
      const lastError = asRecord(payload?.lastError);
      const errorMessage =
        typeof lastError?.message === "string"
          ? lastError.message
          : `Runner job failed: ${item.id}`;
      throw new Error(errorMessage);
    }

    const payload = asRecord(item.payload) ?? {};
    const execution = asRecord(payload.execution);
    const dispatchTarget = asString(execution?.dispatchTarget);
    const claimedByMachineId = asString(execution?.claimedByMachineId);

    if (
      item.status === "idle" &&
      elapsedMs >= unclaimedFastFailMs &&
      dispatchTarget === "local_worker" &&
      !claimedByMachineId
    ) {
      const failedAt = new Date().toISOString();
      const message = `No local worker available for job ${jobId}. Start 'devtools worker start --mode local' and retry.`;
      await updateJob(item.id, {
        status: "error",
        actionRequired: true,
        ready: false,
        completedAt: failedAt,
        payload: {
          ...payload,
          lastError: {
            at: failedAt,
            message
          }
        }
      });
      throw new Error(message);
    }

    if (
      item.status === "idle" &&
      elapsedMs >= unclaimedFastFailMs &&
      dispatchTarget === "hybrid" &&
      !claimedByMachineId
    ) {
      const failedAt = new Date().toISOString();
      const message = `No compatible worker claimed hybrid job ${jobId}. Start 'devtools worker start --mode hybrid' or use '--mode local'.`;
      await updateJob(item.id, {
        status: "error",
        actionRequired: true,
        ready: false,
        completedAt: failedAt,
        payload: {
          ...payload,
          lastError: {
            at: failedAt,
            message
          }
        }
      });
      throw new Error(message);
    }

    if (
      item.status === "idle" &&
      elapsedMs >= remoteIdleFastFailMs &&
      dispatchTarget === "remote_worker"
    ) {
      const failedAt = new Date().toISOString();
      const message = `No remote worker available for job ${jobId}. Start the remote worker service, or run 'devtools worker start --mode local' and retry with '--mode local'.`;
      await updateJob(item.id, {
        status: "error",
        actionRequired: true,
        ready: false,
        completedAt: failedAt,
        payload: {
          ...payload,
          lastError: {
            at: failedAt,
            message
          }
        }
      });
      throw new Error(message);
    }

    await sleep(pollIntervalMs);
  }

  const timedOut = await getJob(jobId);
  if (timedOut) {
    const payload = asRecord(timedOut.payload);
    const execution = asRecord(payload?.execution);
    const dispatchTarget = asString(execution?.dispatchTarget);
    const claimedByMachineId = asString(execution?.claimedByMachineId);
    if (dispatchTarget === "local_worker" && !claimedByMachineId) {
      throw new Error(
        `Runner job timed out after ${timeoutMs}ms: ${jobId}. No local worker claimed the job. Start 'devtools worker start --mode local'.`
      );
    }
    if (dispatchTarget === "hybrid" && !claimedByMachineId) {
      throw new Error(
        `Runner job timed out after ${timeoutMs}ms: ${jobId}. No worker claimed the hybrid job. Start 'devtools worker start --mode hybrid' or ensure remote worker is online.`
      );
    }
  }

  throw new Error(`Runner job timed out after ${timeoutMs}ms: ${jobId}`);
};

export const dispatchAndAwaitRunnerJob = async (
  input: DispatchRunnerJobInput,
  options?: AwaitRunnerJobOptions
): Promise<Job> => {
  const job = await dispatchRunnerJob(input);
  return awaitRunnerJobCompletion(job.id, options);
};

export const getRunnerJobOutput = <T>(job: Job): T | undefined => {
  const payload = asRecord(job.payload);
  if (!payload) return undefined;
  const output = asRecord(payload.output);
  if (!output) return payload.output as T | undefined;
  if (asString(output.stage) !== "local_worker") {
    return output as T;
  }

  const localResult = asRecord(output.result);
  if (!localResult || asString(localResult.stage) !== "internal_runner") {
    return output as T;
  }

  const wrapped = asRecord(localResult.output);
  if (!wrapped) {
    return output as T;
  }

  const normalized: Record<string, unknown> = {
    stage: "internal_runner",
    ...(asString(wrapped.action) ? { action: asString(wrapped.action) } : {}),
    ...(wrapped.result !== undefined ? { result: wrapped.result } : {}),
    ...(wrapped.output !== undefined && wrapped.result === undefined ? { result: wrapped.output } : {})
  };

  const machineId = asString(output.machineId);
  const adapter = asString(localResult.adapter);
  if (machineId || adapter || Array.isArray(localResult.logs)) {
    normalized.localExecution = {
      ...(machineId ? { machineId } : {}),
      ...(adapter ? { adapter } : {}),
      ...(Array.isArray(localResult.logs) ? { logs: localResult.logs } : {})
    };
  }

  return normalized as T;
};
