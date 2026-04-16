import type { Job, JobType } from "@cp/domain";
import { createJob, getJob, updateJob } from "./jobs-service.js";
import { executeInternalRunnerAction } from "./internal-runner-action-service.js";

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
  Number.parseInt(process.env.RUNNER_UNCLAIMED_FAST_FAIL_MS ?? "", 10) || 12_000
);
const remoteIdleFastFailMs = Math.max(
  1_000,
  Number.parseInt(process.env.RUNNER_REMOTE_IDLE_FAST_FAIL_MS ?? "", 10) || 15_000
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

const shouldInlineRunnerExecution = (): boolean => process.env.NODE_ENV === "test";

const resolveInlineCompletion = (
  action: string,
  payload: Record<string, unknown>
): {
  status: "done" | "waiting_user";
  actionRequired: boolean;
  actionType?: "input";
} => {
  if (action === "brainstorm.start_session" && payload.generatePlan === false) {
    return {
      status: "waiting_user",
      actionRequired: true,
      actionType: "input"
    };
  }

  return {
    status: "done",
    actionRequired: false
  };
};

const executeRunnerJobInline = async (job: Job): Promise<Job> => {
  const payload = asRecord(job.payload) ?? {};
  const action = typeof payload.internalAction === "string" ? payload.internalAction.trim() : "";
  if (!action) {
    throw new Error(`Inline runner execution requires payload.internalAction (job ${job.id})`);
  }

  const startedAt = new Date().toISOString();
  await updateJob(job.id, {
    status: "running",
    actionRequired: false,
    ready: false,
    startedAt
  });

  try {
    const result = await executeInternalRunnerAction({
      action,
      payload
    });
    const completion = resolveInlineCompletion(action, payload);
    const completedAt = completion.status === "done" ? new Date().toISOString() : undefined;
    const nextPayload = {
      ...(job.payload ?? {}),
      output: {
        stage: "internal_runner",
        action,
        result
      }
    };
    await updateJob(job.id, {
      status: completion.status,
      actionRequired: completion.actionRequired,
      ...(completion.actionType ? { actionType: completion.actionType } : {}),
      ready: false,
      ...(completedAt ? { completedAt } : {}),
      payload: nextPayload
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    const nextPayload = {
      ...(job.payload ?? {}),
      lastError: {
        at: failedAt,
        message: error instanceof Error ? error.message : String(error)
      }
    };
    await updateJob(job.id, {
      status: "error",
      actionRequired: true,
      ready: false,
      completedAt: failedAt,
      payload: nextPayload
    });
  }

  const updated = await getJob(job.id);
  if (!updated) {
    throw new Error(`Inline runner job not found after execution: ${job.id}`);
  }
  if (updated.status === "error") {
    const failedPayload = asRecord(updated.payload);
    const lastError = asRecord(failedPayload?.lastError);
    const message =
      typeof lastError?.message === "string"
        ? lastError.message
        : `Inline runner job failed: ${job.id}`;
    throw new Error(message);
  }
  return updated;
};

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
      const message = `No local worker claimed job ${jobId}. Start 'devtools worker start --mode local'.`;
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
      const message = `No worker claimed hybrid job ${jobId}. Start 'devtools worker start --mode hybrid' or ensure remote worker is online.`;
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
      const message = `No remote worker picked up job ${jobId}. Start the worker service or run again with '--mode local'.`;
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
  if (shouldInlineRunnerExecution()) {
    return executeRunnerJobInline(job);
  }
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
