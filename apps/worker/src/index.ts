import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpus, hostname, platform, totalmem } from "node:os";
import { Queue, Worker, Job, type QueueOptions } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@cp/config";
import { PromptBuilderService } from "@cp/prompt-builder";
import type { AgentRuntimeJobData } from "@cp/agents";
import type { Job as RunnerJob } from "@cp/domain";
import type { LocalRepoJobData } from "@cp/local-repos";
import {
  WorkflowLoader,
  RufloOrchestrationService,
  type BudgetLimits,
  type OrchestrationRunEvent,
  type WorkflowDefinition
} from "@cp/orchestration-ruflo";
import {
  BullMqJobExecutionQueue,
  DagRunner,
  InMemoryProviderRateLimiter,
  type JobExecutionResult
} from "@cp/runner";
import { DagWorkerJobStore } from "./dag-job-store.js";

const env = loadEnv();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const agentRuntimeQueueName = "agent-runtime-jobs";
const localRepoQueueName = "local-repo-jobs";
const dagQueuePrefix = "dag-job-execution";

const queueConnection: QueueOptions["connection"] = connection;
const internalRunnerBaseUrl = (
  process.env.RUNNER_INTERNAL_API_URL?.trim() || `http://127.0.0.1:${env.API_PORT}`
).replace(/\/$/, "");
const internalRunnerToken = process.env.RUNNER_INTERNAL_TOKEN?.trim();
const workflowLoader = new WorkflowLoader();
const runnerExecutionRegisterEnabled = process.env.RUNNER_EXECUTION_REGISTER !== "0";
const runnerExecutionHeartbeatMs = Math.max(
  1_000,
  Number.parseInt(process.env.RUNNER_EXECUTION_HEARTBEAT_MS ?? "", 10) || 10_000
);
const runnerExecutionName = process.env.RUNNER_EXECUTION_WORKER_NAME?.trim() || `${hostname()}-remote-runner`;
const runnerExecutionHost = process.env.RUNNER_EXECUTION_WORKER_HOST?.trim() || hostname();
const runnerExecutionCapabilities = ["internal_runner", "remote_worker"];
const runnerExecutionToken = process.env.RUNNER_EXECUTION_TOKEN?.trim();
const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim() || "tenant_default";
let runnerExecutionMachineId: string | null = null;
let runnerExecutionHeartbeatTimer: NodeJS.Timeout | null = null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const toErrorMessage = async (response: Response): Promise<string> => {
  const raw = (await response.text()).trim();
  if (!raw) {
    return `internal runner request failed (${response.status})`;
  }
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed?.message && typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }
  } catch {
    // fall through to raw body preview
  }
  return raw.slice(0, 300);
};

const asNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

type RunnerUsageRecord = NonNullable<JobExecutionResult["usage"]>;

const asUsageRecord = (value: unknown): RunnerUsageRecord | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const provider = asNonEmptyString(record.provider);
  const model = asNonEmptyString(record.model);
  const inputTokens = asNumber(record.inputTokens);
  const outputTokens = asNumber(record.outputTokens);
  const cost = asNumber(record.cost);
  if (!provider || !model || inputTokens === undefined || outputTokens === undefined || cost === undefined) {
    return undefined;
  }
  return {
    provider: provider as RunnerUsageRecord["provider"],
    model,
    inputTokens: Math.max(0, Math.trunc(inputTokens)),
    outputTokens: Math.max(0, Math.trunc(outputTokens)),
    cost: Math.max(0, cost),
    ...(asRecord(record.metadata) ? { metadata: record.metadata as Record<string, unknown> } : {})
  };
};

const executionRequestHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (internalRunnerToken) {
    headers["x-runner-token"] = internalRunnerToken;
  }
  if (runnerExecutionToken) {
    headers["authorization"] = `Bearer ${runnerExecutionToken}`;
  }
  return headers;
};

const postExecutionControl = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`${internalRunnerBaseUrl}${path}`, {
    method: "POST",
    headers: executionRequestHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await toErrorMessage(response));
  }
  return (await response.json()) as T;
};

const registerRunnerExecutionWorker = async (): Promise<void> => {
  if (!runnerExecutionRegisterEnabled) return;
  try {
    const response = await postExecutionControl<{ item?: { id?: string } }>(
      "/execution/workers/register",
      {
        name: runnerExecutionName,
        host: runnerExecutionHost,
        mode: "remote",
        capabilities: runnerExecutionCapabilities,
        metadata: {
          platform: platform(),
          cpuCores: cpus().length,
          ramGb: Math.round(totalmem() / 1024 / 1024 / 1024),
          executionType: "remote_runner"
        }
      }
    );
    runnerExecutionMachineId = asNonEmptyString(response.item?.id ?? undefined) ?? null;
    if (!runnerExecutionMachineId) return;

    await postExecutionControl(`/execution/workers/${runnerExecutionMachineId}/heartbeat`, {
      status: "online",
      capabilities: runnerExecutionCapabilities
    });

    if (runnerExecutionHeartbeatTimer) {
      clearInterval(runnerExecutionHeartbeatTimer);
      runnerExecutionHeartbeatTimer = null;
    }
    runnerExecutionHeartbeatTimer = setInterval(() => {
      if (!runnerExecutionMachineId) return;
      void postExecutionControl(`/execution/workers/${runnerExecutionMachineId}/heartbeat`, {
        status: "online",
        capabilities: runnerExecutionCapabilities
      }).catch((error) => {
        console.warn("[worker] execution heartbeat failed", error);
      });
    }, runnerExecutionHeartbeatMs);

    console.log("[worker] execution worker registered", {
      machineId: runnerExecutionMachineId,
      mode: "remote"
    });
  } catch (error) {
    console.warn("[worker] execution worker registration skipped", error);
  }
};

const markRunnerExecutionWorkerOffline = async (): Promise<void> => {
  if (!runnerExecutionMachineId) return;
  try {
    await postExecutionControl(`/execution/workers/${runnerExecutionMachineId}/heartbeat`, {
      status: "offline",
      capabilities: runnerExecutionCapabilities
    });
  } catch (error) {
    console.warn("[worker] execution worker offline heartbeat failed", error);
  }
};

const normalizeBudget = (value: unknown): BudgetLimits => {
  const record = asRecord(value) ?? {};
  return {
    ...(typeof asNumber(record.maxRetries) === "number"
      ? { maxRetries: Math.max(0, Math.trunc(asNumber(record.maxRetries) ?? 0)) }
      : { maxRetries: 1 }),
    ...(typeof asNumber(record.maxInputTokens) === "number"
      ? { maxInputTokens: Math.max(1, Math.trunc(asNumber(record.maxInputTokens) ?? 1)) }
      : {}),
    ...(typeof asNumber(record.maxOutputTokens) === "number"
      ? { maxOutputTokens: Math.max(1, Math.trunc(asNumber(record.maxOutputTokens) ?? 1)) }
      : {}),
    ...(typeof asNumber(record.maxLatencyMs) === "number"
      ? { maxLatencyMs: Math.max(1, Math.trunc(asNumber(record.maxLatencyMs) ?? 1)) }
      : {}),
    ...(typeof asNumber(record.maxCostUsd) === "number"
      ? { maxCostUsd: Math.max(0.000001, asNumber(record.maxCostUsd) ?? 0.000001) }
      : {})
  };
};

const runRufloWorkflowAction = async (
  job: RunnerJob,
  action: string,
  payload: Record<string, unknown>
): Promise<JobExecutionResult> => {
  if (action !== "ruflo.execute_workflow") {
    throw new Error(`Unsupported Ruflo action: ${action}`);
  }

  const workflowId = asNonEmptyString(payload.workflowId);
  const taskId = asNonEmptyString(payload.taskId) ?? asNonEmptyString(job.resourceId);
  if (!workflowId) {
    throw new Error("Missing required payload field: workflowId");
  }
  if (!taskId) {
    throw new Error("Missing required payload field: taskId");
  }

  const workflows = await workflowLoader.loadAll();
  const workflow = workflows.find((item) => item.id === workflowId);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const eventBuffer: OrchestrationRunEvent[] = [];
  const orchestrationService = new RufloOrchestrationService({
    workflowStore: {
      get: async (id: string): Promise<WorkflowDefinition | null> =>
        workflows.find((item) => item.id === id) ?? null,
      list: async (): Promise<WorkflowDefinition[]> => workflows,
      upsert: async (): Promise<void> => {
        // Workflow definitions are loaded from disk and treated as immutable at runtime.
      }
    },
    eventLogger: {
      append: async (event) => {
        eventBuffer.push(event);
      },
      list: async (runId: string): Promise<OrchestrationRunEvent[]> =>
        eventBuffer.filter((event) => event.runId === runId)
    }
  });

  const actor = asNonEmptyString(payload.actor) ?? job.createdBy ?? "ruflo_runtime";
  const budget = normalizeBudget(payload.budget);
  const runId = asNonEmptyString(payload.runId) ?? randomUUID();
  let run = await orchestrationService.startRun({
    runId,
    taskId,
    workflowId,
    budget,
    actor
  });

  run = await orchestrationService.enforceBudget(run);
  if (run.status === "blocked" || run.status === "waiting_for_approval") {
    return {
      nextStatus: "waiting_user",
      actionRequired: true,
      actionType: "review",
      payloadPatch: {
        output: {
          stage: "ruflo",
          action,
          result: {
            run,
            workflowId,
            workflowVersion: workflow.version,
            events: eventBuffer
          }
        }
      }
    };
  }

  const autoApprove = payload.autoApprove === true;
  for (const step of workflow.steps) {
    await orchestrationService.recordStep({
      runId: run.runId,
      taskId,
      stepId: step.id,
      actor,
      message: `Step started: ${step.id}`,
      eventType: "step_started",
      status: run.status,
      metadata: {
        stepType: step.type
      }
    });

    if (step.type === "approval" && !autoApprove) {
      run = await orchestrationService.transitionRunStatus(run, "waiting_for_approval");
      await orchestrationService.recordStep({
        runId: run.runId,
        taskId,
        stepId: step.id,
        actor,
        message: `Approval required for step ${step.id}`,
        eventType: "verification_requested",
        status: run.status,
        metadata: {
          stepType: step.type
        }
      });
      return {
        nextStatus: "waiting_user",
        actionRequired: true,
        actionType: "approve",
        payloadPatch: {
          output: {
            stage: "ruflo",
            action,
            result: {
              run,
              workflowId,
              workflowVersion: workflow.version,
              awaitingApprovalStepId: step.id,
              events: eventBuffer
            }
          }
        }
      };
    }

    await orchestrationService.recordStep({
      runId: run.runId,
      taskId,
      stepId: step.id,
      actor,
      message: `Step completed: ${step.id}`,
      eventType: "step_completed",
      status: run.status,
      metadata: {
        stepType: step.type
      }
    });
  }

  run = await orchestrationService.transitionRunStatus(run, "completed");
  return {
    nextStatus: "done",
    payloadPatch: {
      output: {
        stage: "ruflo",
        action,
        result: {
          run,
          workflowId,
          workflowVersion: workflow.version,
          events: eventBuffer
        }
      }
    }
  };
};

const runInternalRunnerAction = async (job: RunnerJob): Promise<JobExecutionResult> => {
  const payload = asRecord(job.payload) ?? {};
  const action = typeof payload.internalAction === "string" ? payload.internalAction.trim() : "";
  if (!action) {
    return {
      nextStatus: "done",
      payloadPatch: {
        output: {
          stage: "internal_runner",
          summary: "No internalAction defined; no-op execution."
        }
      }
    };
  }

  if (action.startsWith("ruflo.")) {
    return runRufloWorkflowAction(job, action, payload);
  }

  const requestPayload: Record<string, unknown> = {
    ...payload,
    jobId: job.id,
    ...(typeof payload.tenantId === "string" ? {} : { tenantId: job.tenantId }),
    ...(typeof payload.projectId === "string" || !job.projectId ? {} : { projectId: job.projectId })
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (internalRunnerToken) {
    headers["x-runner-token"] = internalRunnerToken;
  }

  const response = await fetch(`${internalRunnerBaseUrl}/internal/runner/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action,
      payload: requestPayload
    })
  });

  if (!response.ok) {
    const errorMessage = await toErrorMessage(response);
    throw new Error(`internal action "${action}" failed: ${errorMessage}`);
  }

  const body = (await response.json()) as { item?: unknown };
  const itemRecord = asRecord(body.item);
  const usage = asUsageRecord(itemRecord?.usage);
  const result =
    itemRecord && usage
      ? Object.fromEntries(Object.entries(itemRecord).filter(([key]) => key !== "usage"))
      : body.item;
  const shouldWaitForUser = action === "brainstorm.start_session" && payload.generatePlan === false;
  return {
    nextStatus: shouldWaitForUser ? "waiting_user" : "done",
    actionRequired: shouldWaitForUser,
    ...(shouldWaitForUser ? { actionType: "input" as const } : {}),
    ...(usage ? { usage } : {}),
    payloadPatch: {
      output: {
        stage: "internal_runner",
        action,
        ...(result !== undefined ? { result } : {})
      }
    }
  };
};

export const agentRuntimeQueue = new Queue<AgentRuntimeJobData>(agentRuntimeQueueName, { connection });
export const localRepoQueue = new Queue<LocalRepoJobData>(localRepoQueueName, { connection });

const runAgentRuntimeCommand = async (
  job: Job<AgentRuntimeJobData>,
  data: AgentRuntimeJobData
): Promise<void> => {
  const startedAt = Date.now();
  await job.log(`[start] ${data.command} ${data.args.join(" ")}`);
  await job.updateProgress(10);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(data.command, data.args, {
      cwd: data.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, data.timeoutMs);

    const writeLines = async (prefix: string, chunk: Buffer) => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        await job.log(`${prefix}${line}`);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      void writeLines("", chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      void writeLines("[stderr] ", chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Agent runtime command timed out after ${data.timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Agent runtime command failed with code ${code ?? "unknown"} signal ${signal ?? "none"}`));
        return;
      }
      resolve();
    });
  });

  const elapsed = Date.now() - startedAt;
  await job.log(`[done] completed in ${elapsed}ms`);
  await job.updateProgress(100);
};

const runLocalRepoCommand = async (
  job: Job<LocalRepoJobData>,
  data: LocalRepoJobData
): Promise<void> => {
  const startedAt = Date.now();
  await job.log(`[start] ${data.command} ${data.args.join(" ")}`);
  await job.updateProgress(10);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(data.command, data.args, {
      cwd: data.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, 60000);

    const writeLines = async (prefix: string, chunk: Buffer) => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        await job.log(`${prefix}${line}`);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      void writeLines("", chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      void writeLines("[stderr] ", chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Local repo command failed with code ${code ?? "unknown"} signal ${signal ?? "none"}`));
        return;
      }
      resolve();
    });
  });

  const elapsed = Date.now() - startedAt;
  await job.log(`[done] completed in ${elapsed}ms`);
  await job.updateProgress(100);
};

const agentRuntimeWorker = new Worker<AgentRuntimeJobData>(
  agentRuntimeQueueName,
  async (job) => {
    await runAgentRuntimeCommand(job, job.data);
  },
  { connection }
);

const localRepoWorker = new Worker<LocalRepoJobData>(
  localRepoQueueName,
  async (job) => {
    await runLocalRepoCommand(job, job.data);
  },
  { connection }
);

const jobStore = new DagWorkerJobStore({
  baseUrl: internalRunnerBaseUrl,
  ...(internalRunnerToken ? { runnerToken: internalRunnerToken } : {}),
  ...(runnerExecutionToken ? { authorizationToken: runnerExecutionToken } : {})
});
const providerRateLimiter = new InMemoryProviderRateLimiter({
  resolveLimits: async (tenantId, provider) => jobStore.getProviderRateLimits(tenantId, provider)
});
const dagRunners = new Map<string, DagRunner>();
let tenantRefreshTimer: NodeJS.Timeout | null = null;

const startTenantRunner = async (tenantId: string): Promise<void> => {
  if (dagRunners.has(tenantId)) return;
  const queue = new BullMqJobExecutionQueue({
    queueName: `${dagQueuePrefix}:${tenantId}`,
    connection: queueConnection
  });
  const promptBuilder = new PromptBuilderService({
    disableRoleFileFallback: true,
    requireRegistryPrompt: true,
    resolveRoleInstructions: async (role, context) => {
      const resolved = await jobStore.resolveActivePrompt({
        tenantId,
        ...(context?.projectId ? { projectId: context.projectId } : {}),
        type: context?.type ?? "role",
        target: context?.target ?? role
      });
      return resolved ?? undefined;
    }
  });
  const runner = new DagRunner({
    tenantId,
    store: jobStore,
    queue,
    maxConcurrent: 5,
    pollIntervalMs: 1000,
    jobTimeoutMs: 10 * 60_000,
    rateLimiter: providerRateLimiter,
    promptBuilder,
    handlers: {
      brainstorm: runInternalRunnerAction,
      brainstorm_apply: runInternalRunnerAction,
      system: runInternalRunnerAction
    },
    telemetry: {
      recordAuditEvent: async (event) => {
        await jobStore.recordAuditEvent(event);
      },
      recordUsageEvent: async (event) => {
        await jobStore.recordUsageEvent(event);
      }
    }
  });
  await runner.start();
  dagRunners.set(tenantId, runner);
  console.log("[worker] dag runner started", { tenantId });
};

const ensureTenantRunners = async (): Promise<void> => {
  const tenants = await jobStore.listTenants();
  const tenantIds = new Set<string>([defaultTenantId, ...tenants.map((tenant) => tenant.id)]);
  for (const tenantId of tenantIds) {
    await startTenantRunner(tenantId);
  }
};

const startDagRunners = async (): Promise<void> => {
  await ensureTenantRunners();
  await registerRunnerExecutionWorker();
  tenantRefreshTimer = setInterval(() => {
    void ensureTenantRunners().catch((error) => {
      console.error("[worker] tenant runner refresh failed", error);
    });
  }, 30_000);
};

const stopDagRunners = async (): Promise<void> => {
  if (runnerExecutionHeartbeatTimer) {
    clearInterval(runnerExecutionHeartbeatTimer);
    runnerExecutionHeartbeatTimer = null;
  }

  if (tenantRefreshTimer) {
    clearInterval(tenantRefreshTimer);
    tenantRefreshTimer = null;
  }

  for (const [tenantId, runner] of dagRunners.entries()) {
    await runner.stop();
    dagRunners.delete(tenantId);
  }

  await markRunnerExecutionWorkerOffline();
};

const shutdown = async () => {
  await stopDagRunners();
  await Promise.all([
    agentRuntimeWorker.close(),
    localRepoWorker.close()
  ]);
  await Promise.all([
    agentRuntimeQueue.close(),
    localRepoQueue.close()
  ]);
  await jobStore.close();
  await connection.quit();
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

void startDagRunners()
  .then(() => {
    console.log("[worker] started");
  })
  .catch((error) => {
    console.error("[worker] startup failed", error);
    process.exitCode = 1;
  });
