import type { Job, JobType, ProviderName } from "@cp/domain";
import { PromptBuilderService } from "@cp/prompt-builder";
import { createDefaultProviderRegistry } from "@cp/providers";
import { createGenerationHandler } from "./handlers/generation-handler.js";
import {
  defaultDeploymentHandler,
  defaultIngestionHandler,
  defaultProcessingHandler
} from "./handlers/default-handlers.js";
import type {
  JobExecutionResult,
  JobExecutorOptions,
  JobHandler,
  JobRunnerLogger,
  JobRunnerStore,
  JobTelemetrySink
} from "./types.js";
import { asRecord, mergePayload, nowIso, toText } from "./utils.js";

const defaultProviderOrder: ProviderName[] = ["openai", "anthropic", "gemini", "openrouter"];

const mergeDependencyPayload = async (
  store: JobRunnerStore,
  tenantId: string,
  job: Job
): Promise<Record<string, unknown> | undefined> => {
  if (!job.dependencies.length) return asRecord(job.payload);
  const upstream: Record<string, unknown>[] = [];
  for (const dependencyId of job.dependencies) {
    const dependency = await store.getJob(dependencyId, tenantId);
    if (!dependency) continue;
    upstream.push({
      jobId: dependency.id,
      type: dependency.type,
      status: dependency.status,
      output: asRecord(dependency.payload)?.output ?? null
    });
  }

  const currentPayload = asRecord(job.payload) ?? {};
  return {
    ...currentPayload,
    upstream
  };
};

const normalizeKnowledgeQuery = (job: Job): string => {
  const payload = asRecord(job.payload);
  const inputText = typeof payload?.inputText === "string" ? payload.inputText : "";
  const context = asRecord(payload?.context);
  const contextSummary = [
    typeof context?.goal === "string" ? context.goal : "",
    typeof context?.summary === "string" ? context.summary : "",
    typeof context?.scope === "string" ? context.scope : ""
  ]
    .filter(Boolean)
    .join(" ");

  return [job.title, inputText, contextSummary]
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join(" ")
    .slice(0, 900);
};

const defaultKnowledgeConfig = {
  scope: "tenant" as const,
  autoCapture: false,
  captureModes: ["generation_output"],
  requireApproval: false,
  maxNodes: 6,
  relevanceThreshold: 0.2,
  versioning: true,
  requireReview: false
};

const captureEligibleJobTypes = new Set<Job["type"]>([
  "generation",
  "brainstorm",
  "brainstorm_apply",
  "review"
]);

const knowledgeInjectionEligibleJobTypes = new Set<Job["type"]>([
  "generation",
  "brainstorm",
  "brainstorm_apply",
  "agent_runtime",
  "system"
]);

const meaningfulKnowledgePatterns = [
  /^#{1,3}\s+\S+/m,
  /\b(decision|insight|pattern|principle|guideline|finding|lesson|trade[- ]?off|recommendation|constraint|architecture)\b/i,
  /(^|\n)\s*[-*]\s+\S+/m
];

export class JobExecutor {
  private readonly tenantId: string;
  private readonly store: JobRunnerStore;
  private readonly logger: JobRunnerLogger;
  private readonly telemetry: JobTelemetrySink | undefined;
  private readonly handlers: Record<JobType, JobHandler>;

  constructor(options: JobExecutorOptions) {
    this.tenantId = options.tenantId;
    this.store = options.store;
    this.logger = options.logger;
    this.telemetry = options.telemetry;

    const promptBuilder = options.promptBuilder ?? new PromptBuilderService();
    const providerRegistry = options.providerRegistry ?? createDefaultProviderRegistry();
    const providerOrder = options.providerOrder ?? defaultProviderOrder;
    const generationHandler = createGenerationHandler({
      promptBuilder,
      providerRegistry,
      providerOrder,
      ...(options.rateLimiter ? { rateLimiter: options.rateLimiter } : {})
    });

    this.handlers = {
      ingestion: async (job) => defaultIngestionHandler(job),
      processing: async (job) => defaultProcessingHandler(job),
      generation: async (job) => generationHandler(job),
      review: async () => ({
        nextStatus: "waiting_user",
        actionRequired: true,
        actionType: "review"
      }),
      deployment: async (job) => defaultDeploymentHandler(job),
      brainstorm: async (job) => defaultProcessingHandler(job),
      brainstorm_apply: async (job) => defaultProcessingHandler(job),
      agent_runtime: async (job) => defaultProcessingHandler(job),
      system: async (job) => defaultProcessingHandler(job),
      ...(options.handlers ?? {})
    };
  }

  async execute(jobId: string): Promise<void> {
    const job = await this.store.getJob(jobId, this.tenantId);
    if (!job) return;
    if (job.status !== "running") return;

    try {
      await this.appendLog(job.id, `start type=${job.type} priority=${job.priority}`);
      await this.emitAudit("job.start", job, "success", {
        status: job.status,
        type: job.type,
        priority: job.priority
      });
      const payloadWithDependencies = await mergeDependencyPayload(this.store, this.tenantId, job);
      const hydrated = payloadWithDependencies ? { ...job, payload: payloadWithDependencies } : job;
      const withKnowledge = await this.withKnowledgeContext(hydrated);
      await this.appendProviderResolutionLog(withKnowledge);
      const result = await this.dispatchToHandler(withKnowledge);
      await this.completeJob(withKnowledge, result);
    } catch (error) {
      await this.failJob(job, error);
    }
  }

  private async dispatchToHandler(job: Job): Promise<JobExecutionResult> {
    const handler = this.handlers[job.type];
    if (!handler) {
      return {
        nextStatus: "done",
        payloadPatch: {
          output: { message: `No handler registered for ${job.type}; marked as done.` }
        }
      };
    }
    return handler(job);
  }

  private async completeJob(job: Job, result: JobExecutionResult): Promise<void> {
    const nextStatus = result.nextStatus;
    const payload = mergePayload(asRecord(job.payload), result.payloadPatch);

    if (nextStatus === "done") {
      await this.store.updateJob(job.id, this.tenantId, {
        status: "done",
        actionRequired: false,
        ready: false,
        completedAt: nowIso(),
        ...(payload ? { payload } : {}),
        updatedAt: nowIso()
      });
      await this.appendLog(job.id, "end status=done");
      await this.emitAudit("job.end", job, "success", {
        status: "done",
        nextStatus,
        hasUsage: Boolean(result.usage)
      });
      await this.emitUsage(job, result.usage);
      await this.persistKnowledgeInsight(job, result, payload);
      return;
    }

    if (nextStatus === "waiting_user") {
      await this.store.updateJob(job.id, this.tenantId, {
        status: "waiting_user",
        actionRequired: result.actionRequired ?? true,
        ...(result.actionType ? { actionType: result.actionType } : {}),
        ...(payload ? { payload } : {}),
        updatedAt: nowIso()
      });
      await this.appendLog(job.id, "end status=waiting_user");
      await this.emitAudit("job.end", job, "success", {
        status: "waiting_user",
        nextStatus,
        hasUsage: Boolean(result.usage)
      });
      await this.emitUsage(job, result.usage);
      return;
    }

    if (nextStatus === "idle") {
      await this.store.updateJob(job.id, this.tenantId, {
        status: "idle",
        actionRequired: result.actionRequired ?? false,
        ...(result.actionType ? { actionType: result.actionType } : {}),
        ...(payload ? { payload } : {}),
        updatedAt: nowIso()
      });
      await this.appendLog(job.id, "end status=idle");
      await this.emitAudit("job.end", job, "success", {
        status: "idle",
        nextStatus,
        hasUsage: Boolean(result.usage)
      });
      await this.emitUsage(job, result.usage);
      return;
    }

    await this.store.updateJob(job.id, this.tenantId, {
      status: nextStatus,
      actionRequired: result.actionRequired ?? true,
      ...(result.actionType ? { actionType: result.actionType } : {}),
      ...(payload ? { payload } : {}),
      ...(nextStatus === "error" ? { completedAt: nowIso() } : {}),
      updatedAt: nowIso()
    });
    await this.appendLog(job.id, `end status=${nextStatus}`);
    await this.emitAudit(
      "job.end",
      job,
      nextStatus === "error" ? "failure" : "success",
      {
        status: nextStatus,
        nextStatus,
        hasUsage: Boolean(result.usage)
      }
    );
    await this.emitUsage(job, result.usage);
  }

  private async failJob(job: Job, error: unknown): Promise<void> {
    const current = await this.store.getJob(job.id, this.tenantId);
    if (!current) return;

    const nextRetryCount = current.retryCount + 1;
    const currentPayload = asRecord(current.payload);
    const errorPayload = mergePayload(currentPayload, {
      lastError: {
        at: nowIso(),
        message: toText(error)
      }
    });

    if (nextRetryCount <= current.maxRetries) {
      await this.store.updateJob(job.id, this.tenantId, {
        status: "idle",
        retryCount: nextRetryCount,
        actionRequired: false,
        ready: false,
        ...(errorPayload ? { payload: errorPayload } : {}),
        updatedAt: nowIso()
      });
      await this.appendLog(job.id, `error retry=${nextRetryCount}/${current.maxRetries} ${toText(error)}`);
      await this.emitAudit("job.error", current, "failure", {
        error: toText(error),
        retryCount: nextRetryCount,
        terminal: false
      });
      return;
    }

    await this.store.updateJob(job.id, this.tenantId, {
      status: "error",
      retryCount: nextRetryCount,
      actionRequired: true,
      actionType: "review",
      ready: false,
      completedAt: nowIso(),
      ...(errorPayload ? { payload: errorPayload } : {}),
      updatedAt: nowIso()
    });
    await this.appendLog(job.id, `error terminal retries=${nextRetryCount} ${toText(error)}`);
    await this.emitAudit("job.error", current, "failure", {
      error: toText(error),
      retryCount: nextRetryCount,
      terminal: true
    });
    this.logger.error("job execution failed", { tenantId: this.tenantId, jobId: job.id, error: toText(error) });
  }

  private async appendLog(jobId: string, line: string): Promise<void> {
    this.logger.info(line, { tenantId: this.tenantId, jobId });
    if (this.store.appendJobLog) {
      await this.store.appendJobLog(jobId, this.tenantId, line);
    }
  }

  private async appendProviderResolutionLog(job: Job): Promise<void> {
    if (job.type !== "generation") return;
    const payload = asRecord(job.payload);
    const resolution = asRecord(payload?.providerResolution);
    if (!resolution) return;
    const source = typeof resolution.source === "string" ? resolution.source : "unknown";
    const provider = typeof resolution.provider === "string" ? resolution.provider : "";
    const modelId = typeof resolution.modelId === "string" ? resolution.modelId : "";
    if (!provider) return;
    await this.appendLog(
      job.id,
      `provider resolved source=${source} provider=${provider}${modelId ? ` model=${modelId}` : ""}`
    );
  }

  private async withKnowledgeContext(job: Job): Promise<Job> {
    if (!knowledgeInjectionEligibleJobTypes.has(job.type) || !this.store.searchKnowledgeContext) {
      return job;
    }

    const query = normalizeKnowledgeQuery(job);
    if (!query) return job;

    const projectId = job.projectId ?? (job.resourceType === "project" ? job.resourceId : undefined);
    try {
      const knowledgeConfig = this.store.getKnowledgeConfig
        ? await this.store.getKnowledgeConfig({
            tenantId: job.tenantId,
            ...(projectId ? { projectId } : {})
          })
        : defaultKnowledgeConfig;
      const knowledge = await this.store.searchKnowledgeContext({
        tenantId: job.tenantId,
        ...(projectId ? { projectId } : {}),
        query,
        limit: knowledgeConfig.maxNodes,
        threshold: knowledgeConfig.relevanceThreshold
      });
      if (knowledge.length === 0) return job;

      const payload = asRecord(job.payload) ?? {};
      const context = asRecord(payload.context) ?? {};
      const withContext = {
        ...payload,
        context: {
          ...context,
          knowledge
        }
      };

      return {
        ...job,
        payload: withContext
      };
    } catch (error) {
      this.logger.warn("knowledge context injection failed", {
        tenantId: job.tenantId,
        jobId: job.id,
        error: toText(error)
      });
      return job;
    }
  }

  private async persistKnowledgeInsight(
    job: Job,
    result: JobExecutionResult,
    payload: Record<string, unknown> | undefined
  ): Promise<void> {
    if (!captureEligibleJobTypes.has(job.type) || !this.store.storeKnowledgeInsight) return;

    const sourcePayload = payload ?? {};
    const projectId = job.projectId ?? (job.resourceType === "project" ? job.resourceId : undefined);
    const knowledgeConfig = this.store.getKnowledgeConfig
      ? await this.store.getKnowledgeConfig({
          tenantId: job.tenantId,
          ...(projectId ? { projectId } : {})
        })
      : defaultKnowledgeConfig;

    const explicitCapture =
      sourcePayload.captureKnowledge === true ||
      (typeof sourcePayload.captureKnowledge === "string" &&
        sourcePayload.captureKnowledge.toLowerCase() === "true");
    const autoCaptureEnabled =
      knowledgeConfig.autoCapture && knowledgeConfig.captureModes.includes("generation_output");
    const shouldCapture = explicitCapture || autoCaptureEnabled;
    if (!shouldCapture) return;

    if (knowledgeConfig.requireApproval || knowledgeConfig.requireReview) {
      await this.appendLog(
        job.id,
        "knowledge capture skipped: requireApproval/requireReview is enabled in knowledge config"
      );
      return;
    }

    const output = asRecord(sourcePayload.output);
    const outputText = typeof output?.text === "string" ? output.text.trim() : "";
    if (autoCaptureEnabled && !explicitCapture && !this.isMeaningfulKnowledgeContent(outputText)) {
      await this.appendLog(job.id, "knowledge capture skipped: output not meaningful enough for auto-capture");
      return;
    }
    const usage = result.usage
      ? `\n\n## Usage\n- provider: ${result.usage.provider}\n- model: ${result.usage.model}\n- input tokens: ${result.usage.inputTokens}\n- output tokens: ${result.usage.outputTokens}\n- estimated cost: ${result.usage.cost.toFixed(6)}`
      : "";
    if (!outputText) return;

    const title = typeof sourcePayload.knowledgeTitle === "string" && sourcePayload.knowledgeTitle.trim().length > 0
      ? sourcePayload.knowledgeTitle.trim()
      : `Job insight: ${job.title}`;

    const content = [
      `# ${title}`,
      "",
      "## Decision / Insight",
      outputText.slice(0, 5000),
      usage
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await this.store.storeKnowledgeInsight({
        tenantId: job.tenantId,
        ...(projectId ? { projectId } : {}),
        jobId: job.id,
        title,
        content,
        actor: "runner",
        scope: knowledgeConfig.scope
      });
    } catch (error) {
      this.logger.warn("knowledge insight persistence failed", {
        tenantId: job.tenantId,
        jobId: job.id,
        error: toText(error)
      });
    }
  }

  private async emitAudit(
    action: string,
    job: Job,
    status: "success" | "failure",
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    if (!this.telemetry?.recordAuditEvent) return;
    try {
      await this.telemetry.recordAuditEvent({
        tenantId: job.tenantId,
        ...(job.projectId ? { projectId: job.projectId } : {}),
        jobId: job.id,
        action,
        resourceType: "job",
        resourceId: job.id,
        status,
        metadata,
        actor: "runner",
        occurredAt: nowIso()
      });
    } catch (error) {
      this.logger.warn("audit telemetry failed", {
        tenantId: this.tenantId,
        jobId: job.id,
        action,
        error: toText(error)
      });
    }
  }

  private async emitUsage(job: Job, usage?: JobExecutionResult["usage"]): Promise<void> {
    if (!usage || !this.telemetry?.recordUsageEvent) return;
    try {
      await this.telemetry.recordUsageEvent({
        tenantId: job.tenantId,
        ...(job.projectId ? { projectId: job.projectId } : {}),
        jobId: job.id,
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: usage.cost,
        metadata: {
          ...(usage.metadata ?? {}),
          jobType: job.type
        },
        actor: "runner",
        occurredAt: nowIso()
      });
    } catch (error) {
      this.logger.warn("usage telemetry failed", {
        tenantId: this.tenantId,
        jobId: job.id,
        provider: usage.provider,
        model: usage.model,
        error: toText(error)
      });
    }
  }

  private isMeaningfulKnowledgeContent(value: string): boolean {
    const text = value.trim();
    if (text.length < 120) return false;
    return meaningfulKnowledgePatterns.some((pattern) => pattern.test(text)) || text.split("\n").length >= 4;
  }
}
