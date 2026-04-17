import type { Job, KnowledgeConfig, ProviderName, Tenant } from "@cp/domain";
import type { RunnerAuditEventInput, RunnerUsageEventInput } from "@cp/runner";
import type { JobRunnerStore } from "@cp/runner";

interface DagWorkerJobStoreOptions {
  baseUrl: string;
  runnerToken?: string;
  authorizationToken?: string;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/$/, "");

const defaultKnowledgeConfig: Pick<
  KnowledgeConfig,
  "scope" | "autoCapture" | "captureModes" | "requireApproval" | "maxNodes" | "relevanceThreshold" | "versioning" | "requireReview"
> = {
  scope: "tenant",
  autoCapture: false,
  captureModes: ["generation_output"],
  requireApproval: false,
  maxNodes: 8,
  relevanceThreshold: 0.2,
  versioning: true,
  requireReview: false
};

export class DagWorkerJobStore implements JobRunnerStore {
  private readonly baseUrl: string;
  private readonly runnerToken: string | undefined;
  private readonly authorizationToken: string | undefined;

  constructor(options: DagWorkerJobStoreOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.runnerToken = options.runnerToken?.trim() || undefined;
    this.authorizationToken = options.authorizationToken?.trim() || undefined;
  }

  async close(): Promise<void> {
    // no-op: HTTP-backed store has no persistent client resources
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.runnerToken) {
      headers["x-runner-token"] = this.runnerToken;
    }
    if (this.authorizationToken) {
      headers.authorization = `Bearer ${this.authorizationToken}`;
    }
    return headers;
  }

  private async postJson<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const raw = (await response.text()).trim();
      let message = raw;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { message?: string };
          if (parsed?.message && typeof parsed.message === "string") {
            message = parsed.message;
          }
        } catch {
          // Keep raw body preview.
        }
      }
      throw new Error(message || `Worker store request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }

  async listTenants(): Promise<Tenant[]> {
    const response = await this.postJson<{ items?: Tenant[] }>("/internal/runner/store/tenants/list", {});
    return Array.isArray(response.items) ? response.items : [];
  }

  async getProviderRateLimits(
    tenantId: string,
    provider: ProviderName
  ): Promise<{ rpm?: number; tpm?: number }> {
    const response = await this.postJson<{ rpm?: number; tpm?: number }>(
      "/internal/runner/store/providers/rate-limits",
      { tenantId, provider }
    );
    return {
      ...(typeof response.rpm === "number" ? { rpm: response.rpm } : {}),
      ...(typeof response.tpm === "number" ? { tpm: response.tpm } : {})
    };
  }

  async listJobs(tenantId: string): Promise<Job[]> {
    const response = await this.postJson<{ items?: Job[] }>("/internal/runner/store/jobs/list", { tenantId });
    return Array.isArray(response.items) ? response.items : [];
  }

  async getJob(jobId: string, tenantId: string): Promise<Job | null> {
    const response = await this.postJson<{ item?: Job | null }>("/internal/runner/store/jobs/get", {
      tenantId,
      jobId
    });
    return (response.item as Job | null | undefined) ?? null;
  }

  async updateJob(jobId: string, tenantId: string, patch: Partial<Job>): Promise<Job> {
    const response = await this.postJson<{ item?: Job }>("/internal/runner/store/jobs/update", {
      tenantId,
      jobId,
      patch
    });
    if (!response.item) {
      throw new Error(`Runner store update response missing item for job ${jobId}`);
    }
    return response.item;
  }

  async claimExecutableJobs(tenantId: string, limit: number): Promise<Job[]> {
    const response = await this.postJson<{ items?: Job[] }>("/internal/runner/store/jobs/claim", {
      tenantId,
      limit
    });
    return Array.isArray(response.items) ? response.items : [];
  }

  async recoverTimedOutRunningJobs(tenantId: string, timeoutMs: number): Promise<number> {
    const response = await this.postJson<{ recovered?: number }>(
      "/internal/runner/store/jobs/recover-timeouts",
      {
        tenantId,
        timeoutMs
      }
    );
    return typeof response.recovered === "number" ? response.recovered : 0;
  }

  async appendJobLog(jobId: string, tenantId: string, line: string): Promise<void> {
    await this.postJson<{ ok?: boolean }>("/internal/runner/store/jobs/log", {
      tenantId,
      jobId,
      line
    });
  }

  async searchKnowledgeContext(input: {
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
  > {
    const response = await this.postJson<{
      items?: Array<{
        path: string;
        title: string;
        scope: "system" | "tenant" | "project" | "context-notes";
        excerpt: string;
        score: number;
        sourceType?: "knowledge-node" | "context-note";
        noteId?: string;
      }>;
    }>("/internal/runner/store/knowledge/search", {
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      query: input.query,
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      ...(typeof input.threshold === "number" ? { threshold: input.threshold } : {})
    });
    return Array.isArray(response.items) ? response.items : [];
  }

  async getKnowledgeConfig(input: {
    tenantId: string;
    projectId?: string;
  }): Promise<
    Pick<
      KnowledgeConfig,
      "scope" | "autoCapture" | "captureModes" | "requireApproval" | "maxNodes" | "relevanceThreshold" | "versioning" | "requireReview"
    >
  > {
    const response = await this.postJson<{
      item?: Pick<
        KnowledgeConfig,
        "scope" | "autoCapture" | "captureModes" | "requireApproval" | "maxNodes" | "relevanceThreshold" | "versioning" | "requireReview"
      >;
    }>("/internal/runner/store/knowledge/config", {
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {})
    });

    return response.item ?? defaultKnowledgeConfig;
  }

  async storeKnowledgeInsight(input: {
    tenantId: string;
    projectId?: string;
    jobId: string;
    title: string;
    content: string;
    actor: string;
    scope?: "system" | "tenant" | "project";
  }): Promise<void> {
    await this.postJson<{ ok?: boolean }>("/internal/runner/store/knowledge/insight", {
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      jobId: input.jobId,
      title: input.title,
      content: input.content,
      actor: input.actor,
      ...(input.scope ? { scope: input.scope } : {})
    });
  }

  async resolveActivePrompt(input: {
    tenantId: string;
    projectId?: string;
    type: string;
    target: string;
  }): Promise<string | null> {
    const response = await this.postJson<{ content?: string | null }>(
      "/internal/runner/store/prompts/resolve",
      {
        tenantId: input.tenantId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        type: input.type,
        target: input.target
      }
    );
    return asString(response.content) ?? null;
  }

  async recordAuditEvent(event: RunnerAuditEventInput): Promise<void> {
    await this.postJson<{ ok?: boolean }>("/internal/runner/store/telemetry/audit", { event });
  }

  async recordUsageEvent(event: RunnerUsageEventInput): Promise<void> {
    await this.postJson<{ ok?: boolean }>("/internal/runner/store/telemetry/usage", { event });
  }
}
