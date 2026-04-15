import type { Pool } from "pg";
import { PostgresDatabase, createPostgresClient, runWithTenantContext } from "@cp/db";
import type { ContextNote, Job, KnowledgeConfig, ProviderName, Tenant } from "@cp/domain";
import { KnowledgeService } from "@cp/knowledge";
import type { JobRunnerStore } from "@cp/runner";

const rowToJob = (row: Record<string, unknown>): Job => {
  const item: Job = {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    type: row.type as Job["type"],
    title: String(row.title),
    status: row.status as Job["status"],
    priority: Number(row.priority ?? 0),
    retryCount: Number(row.retry_count ?? 0),
    maxRetries: Number(row.max_retries ?? 3),
    actionRequired: Boolean(row.action_required),
    dependencies: Array.isArray(row.dependencies) ? (row.dependencies as string[]) : [],
    dependsOnCount: Number(row.depends_on_count ?? 0),
    ready: Boolean(row.ready),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };

  if (row.project_id) item.projectId = String(row.project_id);
  if (row.action_type) item.actionType = row.action_type as NonNullable<Job["actionType"]>;
  if (row.resource_type) item.resourceType = String(row.resource_type);
  if (row.resource_id) item.resourceId = String(row.resource_id);
  if (row.payload && typeof row.payload === "object") item.payload = row.payload as Record<string, unknown>;
  if (row.started_at) item.startedAt = String(row.started_at);
  if (row.completed_at) item.completedAt = String(row.completed_at);

  return item;
};

export class DagWorkerJobStore implements JobRunnerStore {
  private readonly db: PostgresDatabase;
  private readonly pool: Pool;
  private readonly knowledgeService: KnowledgeService;

  constructor() {
    const client = createPostgresClient();
    this.pool = client.pool;
    this.db = new PostgresDatabase(client);
    this.knowledgeService = new KnowledgeService({
      store: {
        listKnowledgeNodes: async (filters) => {
          if (!filters || Object.keys(filters).length === 0) {
            return this.db.repository("knowledge_nodes").list();
          }
          return this.db.repository("knowledge_nodes").list(filters);
        },
        getKnowledgeNodeById: async (knowledgeNodeId) =>
          this.db.repository("knowledge_nodes").getById(knowledgeNodeId),
        findKnowledgeNodeByScopePath: async (scope, nodePath) => {
          const rows = await this.db.repository("knowledge_nodes").list({ scope, path: nodePath });
          return rows[0] ?? null;
        },
        createKnowledgeNode: async (node) => this.db.repository("knowledge_nodes").create(node),
        updateKnowledgeNode: async (knowledgeNodeId, patch) =>
          this.db.repository("knowledge_nodes").update(knowledgeNodeId, patch),
        deleteKnowledgeNode: async (knowledgeNodeId) =>
          this.db.repository("knowledge_nodes").delete(knowledgeNodeId)
      }
    });
  }

  private defaultKnowledgeConfig(
    projectId?: string
  ): Pick<
    KnowledgeConfig,
    "scope" | "autoCapture" | "captureModes" | "requireApproval" | "maxNodes" | "relevanceThreshold" | "versioning" | "requireReview"
  > {
    return {
      scope: projectId ? "project" : "tenant",
      autoCapture: false,
      captureModes: ["generation_output"],
      requireApproval: false,
      maxNodes: 8,
      relevanceThreshold: 0.2,
      versioning: true,
      requireReview: false
    };
  }

  async close(): Promise<void> {
    await this.db.close?.();
  }

  async listTenants(): Promise<Tenant[]> {
    return this.db.repository("tenants").list();
  }

  async getProviderRateLimits(
    tenantId: string,
    provider: ProviderName
  ): Promise<{ rpm?: number; tpm?: number }> {
    const result = await this.pool.query<{
      requests_per_minute: number | null;
      tokens_per_minute: number | null;
    }>(
      `
      SELECT
        requests_per_minute,
        tokens_per_minute
      FROM provider_configs
      WHERE tenant_id = $1
        AND provider_id = $2
        AND enabled = true
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [tenantId, provider]
    );

    const row = result.rows[0];
    if (!row) return {};
    return {
      ...(typeof row.requests_per_minute === "number" && row.requests_per_minute > 0
        ? { rpm: row.requests_per_minute }
        : {}),
      ...(typeof row.tokens_per_minute === "number" && row.tokens_per_minute > 0
        ? { tpm: row.tokens_per_minute }
        : {})
    };
  }

  async listJobs(tenantId: string): Promise<Job[]> {
    return runWithTenantContext({ tenantId }, async () => this.db.repository("jobs").list());
  }

  async getJob(jobId: string, tenantId: string): Promise<Job | null> {
    return runWithTenantContext({ tenantId }, async () => this.db.repository("jobs").getById(jobId));
  }

  async updateJob(jobId: string, tenantId: string, patch: Partial<Job>): Promise<Job> {
    return runWithTenantContext({ tenantId }, async () => this.db.repository("jobs").update(jobId, patch));
  }

  async claimExecutableJobs(tenantId: string, limit: number): Promise<Job[]> {
    if (limit <= 0) return [];

    const result = await this.pool.query<Record<string, unknown>>(
      `
      WITH candidates AS (
        SELECT id
        FROM jobs
        WHERE tenant_id = $1
          AND status = 'idle'
          AND ready = true
        ORDER BY priority DESC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE jobs AS j
      SET
        status = 'running',
        ready = false,
        action_required = false,
        started_at = COALESCE(j.started_at, NOW()),
        updated_at = NOW()
      FROM candidates AS c
      WHERE j.id = c.id
      RETURNING
        j.id,
        j.tenant_id,
        j.project_id,
        j.type,
        j.title,
        j.status,
        j.priority,
        j.retry_count,
        j.max_retries,
        j.action_required,
        j.action_type,
        j.resource_type,
        j.resource_id,
        j.payload,
        j.dependencies,
        j.depends_on_count,
        j.ready,
        j.started_at,
        j.completed_at,
        j.created_by,
        j.created_at,
        j.updated_at;
    `,
      [tenantId, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => rowToJob(row));
  }

  async recoverTimedOutRunningJobs(tenantId: string, timeoutMs: number): Promise<number> {
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const result = await this.pool.query<{ count: string }>(
      `
      UPDATE jobs
      SET
        status = 'idle',
        ready = false,
        action_required = false,
        updated_at = NOW()
      WHERE tenant_id = $1
        AND status = 'running'
        AND started_at IS NOT NULL
        AND started_at < NOW() - ($2::text || ' seconds')::interval
      RETURNING id;
    `,
      [tenantId, timeoutSeconds]
    );

    return result.rowCount ?? 0;
  }

  async appendJobLog(jobId: string, tenantId: string, line: string): Promise<void> {
    const job = await this.getJob(jobId, tenantId);
    if (!job) return;

    const payload: Record<string, unknown> = { ...(job.payload ?? {}) };
    const rawRuntimeLogs = payload["_runtimeLogs"];
    const currentLogs = Array.isArray(rawRuntimeLogs)
      ? rawRuntimeLogs
          .filter((item): item is string => typeof item === "string")
      : [];
    const stamped = `[${new Date().toISOString()}] ${line}`;
    const nextLogs = [...currentLogs, stamped].slice(-300);
    payload["_runtimeLogs"] = nextLogs;

    await this.updateJob(jobId, tenantId, {
      payload
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
    const config = await this.getKnowledgeConfig({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {})
    });
    const effectiveLimit = typeof input.limit === "number" ? input.limit : config.maxNodes;
    const effectiveThreshold =
      typeof input.threshold === "number" ? input.threshold : config.relevanceThreshold;
    const contextNotes = input.projectId
      ? await this.db.repository("context_notes").list({
          tenantId: input.tenantId,
          projectId: input.projectId
        })
      : [];
    return this.knowledgeService.buildGenerationKnowledgeContext({
      tenantId: input.tenantId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      query: input.query,
      limit: effectiveLimit,
      threshold: effectiveThreshold,
      contextNotes: contextNotes.map((note) => this.toCompactContextNote(note))
    });
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
    const result = await this.pool.query<{
      scope: string;
      auto_capture: boolean;
      capture_modes: unknown;
      require_approval: boolean;
      max_nodes: number;
      relevance_threshold: number;
      versioning: boolean;
      require_review: boolean;
    }>(
      `
      SELECT
        scope,
        auto_capture,
        capture_modes,
        require_approval,
        max_nodes,
        relevance_threshold,
        versioning,
        require_review
      FROM knowledge_configs
      WHERE tenant_id = $1
        AND (
          ($2::text IS NOT NULL AND scope = 'project' AND project_id = $2)
          OR (scope = 'tenant' AND project_id IS NULL)
          OR (scope = 'system' AND project_id IS NULL)
        )
      ORDER BY
        CASE
          WHEN scope = 'project' THEN 1
          WHEN scope = 'tenant' THEN 2
          WHEN scope = 'system' THEN 3
          ELSE 99
        END
      LIMIT 1
      `,
      [input.tenantId, input.projectId ?? null]
    );

    const row = result.rows[0];
    if (!row) {
      return this.defaultKnowledgeConfig(input.projectId);
    }

    const scope =
      row.scope === "system" || row.scope === "tenant" || row.scope === "project"
        ? row.scope
        : (input.projectId ? "project" : "tenant");
    const captureModes = Array.isArray(row.capture_modes)
      ? row.capture_modes.filter((entry): entry is string => typeof entry === "string")
      : ["generation_output"];

    return {
      scope,
      autoCapture: Boolean(row.auto_capture),
      captureModes,
      requireApproval: Boolean(row.require_approval),
      maxNodes: Number.isFinite(row.max_nodes) && row.max_nodes > 0 ? row.max_nodes : 8,
      relevanceThreshold:
        Number.isFinite(row.relevance_threshold) && row.relevance_threshold >= 0 && row.relevance_threshold <= 1
          ? row.relevance_threshold
          : 0.2,
      versioning: Boolean(row.versioning),
      requireReview: Boolean(row.require_review)
    };
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
    const timestamp = new Date().toISOString();
    const suffix = `${Date.now()}-${input.jobId}`;
    const scope =
      input.scope === "project" && !input.projectId
        ? "tenant"
        : input.scope ?? (input.projectId ? "project" : "tenant");
    const nodePath =
      scope === "system"
        ? `/system/jobs/${suffix}.md`
        : scope === "project"
          ? `/projects/${input.projectId}/jobs/${suffix}.md`
          : `/tenants/${input.tenantId}/jobs/${suffix}.md`;

    await this.knowledgeService.createKnowledgeNode(
      {
        scope,
        path: nodePath,
        content: input.content,
        ...(scope === "project" && input.projectId ? { projectId: input.projectId } : {}),
        ...(scope === "tenant" || scope === "project" ? { tenantId: input.tenantId } : {})
      },
      input.actor
    );

    await this.appendJobLog(
      input.jobId,
      input.tenantId,
      `knowledge insight persisted at ${nodePath} (${timestamp})`
    );
  }

  private toCompactContextNote(note: ContextNote): { id: string; path: string; title: string; content: string } {
    return {
      id: note.id,
      path: note.path,
      title: note.title,
      content: note.content
    };
  }
}
