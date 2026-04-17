import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Job, ProviderName } from "@cp/domain";
import type { ProviderRegistry } from "@cp/providers";
import { JobExecutor } from "../executor.js";
import type {
  JobExecutionResult,
  JobRunnerLogger,
  JobRunnerStore,
  RunnerAuditEventInput
} from "../types.js";

const now = () => new Date().toISOString();

const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: overrides.id ?? randomUUID(),
  tenantId: overrides.tenantId ?? "tenant_a",
  type: overrides.type ?? "processing",
  title: overrides.title ?? "job",
  status: overrides.status ?? "running",
  priority: overrides.priority ?? 0,
  retryCount: overrides.retryCount ?? 0,
  maxRetries: overrides.maxRetries ?? 0,
  actionRequired: overrides.actionRequired ?? false,
  ...(overrides.actionType ? { actionType: overrides.actionType } : {}),
  ...(overrides.resourceType ? { resourceType: overrides.resourceType } : {}),
  ...(overrides.resourceId ? { resourceId: overrides.resourceId } : {}),
  ...(overrides.payload ? { payload: overrides.payload } : {}),
  dependencies: overrides.dependencies ?? [],
  dependsOnCount: overrides.dependsOnCount ?? (overrides.dependencies?.length ?? 0),
  ready: overrides.ready ?? false,
  ...(overrides.startedAt ? { startedAt: overrides.startedAt } : {}),
  ...(overrides.completedAt ? { completedAt: overrides.completedAt } : {}),
  createdBy: overrides.createdBy ?? "tester",
  createdAt: overrides.createdAt ?? now(),
  updatedAt: overrides.updatedAt ?? now(),
  ...(overrides.projectId ? { projectId: overrides.projectId } : {})
});

class InMemoryStore implements JobRunnerStore {
  constructor(private readonly jobs = new Map<string, Job>()) {}

  readonly logs: Array<{ jobId: string; line: string }> = [];

  async listJobs(tenantId: string): Promise<Job[]> {
    return [...this.jobs.values()].filter((job) => job.tenantId === tenantId);
  }

  async getJob(jobId: string, tenantId: string): Promise<Job | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.tenantId !== tenantId) return null;
    return { ...job };
  }

  async updateJob(jobId: string, tenantId: string, patch: Partial<Job>): Promise<Job> {
    const current = await this.getJob(jobId, tenantId);
    if (!current) throw new Error(`Missing job ${jobId}`);
    const next = { ...current, ...patch };
    this.jobs.set(jobId, next);
    return { ...next };
  }

  async appendJobLog(jobId: string, _tenantId: string, line: string): Promise<void> {
    this.logs.push({ jobId, line });
  }

  seed(job: Job): void {
    this.jobs.set(job.id, { ...job });
  }
}

class RecordingLogger implements JobRunnerLogger {
  readonly infoCalls: Array<{ message: string; metadata?: Record<string, unknown> }> = [];
  readonly warnCalls: Array<{ message: string; metadata?: Record<string, unknown> }> = [];
  readonly errorCalls: Array<{ message: string; metadata?: Record<string, unknown> }> = [];

  info = (message: string, metadata?: Record<string, unknown>): void => {
    this.infoCalls.push(metadata ? { message, metadata } : { message });
  };

  warn = (message: string, metadata?: Record<string, unknown>): void => {
    this.warnCalls.push(metadata ? { message, metadata } : { message });
  };

  error = (message: string, metadata?: Record<string, unknown>): void => {
    this.errorCalls.push(metadata ? { message, metadata } : { message });
  };
}

const stubProviderRegistry = {
  get: () => undefined
} as unknown as ProviderRegistry;

const stubPromptBuilder = {
  buildPrompt: async () => "prompt"
} as unknown;

const makeExecutor = (
  store: InMemoryStore,
  logger: RecordingLogger,
  options?: {
    telemetry?: {
      recordAuditEvent?: (event: RunnerAuditEventInput) => Promise<void>;
    };
    handlers?: Partial<Record<Job["type"], ((job: Job) => Promise<JobExecutionResult>) | undefined>>;
  }
): JobExecutor => {
  const executorOptions = {
    tenantId: "tenant_a",
    store,
    logger,
    providerOrder: ["openai", "anthropic", "gemini", "openrouter"] as ProviderName[],
    providerRegistry: stubProviderRegistry,
    promptBuilder: stubPromptBuilder as never,
    ...(options?.handlers ? { handlers: options.handlers } : {}),
    ...(options?.telemetry ? { telemetry: options.telemetry } : {})
  } as any;
  return new JobExecutor(executorOptions);
};

describe("JobExecutor", () => {
  it("fails closed when a handler is missing", async () => {
    const store = new InMemoryStore();
    const logger = new RecordingLogger();
    const job = makeJob({
      id: "job_missing_handler",
      type: "processing",
      status: "running",
      maxRetries: 0
    });
    store.seed(job);

    const executor = makeExecutor(store, logger, {
      handlers: {
        processing: undefined
      }
    });

    await expect(executor.execute(job.id)).resolves.toBeUndefined();

    const updated = await store.getJob(job.id, "tenant_a");
    expect(updated?.status).toBe("error");
    expect(updated?.actionRequired).toBe(true);
    expect(logger.errorCalls.length).toBeGreaterThan(0);
  });

  it("logs retryable failures before retrying", async () => {
    const store = new InMemoryStore();
    const logger = new RecordingLogger();
    const job = makeJob({
      id: "job_retryable_failure",
      type: "processing",
      status: "running",
      maxRetries: 1
    });
    store.seed(job);

    const executor = makeExecutor(store, logger, {
      handlers: {
        processing: async () => {
          throw new Error("boom");
        }
      }
    });

    await expect(executor.execute(job.id)).resolves.toBeUndefined();

    const updated = await store.getJob(job.id, "tenant_a");
    expect(updated?.status).toBe("idle");
    expect(updated?.retryCount).toBe(1);
    expect(
      logger.errorCalls.some(
        (entry) =>
          entry.message === "job execution failed" &&
          entry.metadata?.terminal === false &&
          entry.metadata?.error === "boom"
      )
    ).toBe(true);
  });

  it("logs audit telemetry failures without masking the job result", async () => {
    const store = new InMemoryStore();
    const logger = new RecordingLogger();
    const job = makeJob({
      id: "job_audit_failure",
      type: "processing",
      status: "running",
      maxRetries: 0
    });
    store.seed(job);

    const executor = makeExecutor(store, logger, {
      telemetry: {
        recordAuditEvent: async () => {
          throw new Error("audit sink down");
        }
      },
      handlers: {
        processing: async () => ({
          nextStatus: "done",
          payloadPatch: {
            output: {
              stage: "processing",
              ok: true
            }
          }
        })
      }
    });

    await expect(executor.execute(job.id)).resolves.toBeUndefined();

    const updated = await store.getJob(job.id, "tenant_a");
    expect(updated?.status).toBe("done");
    expect(
      logger.errorCalls.filter((entry) => entry.message === "audit telemetry failed").length
    ).toBeGreaterThan(0);
  });
});
