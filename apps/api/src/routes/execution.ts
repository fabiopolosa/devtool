import type { FastifyPluginAsync } from "fastify";
import { requireTenantPermission } from "../tenant/rbac.js";
import {
  claimExecutionJobs,
  completeExecutionJob,
  executionModes,
  failExecutionJob,
  heartbeatExecutionWorker,
  registerExecutionWorker,
  type ExecutionMode
} from "../services/execution-router-service.js";
import { dispatchAndAwaitRunnerJob, getRunnerJobOutput } from "../services/job-dispatch-service.js";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
};

const toExecutionMode = (value: unknown): ExecutionMode | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return executionModes.includes(normalized as ExecutionMode) ? (normalized as ExecutionMode) : undefined;
};

export const executionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/execution/workers/register",
    {
      schema: { tags: ["execution"], summary: "Register/update a local execution worker machine" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const body = asRecord(request.body) ?? {};
      const machineId = asString(body.machineId);
      const name = asString(body.name);
      const host = asString(body.host);
      const mode = toExecutionMode(body.mode);
      const capabilities = asStringArray(body.capabilities);
      const metadata = asRecord(body.metadata);
      const input: {
        tenantId: string;
        actor: string;
        machineId?: string;
        name?: string;
        host?: string;
        mode?: ExecutionMode;
        capabilities?: string[];
        metadata?: Record<string, unknown>;
      } = {
        tenantId: request.tenantId ?? "tenant_default",
        actor: request.authPrincipal?.userId ?? "local_worker"
      };
      if (machineId) input.machineId = machineId;
      if (name) input.name = name;
      if (host) input.host = host;
      if (mode) input.mode = mode;
      if (capabilities.length > 0) input.capabilities = capabilities;
      if (metadata) input.metadata = metadata;
      const machine = await registerExecutionWorker(input);
      return { item: machine };
    }
  );

  fastify.post<{ Params: { machineId: string } }>(
    "/execution/workers/:machineId/heartbeat",
    {
      schema: { tags: ["execution"], summary: "Send local worker heartbeat with capabilities" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const body = asRecord(request.body) ?? {};
      const item = await heartbeatExecutionWorker({
        tenantId: request.tenantId ?? "tenant_default",
        machineId: request.params.machineId,
        actor: request.authPrincipal?.userId ?? "local_worker",
        ...(asString(body.status) ? { status: body.status as "online" | "degraded" | "offline" | "maintenance" } : {}),
        ...(asStringArray(body.capabilities).length > 0 ? { capabilities: asStringArray(body.capabilities) } : {}),
        ...(asRecord(body.metadata) ? { metadata: asRecord(body.metadata) as Record<string, unknown> } : {})
      });
      return { item };
    }
  );

  fastify.post(
    "/execution/jobs/claim",
    {
      schema: { tags: ["execution"], summary: "Claim local/hybrid routed jobs for worker execution" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const body = asRecord(request.body) ?? {};
      const machineId = asString(body.machineId);
      if (!machineId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "machineId is required"
        });
      }
      const mode = toExecutionMode(body.mode);
      const capabilities = asStringArray(body.capabilities);
      const claimInput: {
        tenantId: string;
        machineId: string;
        actor: string;
        mode?: ExecutionMode;
        capabilities?: string[];
        limit?: number;
      } = {
        tenantId: request.tenantId ?? "tenant_default",
        machineId,
        actor: request.authPrincipal?.userId ?? "local_worker"
      };
      if (mode) claimInput.mode = mode;
      if (capabilities.length > 0) claimInput.capabilities = capabilities;
      if (typeof body.limit === "number") claimInput.limit = body.limit;
      const items = await claimExecutionJobs(claimInput);
      return { items };
    }
  );

  fastify.post<{ Params: { jobId: string } }>(
    "/execution/jobs/:jobId/complete",
    {
      schema: { tags: ["execution"], summary: "Mark a claimed execution job as done" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const body = asRecord(request.body) ?? {};
      const machineId = asString(body.machineId);
      if (!machineId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "machineId is required"
        });
      }
      const usage = asRecord(body.usage);
      const completeInput: {
        tenantId: string;
        jobId: string;
        machineId: string;
        actor: string;
        result?: unknown;
        metadata?: Record<string, unknown>;
        usage?: {
          provider?: string;
          model?: string;
          inputTokens?: number;
          outputTokens?: number;
          cost?: number;
          metadata?: Record<string, unknown>;
        };
      } = {
        tenantId: request.tenantId ?? "tenant_default",
        jobId: request.params.jobId,
        machineId,
        actor: request.authPrincipal?.userId ?? "local_worker"
      };
      if (body.result !== undefined) completeInput.result = body.result;
      const metadata = asRecord(body.metadata);
      if (metadata) completeInput.metadata = metadata;
      if (usage) {
        const usagePayload: {
          provider?: string;
          model?: string;
          inputTokens?: number;
          outputTokens?: number;
          cost?: number;
          metadata?: Record<string, unknown>;
        } = {};
        const provider = asString(usage.provider);
        const model = asString(usage.model);
        if (provider) usagePayload.provider = provider;
        if (model) usagePayload.model = model;
        if (typeof usage.inputTokens === "number") usagePayload.inputTokens = usage.inputTokens;
        if (typeof usage.outputTokens === "number") usagePayload.outputTokens = usage.outputTokens;
        if (typeof usage.cost === "number") usagePayload.cost = usage.cost;
        const usageMetadata = asRecord(usage.metadata);
        if (usageMetadata) usagePayload.metadata = usageMetadata;
        completeInput.usage = usagePayload;
      }
      const item = await completeExecutionJob(completeInput);
      return { item };
    }
  );

  fastify.post<{ Params: { jobId: string } }>(
    "/execution/jobs/:jobId/fail",
    {
      schema: { tags: ["execution"], summary: "Mark a claimed execution job as failed" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const body = asRecord(request.body) ?? {};
      const machineId = asString(body.machineId);
      const error = asString(body.error);
      if (!machineId || !error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "machineId and error are required"
        });
      }
      const item = await failExecutionJob({
        tenantId: request.tenantId ?? "tenant_default",
        jobId: request.params.jobId,
        machineId,
        actor: request.authPrincipal?.userId ?? "local_worker",
        error,
        ...(asRecord(body.metadata) ? { metadata: asRecord(body.metadata) as Record<string, unknown> } : {})
      });
      return { item };
    }
  );

  fastify.post(
    "/execution/internal-action",
    {
      schema: { tags: ["execution"], summary: "Execute an internal runner action via execution fabric" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const body = asRecord(request.body) ?? {};
      const action = asString(body.action);
      if (!action) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "action is required"
        });
      }
      const payload = asRecord(body.payload) ?? {};
      const mode = toExecutionMode(body.mode);
      const job = await dispatchAndAwaitRunnerJob(
        {
          tenantId: request.tenantId ?? "tenant_default",
          createdBy: request.authPrincipal?.userId ?? "execution_control",
          type: "system",
          title: `Execution internal action: ${action}`,
          payload: {
            internalAction: action,
            ...payload,
            ...(mode ? { execution: { mode } } : {})
          }
        },
        { timeoutMs: 20_000 }
      );
      const item = getRunnerJobOutput<Record<string, unknown>>(job) ?? {};
      return { item, jobId: job.id };
    }
  );
};
