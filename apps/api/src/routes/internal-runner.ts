import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Job } from "@cp/domain";
import { runWithTenantContext } from "@cp/db";
import { apiStore } from "../services/api-store.js";
import { auditLogService } from "../services/audit-log-service.js";
import { executeInternalRunnerAction } from "../services/internal-runner-action-service.js";
import { resolveEffectiveKnowledgeConfig } from "../services/knowledge-config-service.js";
import { buildCompactKnowledgeContext, createKnowledgeNode } from "../services/knowledge-service.js";
import { promptRegistryService } from "../services/prompt-registry-service.js";
import { usageService } from "../services/usage-service.js";

interface RunnerExecuteBody {
  action: string;
  payload?: Record<string, unknown>;
}

const nowIso = (): string => new Date().toISOString();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const resolveDispatchTarget = (job: Job): "remote_worker" | "local_worker" | "hybrid" => {
  const payload = asRecord(job.payload) ?? {};
  const execution = asRecord(payload.execution);
  const raw = asString(execution?.dispatchTarget)?.toLowerCase();
  if (raw === "local_worker" || raw === "hybrid" || raw === "remote_worker") {
    return raw;
  }
  return "remote_worker";
};

const isRemoteDispatchTarget = (target: "remote_worker" | "local_worker" | "hybrid"): boolean =>
  target === "remote_worker" || target === "hybrid";

const allowRunnerExecution = (request: FastifyRequest, reply: FastifyReply): boolean => {
  const expected = process.env.RUNNER_INTERNAL_TOKEN?.trim();
  if (!expected) return true;
  const providedHeader = request.headers["x-runner-token"];
  const provided = Array.isArray(providedHeader) ? providedHeader[0] : providedHeader;
  if (provided === expected) return true;
  reply.code(403).send({
    error: "forbidden",
    message: "Invalid runner token"
  });
  return false;
};

const requireTenantId = (
  body: Record<string, unknown>,
  reply: FastifyReply
): string | null => {
  const tenantId = asString(body.tenantId);
  if (!tenantId) {
    reply.code(400).send({
      error: "invalid_request",
      message: "tenantId is required"
    });
    return null;
  }
  return tenantId;
};

const appendRuntimeJobLog = async (tenantId: string, jobId: string, line: string): Promise<void> => {
  await runWithTenantContext({ tenantId }, async () => {
    const item = await apiStore.getJob(jobId);
    if (!item) return;

    const payload: Record<string, unknown> = { ...(item.payload ?? {}) };
    const rawRuntimeLogs = payload._runtimeLogs;
    const currentLogs = Array.isArray(rawRuntimeLogs)
      ? rawRuntimeLogs.filter((entry): entry is string => typeof entry === "string")
      : [];
    const stamped = `[${nowIso()}] ${line}`;
    payload._runtimeLogs = [...currentLogs, stamped].slice(-300);

    await apiStore.updateJob(jobId, {
      payload,
      updatedAt: nowIso()
    });
  });
};

export const internalRunnerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RunnerExecuteBody }>(
    "/internal/runner/execute",
    {
      schema: { tags: ["internal"], summary: "Runner-only execution endpoint" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;

      const action = request.body?.action?.trim();
      const payload = asRecord(request.body?.payload) ?? {};
      if (!action) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "action is required"
        });
      }

      try {
        const item = await executeInternalRunnerAction({
          action,
          payload
        });
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "runner_execution_failed",
          message: error instanceof Error ? error.message : "Internal runner execution failed"
        });
      }
    }
  );

  fastify.post(
    "/internal/runner/store/tenants/list",
    {
      schema: { tags: ["internal"], summary: "Runner store: list tenants" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const items = await apiStore.listTenants();
      return { items };
    }
  );

  fastify.post(
    "/internal/runner/store/providers/rate-limits",
    {
      schema: { tags: ["internal"], summary: "Runner store: resolve provider rate limits" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const provider = asString(body.provider)?.toLowerCase();
      if (!provider) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "provider is required"
        });
      }

      const row = await runWithTenantContext({ tenantId }, async () => {
        const configs = await apiStore.listProviderConfigs();
        return configs
          .filter((config) => {
            if (!config.enabled) return false;
            if (config.tenantId && config.tenantId !== tenantId) return false;
            const providerId = (config.providerId ?? config.provider).toLowerCase();
            return providerId === provider;
          })
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      });

      return {
        ...(typeof row?.requestsPerMinute === "number" && row.requestsPerMinute > 0
          ? { rpm: row.requestsPerMinute }
          : {}),
        ...(typeof row?.tokensPerMinute === "number" && row.tokensPerMinute > 0
          ? { tpm: row.tokensPerMinute }
          : {})
      };
    }
  );

  fastify.post(
    "/internal/runner/store/jobs/list",
    {
      schema: { tags: ["internal"], summary: "Runner store: list jobs by tenant" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const items = await runWithTenantContext({ tenantId }, async () => apiStore.listJobs());
      return { items };
    }
  );

  fastify.post(
    "/internal/runner/store/jobs/get",
    {
      schema: { tags: ["internal"], summary: "Runner store: get job by id" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const jobId = asString(body.jobId);
      if (!jobId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "jobId is required"
        });
      }
      const item = await runWithTenantContext({ tenantId }, async () => apiStore.getJob(jobId));
      return { item };
    }
  );

  fastify.post(
    "/internal/runner/store/jobs/update",
    {
      schema: { tags: ["internal"], summary: "Runner store: update job" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const jobId = asString(body.jobId);
      const patch = asRecord(body.patch);
      if (!jobId || !patch) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "jobId and patch are required"
        });
      }

      const item = await runWithTenantContext({ tenantId }, async () =>
        apiStore.updateJob(jobId, patch as Partial<Job>)
      );
      return { item };
    }
  );

  fastify.post(
    "/internal/runner/store/jobs/claim",
    {
      schema: { tags: ["internal"], summary: "Runner store: claim remote executable jobs" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const limit = Math.max(1, Math.min(50, Math.trunc(asNumber(body.limit) ?? 5)));

      const items = await runWithTenantContext({ tenantId }, async () => {
        const candidates = (await apiStore.listJobs({ status: "idle", ready: true }))
          .filter((job) => isRemoteDispatchTarget(resolveDispatchTarget(job)))
          .sort((left, right) => {
            if (left.priority !== right.priority) return right.priority - left.priority;
            return left.createdAt.localeCompare(right.createdAt);
          });

        const claimed: Job[] = [];
        for (const candidate of candidates) {
          if (claimed.length >= limit) break;
          const latest = await apiStore.getJob(candidate.id);
          if (!latest || latest.status !== "idle" || !latest.ready) continue;
          const updated = await apiStore.updateJob(latest.id, {
            status: "running",
            ready: false,
            actionRequired: false,
            startedAt: latest.startedAt ?? nowIso(),
            updatedAt: nowIso()
          });
          claimed.push(updated);
        }

        return claimed;
      });

      return { items };
    }
  );

  fastify.post(
    "/internal/runner/store/jobs/recover-timeouts",
    {
      schema: { tags: ["internal"], summary: "Runner store: recover timed out remote jobs" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const timeoutMs = Math.max(1_000, Math.trunc(asNumber(body.timeoutMs) ?? 600_000));

      const recovered = await runWithTenantContext({ tenantId }, async () => {
        const running = await apiStore.listJobs({ status: "running" });
        const now = Date.now();
        let counter = 0;

        for (const job of running) {
          if (!isRemoteDispatchTarget(resolveDispatchTarget(job))) continue;
          if (!job.startedAt) continue;
          const startedAtMs = Date.parse(job.startedAt);
          if (!Number.isFinite(startedAtMs)) continue;
          if (now - startedAtMs <= timeoutMs) continue;
          await apiStore.updateJob(job.id, {
            status: "idle",
            ready: false,
            actionRequired: false,
            updatedAt: nowIso()
          });
          counter += 1;
        }

        return counter;
      });

      return { recovered };
    }
  );

  fastify.post(
    "/internal/runner/store/jobs/log",
    {
      schema: { tags: ["internal"], summary: "Runner store: append runtime job log line" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const jobId = asString(body.jobId);
      const line = asString(body.line);
      if (!jobId || !line) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "jobId and line are required"
        });
      }
      await appendRuntimeJobLog(tenantId, jobId, line);
      return { ok: true };
    }
  );

  fastify.post(
    "/internal/runner/store/knowledge/search",
    {
      schema: { tags: ["internal"], summary: "Runner store: search compact knowledge context" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const query = asString(body.query);
      if (!query) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "query is required"
        });
      }
      const projectId = asString(body.projectId);
      const limit = asNumber(body.limit);
      const threshold = asNumber(body.threshold);

      const items = await buildCompactKnowledgeContext({
        tenantId,
        ...(projectId ? { projectId } : {}),
        query,
        ...(typeof limit === "number" ? { limit } : {}),
        ...(typeof threshold === "number" ? { threshold } : {}),
        includeContextNotes: true
      });

      return { items };
    }
  );

  fastify.post(
    "/internal/runner/store/knowledge/config",
    {
      schema: { tags: ["internal"], summary: "Runner store: resolve effective knowledge config" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const projectId = asString(body.projectId);
      const resolved = await resolveEffectiveKnowledgeConfig({
        tenantId,
        ...(projectId ? { projectId } : {})
      });
      return {
        item: {
          scope: resolved.item.scope,
          autoCapture: resolved.item.autoCapture,
          captureModes: resolved.item.captureModes,
          requireApproval: resolved.item.requireApproval,
          maxNodes: resolved.item.maxNodes,
          relevanceThreshold: resolved.item.relevanceThreshold,
          versioning: resolved.item.versioning,
          requireReview: resolved.item.requireReview
        }
      };
    }
  );

  fastify.post(
    "/internal/runner/store/knowledge/insight",
    {
      schema: { tags: ["internal"], summary: "Runner store: persist knowledge insight" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const projectId = asString(body.projectId);
      const jobId = asString(body.jobId);
      const title = asString(body.title);
      const content = asString(body.content);
      const actor = asString(body.actor);
      const scopeRaw = asString(body.scope);
      const scope =
        scopeRaw === "system" || scopeRaw === "tenant" || scopeRaw === "project"
          ? scopeRaw
          : undefined;

      if (!jobId || !title || !content || !actor) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "jobId, title, content, and actor are required"
        });
      }

      const resolvedScope =
        scope === "project" && !projectId
          ? "tenant"
          : scope ?? (projectId ? "project" : "tenant");
      const suffix = `${Date.now()}-${jobId}`;
      const nodePath =
        resolvedScope === "system"
          ? `/system/jobs/${suffix}.md`
          : resolvedScope === "project"
            ? `/projects/${projectId}/jobs/${suffix}.md`
            : `/tenants/${tenantId}/jobs/${suffix}.md`;

      await createKnowledgeNode(
        {
          scope: resolvedScope,
          path: nodePath,
          content,
          ...(resolvedScope === "project" && projectId ? { projectId } : {})
        },
        actor,
        tenantId
      );

      await appendRuntimeJobLog(tenantId, jobId, `knowledge insight persisted at ${nodePath}`);

      return {
        ok: true,
        nodePath
      };
    }
  );

  fastify.post(
    "/internal/runner/store/prompts/resolve",
    {
      schema: { tags: ["internal"], summary: "Runner store: resolve active prompt content" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const tenantId = requireTenantId(body, reply);
      if (!tenantId) return;
      const type = asString(body.type);
      const target = asString(body.target);
      if (!type || !target) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "type and target are required"
        });
      }
      const projectId = asString(body.projectId);
      const resolvedRegistryEntry = await promptRegistryService.resolveActivePrompt({
        tenantId,
        ...(projectId ? { projectId } : {}),
        type,
        target
      });
      return {
        content: resolvedRegistryEntry?.content.trim() ?? null
      };
    }
  );

  fastify.post(
    "/internal/runner/store/telemetry/audit",
    {
      schema: { tags: ["internal"], summary: "Runner store: record audit telemetry" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const event = asRecord(body.event);
      if (!event) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "event is required"
        });
      }
      const tenantId = asString(event.tenantId);
      const action = asString(event.action);
      const resourceType = asString(event.resourceType);
      const status = asString(event.status);
      const actor = asString(event.actor);
      if (!tenantId || !action || !resourceType || !status || !actor) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "event.tenantId/action/resourceType/status/actor are required"
        });
      }
      const projectId = asString(event.projectId);
      const jobId = asString(event.jobId);
      const resourceId = asString(event.resourceId);
      const metadata = asRecord(event.metadata) as Record<string, unknown> | null;
      const occurredAt = asString(event.occurredAt);

      await auditLogService.record({
        tenantId,
        ...(projectId ? { projectId } : {}),
        ...(jobId ? { jobId } : {}),
        ...(resourceId ? { resourceId } : {}),
        action,
        resourceType,
        status: status === "failure" ? "failure" : "success",
        ...(metadata ? { metadata } : {}),
        actor,
        ...(occurredAt ? { occurredAt } : {})
      });

      return { ok: true };
    }
  );

  fastify.post(
    "/internal/runner/store/telemetry/usage",
    {
      schema: { tags: ["internal"], summary: "Runner store: record usage telemetry" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;
      const body = asRecord(request.body) ?? {};
      const event = asRecord(body.event);
      if (!event) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "event is required"
        });
      }
      const tenantId = asString(event.tenantId);
      const provider = asString(event.provider);
      const model = asString(event.model);
      const actor = asString(event.actor);
      const inputTokens = asNumber(event.inputTokens);
      const outputTokens = asNumber(event.outputTokens);
      const cost = asNumber(event.cost);
      if (
        !tenantId || !provider || !model || !actor ||
        typeof inputTokens !== "number" || typeof outputTokens !== "number" || typeof cost !== "number"
      ) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "event.tenantId/provider/model/inputTokens/outputTokens/cost/actor are required"
        });
      }
      const projectId = asString(event.projectId);
      const jobId = asString(event.jobId);
      const metadata = asRecord(event.metadata) as Record<string, unknown> | null;
      const occurredAt = asString(event.occurredAt);

      await usageService.record({
        tenantId,
        ...(projectId ? { projectId } : {}),
        ...(jobId ? { jobId } : {}),
        provider,
        model,
        inputTokens,
        outputTokens,
        cost,
        ...(metadata ? { metadata } : {}),
        actor,
        ...(occurredAt ? { occurredAt } : {})
      });

      return { ok: true };
    }
  );
};
