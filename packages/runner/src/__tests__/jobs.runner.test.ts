import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Job } from "@cp/domain";
import { DagRunner } from "../runner.js";
import type {
  JobExecutionQueue,
  JobQueuePayload,
  JobRunnerStore,
  RunnerAuditEventInput,
  RunnerUsageEventInput
} from "../types.js";

const now = () => new Date().toISOString();

const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: overrides.id ?? randomUUID(),
  tenantId: overrides.tenantId ?? "tenant_a",
  type: overrides.type ?? "processing",
  title: overrides.title ?? "job",
  status: overrides.status ?? "idle",
  priority: overrides.priority ?? 0,
  retryCount: overrides.retryCount ?? 0,
  maxRetries: overrides.maxRetries ?? 2,
  actionRequired: overrides.actionRequired ?? false,
  ...(overrides.actionType ? { actionType: overrides.actionType } : {}),
  ...(overrides.resourceType ? { resourceType: overrides.resourceType } : {}),
  ...(overrides.resourceId ? { resourceId: overrides.resourceId } : {}),
  ...(overrides.payload ? { payload: overrides.payload } : {}),
  dependencies: overrides.dependencies ?? [],
  dependsOnCount: overrides.dependsOnCount ?? (overrides.dependencies?.length ?? 0),
  ready: overrides.ready ?? true,
  ...(overrides.startedAt ? { startedAt: overrides.startedAt } : {}),
  ...(overrides.completedAt ? { completedAt: overrides.completedAt } : {}),
  createdBy: overrides.createdBy ?? "tester",
  createdAt: overrides.createdAt ?? now(),
  updatedAt: overrides.updatedAt ?? now(),
  ...(overrides.projectId ? { projectId: overrides.projectId } : {})
});

class InMemoryStore implements JobRunnerStore {
  constructor(private readonly jobs = new Map<string, Job>()) {}
  knowledgeConfig = {
    scope: "tenant" as const,
    autoCapture: false,
    captureModes: ["generation_output"],
    requireApproval: false,
    maxNodes: 6,
    relevanceThreshold: 0.2,
    versioning: true,
    requireReview: false
  };
  knowledgeContextResult: Array<{
    path: string;
    title: string;
    scope: "system" | "tenant" | "project" | "context-notes";
    excerpt: string;
    score: number;
    sourceType?: "knowledge-node" | "context-note";
    noteId?: string;
  }> = [];
  knowledgeInsights: Array<{ title: string; content: string }> = [];

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

  async searchKnowledgeContext(): Promise<
    Array<{
      path: string;
      title: string;
      scope: "system" | "tenant" | "project" | "context-notes";
      excerpt: string;
      score: number;
      sourceType?: "knowledge-node" | "context-note";
      noteId?: string;
    }>
  > {
    return [...this.knowledgeContextResult];
  }

  async getKnowledgeConfig(): Promise<{
    scope: "system" | "tenant" | "project";
    autoCapture: boolean;
    captureModes: string[];
    requireApproval: boolean;
    maxNodes: number;
    relevanceThreshold: number;
    versioning: boolean;
    requireReview: boolean;
  }> {
    return { ...this.knowledgeConfig };
  }

  async storeKnowledgeInsight(input: { title: string; content: string }): Promise<void> {
    this.knowledgeInsights.push({ title: input.title, content: input.content });
  }

  async claimExecutableJobs(tenantId: string, limit: number): Promise<Job[]> {
    const executable = [...this.jobs.values()]
      .filter((job) => job.tenantId === tenantId && job.status === "idle" && job.ready)
      .sort((a, b) => (a.priority === b.priority ? a.createdAt.localeCompare(b.createdAt) : b.priority - a.priority))
      .slice(0, limit);

    const claimed: Job[] = [];
    for (const job of executable) {
      const next = { ...job, status: "running" as const, ready: false, actionRequired: false, updatedAt: now() };
      this.jobs.set(job.id, next);
      claimed.push({ ...next });
    }
    return claimed;
  }

  seed(job: Job): void {
    this.jobs.set(job.id, { ...job });
  }
}

class ImmediateQueue implements JobExecutionQueue {
  private handler: ((payload: JobQueuePayload) => Promise<void>) | null = null;

  async enqueue(payload: JobQueuePayload): Promise<void> {
    if (!this.handler) throw new Error("Worker not started");
    await this.handler(payload);
  }

  async startWorker(handler: (payload: JobQueuePayload) => Promise<void>, _concurrency: number): Promise<void> {
    this.handler = handler;
  }

  async close(): Promise<void> {
    this.handler = null;
  }
}

class TelemetryRecorder {
  readonly auditEvents: Array<{ action: string; status: string; jobId?: string }> = [];
  readonly usageEvents: Array<{ provider: string; model: string; cost: number }> = [];

  recordAuditEvent = async (event: RunnerAuditEventInput): Promise<void> => {
    this.auditEvents.push(event);
  };

  recordUsageEvent = async (event: RunnerUsageEventInput): Promise<void> => {
    this.usageEvents.push(event);
  };
}

describe("DagRunner", () => {
  it("executes ready jobs automatically", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    const job = makeJob({ id: "j1", ready: true, status: "idle", type: "processing" });
    store.seed(job);
    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 2,
      pollIntervalMs: 10_000,
      autoPolling: false
    });
    await runner.start();
    const claimed = await runner.runOnce();
    await runner.stop();

    const updated = await store.getJob("j1", "tenant_a");
    expect(claimed).toBe(1);
    expect(updated?.status).toBe("done");
    expect(updated?.payload?.output).toBeTruthy();
  });

  it("retries failed jobs and marks terminal errors", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    const job = makeJob({
      id: "j_retry",
      ready: true,
      status: "idle",
      type: "processing",
      maxRetries: 1
    });
    store.seed(job);

    let failures = 0;
    const failingHandler = async () => {
      failures += 1;
      throw new Error("boom");
    };

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 1,
      pollIntervalMs: 10_000,
      autoPolling: false,
      handlers: { processing: failingHandler }
    });

    await runner.start();
    await runner.runOnce();
    const first = await store.getJob("j_retry", "tenant_a");
    expect(first?.status).toBe("idle");
    expect(first?.retryCount).toBe(1);

    await runner.runOnce();
    const second = await store.getJob("j_retry", "tenant_a");
    await runner.stop();
    expect(failures).toBe(2);
    expect(second?.status).toBe("error");
    expect(second?.actionRequired).toBe(true);
  });

  it("does not execute dependent jobs until dependencies are done", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    const root = makeJob({ id: "root", type: "processing", ready: true, status: "idle" });
    const child = makeJob({
      id: "child",
      type: "processing",
      status: "idle",
      ready: false,
      dependencies: ["root"],
      dependsOnCount: 1
    });
    store.seed(root);
    store.seed(child);

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 1,
      pollIntervalMs: 10_000,
      autoPolling: false
    });
    await runner.start();
    await runner.runOnce();
    expect((await store.getJob("root", "tenant_a"))?.status).toBe("done");
    expect((await store.getJob("child", "tenant_a"))?.status).toBe("idle");

    await runner.runOnce();
    await runner.stop();
    expect((await store.getJob("child", "tenant_a"))?.status).toBe("done");
  });

  it("respects concurrency limit when claiming jobs", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    for (let index = 0; index < 3; index += 1) {
      store.seed(
        makeJob({
          id: `j_${index}`,
          type: "processing",
          status: "idle",
          ready: true,
          priority: index
        })
      );
    }

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 2,
      pollIntervalMs: 10_000,
      autoPolling: false
    });
    await runner.start();
    const claimed = await runner.runOnce();
    await runner.stop();

    expect(claimed).toBe(2);
    const doneCount = (await store.listJobs("tenant_a")).filter((job) => job.status === "done").length;
    expect(doneCount).toBe(2);
  });

  it("injects compact knowledge context into generation jobs", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    store.knowledgeConfig.autoCapture = true;
    store.knowledgeContextResult = [
      {
        path: "/projects/proj_001/context/decision.md",
        title: "Decision",
        scope: "context-notes",
        excerpt: "Use compact knowledge injection for workflow prompts.",
        score: 0.98,
        sourceType: "context-note",
        noteId: "ctx_001"
      }
    ];
    store.seed(
      makeJob({
        id: "j_ctx",
        type: "generation",
        ready: true,
        status: "idle",
        payload: {
          inputText: "Generate a concise release note"
        }
      })
    );

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 1,
      pollIntervalMs: 10_000,
      autoPolling: false,
      handlers: {
        generation: async () => ({
          nextStatus: "done",
          payloadPatch: {
            output: {
              text:
                "## Decision\nUse compact knowledge injection for workflow prompts and preserve context notes.\n\n" +
                "## Pattern\nKeep prompts short, structured, and scoped to relevant project context.\n\n" +
                "- capture only meaningful decisions\n- avoid noisy dumps\n- include linked notes when relevant"
            }
          }
        })
      }
    });

    await runner.start();
    await runner.runOnce();
    await runner.stop();

    const updated = await store.getJob("j_ctx", "tenant_a");
    const payload = (updated?.payload ?? {}) as {
      context?: { knowledge?: Array<{ scope?: string }> };
    };
    expect(Array.isArray(payload.context?.knowledge)).toBe(true);
    expect(payload.context?.knowledge?.[0]?.scope).toBe("context-notes");
    expect(store.knowledgeInsights.length).toBeGreaterThan(0);
  });

  it("skips noisy auto-capture when generation output is not meaningful", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    store.knowledgeConfig.autoCapture = true;
    store.seed(
      makeJob({
        id: "j_noise",
        type: "generation",
        ready: true,
        status: "idle",
        payload: {
          inputText: "Short output"
        }
      })
    );

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 1,
      pollIntervalMs: 10_000,
      autoPolling: false,
      handlers: {
        generation: async () => ({
          nextStatus: "done",
          payloadPatch: {
            output: {
              text: "Short note"
            }
          }
        })
      }
    });

    await runner.start();
    await runner.runOnce();
    await runner.stop();

    expect(store.knowledgeInsights).toHaveLength(0);
  });

  it("isolates execution by tenant", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    store.seed(makeJob({ id: "tenant_a_job", tenantId: "tenant_a", ready: true, status: "idle" }));
    store.seed(makeJob({ id: "tenant_b_job", tenantId: "tenant_b", ready: true, status: "idle" }));

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 2,
      pollIntervalMs: 10_000,
      autoPolling: false
    });
    await runner.start();
    await runner.runOnce();
    await runner.stop();

    expect((await store.getJob("tenant_a_job", "tenant_a"))?.status).toBe("done");
    expect((await store.getJob("tenant_b_job", "tenant_b"))?.status).toBe("idle");
  });

  it("emits audit and usage telemetry for generation jobs", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    const telemetry = new TelemetryRecorder();
    const job = makeJob({
      id: "gen_telemetry",
      type: "generation",
      ready: true,
      status: "idle",
      projectId: "project_telemetry",
      payload: { inputText: "generate copy" }
    });
    store.seed(job);

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 1,
      pollIntervalMs: 10_000,
      autoPolling: false,
      telemetry,
      handlers: {
        generation: async () => ({
          nextStatus: "done",
          payloadPatch: {
            output: { text: "generated" }
          },
          usage: {
            provider: "openai",
            model: "gpt-5",
            inputTokens: 128,
            outputTokens: 64,
            cost: 0.006
          }
        })
      }
    });

    await runner.start();
    await runner.runOnce();
    await runner.stop();

    expect(telemetry.auditEvents.some((event) => event.action === "job.start")).toBe(true);
    expect(telemetry.auditEvents.some((event) => event.action === "job.end")).toBe(true);
    expect(telemetry.usageEvents).toHaveLength(1);
    expect(telemetry.usageEvents[0]?.provider).toBe("openai");
  });

  it("fails generation jobs without a registry-backed prompt", async () => {
    const store = new InMemoryStore();
    const queue = new ImmediateQueue();
    const job = makeJob({
      id: "gen_missing_prompt",
      type: "generation",
      ready: true,
      status: "idle",
      maxRetries: 0,
      payload: {
        role: "planner"
      }
    });
    store.seed(job);

    const runner = new DagRunner({
      tenantId: "tenant_a",
      store,
      queue,
      maxConcurrent: 1,
      pollIntervalMs: 10_000,
      autoPolling: false
    });

    await runner.start();
    await runner.runOnce();
    await runner.stop();

    const updated = await store.getJob("gen_missing_prompt", "tenant_a");
    const lastError = (updated?.payload as { lastError?: { message?: string } } | undefined)?.lastError;
    expect(updated?.status).toBe("error");
    expect(lastError?.message).toContain("Prompt registry resolver is required for role");
  });
});
