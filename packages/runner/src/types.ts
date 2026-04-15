import type {
  BrainstormPlanPayload,
  ChatReasoningProvider,
  CodingProvider,
  Job,
  JobActionType,
  JobStatus,
  JobType,
  KnowledgeConfig,
  ProviderName,
  Subprompt
} from "@cp/domain";
import type { PromptBuilderService } from "@cp/prompt-builder";
import type { ProviderRegistry } from "@cp/providers";
import type { ProviderRateLimiter } from "./rate-limit.js";

export interface JobRunnerStore {
  listJobs(tenantId: string): Promise<Job[]>;
  getJob(jobId: string, tenantId: string): Promise<Job | null>;
  updateJob(jobId: string, tenantId: string, patch: Partial<Job>): Promise<Job>;
  claimExecutableJobs?(tenantId: string, limit: number): Promise<Job[]>;
  recoverTimedOutRunningJobs?(tenantId: string, timeoutMs: number): Promise<number>;
  appendJobLog?(jobId: string, tenantId: string, line: string): Promise<void>;
  searchKnowledgeContext?(input: {
    tenantId: string;
    projectId?: string;
    query: string;
    limit?: number;
    threshold?: number;
  }): Promise<
    Array<{
      path: string;
      title: string;
      scope: "system" | "tenant" | "project" | "context-notes";
      excerpt: string;
      score: number;
      sourceType?: "knowledge-node" | "context-note";
      noteId?: string;
    }>
  >;
  getKnowledgeConfig?(input: {
    tenantId: string;
    projectId?: string;
  }): Promise<
    Pick<
      KnowledgeConfig,
      "scope" | "autoCapture" | "captureModes" | "requireApproval" | "maxNodes" | "relevanceThreshold" | "versioning" | "requireReview"
    >
  >;
  storeKnowledgeInsight?(input: {
    tenantId: string;
    projectId?: string;
    jobId: string;
    title: string;
    content: string;
    actor: string;
    scope?: "system" | "tenant" | "project";
  }): Promise<void>;
}

export interface JobRunnerLogger {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface JobExecutionResult {
  nextStatus: JobStatus;
  actionRequired?: boolean;
  actionType?: JobActionType;
  payloadPatch?: Record<string, unknown>;
  usage?: JobUsageRecord;
}

export interface JobUsageRecord {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  metadata?: Record<string, unknown>;
}

export interface RunnerAuditEventInput {
  tenantId: string;
  projectId?: string;
  jobId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: "success" | "failure";
  metadata?: Record<string, unknown>;
  actor: string;
  occurredAt?: string;
}

export interface RunnerUsageEventInput {
  tenantId: string;
  projectId?: string;
  jobId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  metadata?: Record<string, unknown>;
  actor: string;
  occurredAt?: string;
}

export interface JobTelemetrySink {
  recordAuditEvent?(event: RunnerAuditEventInput): Promise<void>;
  recordUsageEvent?(event: RunnerUsageEventInput): Promise<void>;
}

export type JobHandler = (job: Job) => Promise<JobExecutionResult>;

export interface JobExecutorOptions {
  tenantId: string;
  store: JobRunnerStore;
  logger: JobRunnerLogger;
  providerOrder: ProviderName[];
  providerRegistry: ProviderRegistry;
  promptBuilder: PromptBuilderService;
  rateLimiter?: ProviderRateLimiter;
  handlers?: Partial<Record<JobType, JobHandler>>;
  telemetry?: JobTelemetrySink;
}

export interface SchedulerOptions {
  tenantId: string;
  store: JobRunnerStore;
  logger: JobRunnerLogger;
  maxConcurrent: number;
  jobTimeoutMs: number;
}

export interface JobQueuePayload {
  tenantId: string;
  jobId: string;
}

export interface JobExecutionQueue {
  enqueue(payload: JobQueuePayload): Promise<void>;
  startWorker(handler: (payload: JobQueuePayload) => Promise<void>, concurrency: number): Promise<void>;
  close(): Promise<void>;
}

export interface DagRunnerOptions {
  tenantId: string;
  store: JobRunnerStore;
  queue: JobExecutionQueue;
  logger?: JobRunnerLogger;
  autoPolling?: boolean;
  pollIntervalMs?: number;
  maxConcurrent?: number;
  jobTimeoutMs?: number;
  providerOrder?: ProviderName[];
  providerRegistry?: ProviderRegistry;
  promptBuilder?: PromptBuilderService;
  rateLimiter?: ProviderRateLimiter;
  handlers?: Partial<Record<JobType, JobHandler>>;
  telemetry?: JobTelemetrySink;
}

export interface GenerationPayloadInput {
  role?: string;
  subprompts?: Subprompt[];
  plan?: BrainstormPlanPayload;
  context?: Record<string, unknown>;
  inputText?: string;
  maxTokens?: number;
  temperature?: number;
  systemMessage?: string;
  providerOrder?: ProviderName[];
  projectId?: string;
  taskId?: string;
  runId?: string;
}

export type GenerationProvider = CodingProvider | ChatReasoningProvider;
