import { PromptBuilderService } from "@cp/prompt-builder";
import { createDefaultProviderRegistry } from "@cp/providers";
import { JobExecutor } from "./executor.js";
import { JobScheduler } from "./scheduler.js";
import type {
  DagRunnerOptions,
  JobExecutorOptions,
  JobQueuePayload,
  JobRunnerLogger,
  JobRunnerStore
} from "./types.js";
import { wait } from "./utils.js";

const defaultLogger: JobRunnerLogger = {
  info: (message, metadata) => {
    if (metadata) {
      console.log(`[dag-runner] ${message}`, metadata);
      return;
    }
    console.log(`[dag-runner] ${message}`);
  },
  warn: (message, metadata) => {
    if (metadata) {
      console.warn(`[dag-runner] ${message}`, metadata);
      return;
    }
    console.warn(`[dag-runner] ${message}`);
  },
  error: (message, metadata) => {
    if (metadata) {
      console.error(`[dag-runner] ${message}`, metadata);
      return;
    }
    console.error(`[dag-runner] ${message}`);
  }
};

export class DagRunner {
  private readonly tenantId: string;
  private readonly store: JobRunnerStore;
  private readonly queue: DagRunnerOptions["queue"];
  private readonly logger: JobRunnerLogger;
  private readonly autoPolling: boolean;
  private readonly pollIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly scheduler: JobScheduler;
  private readonly executor: JobExecutor;
  private readonly inFlight = new Set<string>();
  private started = false;
  private stopRequested = false;
  private pollLoopPromise: Promise<void> | null = null;

  constructor(options: DagRunnerOptions) {
    this.tenantId = options.tenantId;
    this.store = options.store;
    this.queue = options.queue;
    this.logger = options.logger ?? defaultLogger;
    this.autoPolling = options.autoPolling ?? true;
    this.pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 1000);
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 5);

    this.scheduler = new JobScheduler({
      tenantId: this.tenantId,
      store: this.store,
      logger: this.logger,
      maxConcurrent: this.maxConcurrent,
      jobTimeoutMs: Math.max(30_000, options.jobTimeoutMs ?? 10 * 60_000)
    });

    const executorOptions: JobExecutorOptions = {
      tenantId: this.tenantId,
      store: this.store,
      logger: this.logger,
      providerOrder: options.providerOrder ?? ["openai", "anthropic", "gemini", "openrouter"],
      providerRegistry: options.providerRegistry ?? createDefaultProviderRegistry(),
      promptBuilder: options.promptBuilder ?? new PromptBuilderService({ requireRegistryPrompt: true }),
      ...(options.rateLimiter ? { rateLimiter: options.rateLimiter } : {}),
      ...(options.telemetry ? { telemetry: options.telemetry } : {}),
      ...(options.handlers ? { handlers: options.handlers } : {})
    };
    this.executor = new JobExecutor(executorOptions);
  }

  isRunning(): boolean {
    return this.started && !this.stopRequested;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopRequested = false;

    await this.queue.startWorker(
      async (payload) => {
        await this.processQueuedJob(payload);
      },
      this.maxConcurrent
    );

    if (this.autoPolling) {
      this.pollLoopPromise = this.pollLoop();
    }
    this.logger.info("runner started", {
      tenantId: this.tenantId,
      pollIntervalMs: this.pollIntervalMs,
      maxConcurrent: this.maxConcurrent
    });
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.pollLoopPromise) {
      await this.pollLoopPromise;
      this.pollLoopPromise = null;
    }
    await this.queue.close();
    this.started = false;
    this.logger.info("runner stopped", { tenantId: this.tenantId });
  }

  async runOnce(): Promise<number> {
    await this.scheduler.recoverTimedOutRunningJobs();
    await this.scheduler.reconcileReadiness();

    const claimed = await this.scheduler.claimNextBatch(this.inFlight.size);
    if (claimed.length === 0) return 0;

    for (const job of claimed) {
      this.inFlight.add(job.id);
      await this.queue.enqueue({
        tenantId: this.tenantId,
        jobId: job.id
      });
    }

    return claimed.length;
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error("runner loop error", { tenantId: this.tenantId, error: String(error) });
      }
      const steps = Math.max(1, Math.ceil(this.pollIntervalMs / 250));
      for (let step = 0; step < steps; step += 1) {
        if (this.stopRequested) break;
        await wait(Math.min(250, this.pollIntervalMs));
      }
    }
  }

  private async processQueuedJob(payload: JobQueuePayload): Promise<void> {
    if (payload.tenantId !== this.tenantId) {
      this.logger.warn("ignored job for foreign tenant", {
        tenantId: this.tenantId,
        payloadTenantId: payload.tenantId,
        jobId: payload.jobId
      });
      return;
    }

    try {
      await this.executor.execute(payload.jobId);
    } finally {
      this.inFlight.delete(payload.jobId);
      try {
        await this.scheduler.reconcileReadiness();
      } catch (error) {
        this.logger.error("reconcile readiness failed", {
          tenantId: this.tenantId,
          jobId: payload.jobId,
          error: String(error)
        });
      }
    }
  }
}
