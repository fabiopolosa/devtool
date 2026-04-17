import type { FastifyPluginAsync } from "fastify";
import { jobActionTypeSchema, jobStatusSchema, jobTypeSchema } from "@cp/domain";
import {
  createJob,
  getExecutableJobs,
  getJob,
  getJobRuntimeSnapshot,
  listJobs,
  summarizeJobsTelemetry,
  updateJobStatus
} from "../services/jobs-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface JobsQuery {
  type?: string;
  status?: string;
  actionRequired?: string;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  ready?: string;
  projectId?: string;
}

interface CreateJobBody {
  projectId?: string;
  type: string;
  title: string;
  status?: string;
  priority?: number;
  retryCount?: number;
  maxRetries?: number;
  actionRequired?: boolean;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  dependencies?: string[];
}

interface UpdateJobStatusBody {
  status: string;
  actionRequired?: boolean;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
}

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
};

const resolveErrorStatusCode = (error: unknown, fallback: number): number => {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : NaN;
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status;
  }
  return fallback;
};

export const jobsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/jobs",
    {
      schema: { tags: ["jobs"], summary: "List jobs for a project scoped to current tenant" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const items = await listJobs({ projectId: request.params.projectId });
      return { items };
    }
  );

  fastify.get<{ Querystring: JobsQuery }>(
    "/jobs",
    {
      schema: { tags: ["jobs"], summary: "List jobs scoped to current tenant" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;

      const type = request.query.type ? jobTypeSchema.safeParse(request.query.type) : null;
      if (type && !type.success) {
        return reply.code(400).send({ error: "invalid_request", message: "Invalid job type filter" });
      }

      const status = request.query.status ? jobStatusSchema.safeParse(request.query.status) : null;
      if (status && !status.success) {
        return reply.code(400).send({ error: "invalid_request", message: "Invalid job status filter" });
      }

      const actionType = request.query.actionType ? jobActionTypeSchema.safeParse(request.query.actionType) : null;
      if (actionType && !actionType.success) {
        return reply.code(400).send({ error: "invalid_request", message: "Invalid job action type filter" });
      }

      const items = await listJobs({
        ...(type?.success ? { type: type.data } : {}),
        ...(status?.success ? { status: status.data } : {}),
        ...(typeof parseBoolean(request.query.actionRequired) === "boolean"
          ? { actionRequired: parseBoolean(request.query.actionRequired) as boolean }
          : {}),
        ...(actionType?.success ? { actionType: actionType.data } : {}),
        ...(request.query.resourceType ? { resourceType: request.query.resourceType } : {}),
        ...(request.query.resourceId ? { resourceId: request.query.resourceId } : {}),
        ...(typeof parseBoolean(request.query.ready) === "boolean"
          ? { ready: parseBoolean(request.query.ready) as boolean }
          : {}),
        ...(request.query.projectId ? { projectId: request.query.projectId } : {})
      });
      return { items };
    }
  );

  fastify.get<{ Querystring: { projectId?: string } }>(
    "/jobs/executable",
    {
      schema: { tags: ["jobs"], summary: "List executable jobs (ready + idle)" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const items = await getExecutableJobs(request.query.projectId);
      return { items };
    }
  );

  fastify.get<{ Querystring: { projectId?: string; windowMinutes?: string } }>(
    "/jobs/telemetry",
    {
      schema: { tags: ["jobs"], summary: "Summarize job telemetry (count, error rate, duration) per tenant/project" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const parsedWindow =
        typeof request.query.windowMinutes === "string" && request.query.windowMinutes.trim().length > 0
          ? Number.parseInt(request.query.windowMinutes, 10)
          : undefined;
      const telemetryInput: { projectId?: string; windowMinutes?: number } = {};
      if (request.query.projectId) {
        telemetryInput.projectId = request.query.projectId;
      }
      if (typeof parsedWindow === "number" && Number.isFinite(parsedWindow)) {
        telemetryInput.windowMinutes = parsedWindow;
      }
      const item = await summarizeJobsTelemetry(telemetryInput);
      return { item };
    }
  );

  fastify.post<{ Body: CreateJobBody }>(
    "/jobs",
    {
      schema: { tags: ["jobs"], summary: "Create a job with optional DAG dependencies" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;

      const type = jobTypeSchema.safeParse(request.body?.type);
      if (!type.success) {
        return reply.code(400).send({ error: "invalid_request", message: "Invalid job type" });
      }

      const title = request.body?.title?.trim();
      if (!title) {
        return reply.code(400).send({ error: "invalid_request", message: "title is required" });
      }

      const status = request.body?.status ? jobStatusSchema.safeParse(request.body.status) : null;
      if (status && !status.success) {
        return reply.code(400).send({ error: "invalid_request", message: "Invalid job status" });
      }

      const actionType = request.body?.actionType ? jobActionTypeSchema.safeParse(request.body.actionType) : null;
      if (actionType && !actionType.success) {
        return reply.code(400).send({ error: "invalid_request", message: "Invalid job actionType" });
      }

      try {
        const item = await createJob({
          tenantId: request.tenantId ?? "tenant_default",
          ...(request.body?.projectId ? { projectId: request.body.projectId } : {}),
          type: type.data,
          title,
          ...(status?.success ? { status: status.data } : {}),
          ...(typeof request.body?.priority === "number" ? { priority: request.body.priority } : {}),
          ...(typeof request.body?.retryCount === "number" ? { retryCount: request.body.retryCount } : {}),
          ...(typeof request.body?.maxRetries === "number" ? { maxRetries: request.body.maxRetries } : {}),
          ...(typeof request.body?.actionRequired === "boolean"
            ? { actionRequired: request.body.actionRequired }
            : {}),
          ...(actionType?.success ? { actionType: actionType.data } : {}),
          ...(request.body?.resourceType ? { resourceType: request.body.resourceType } : {}),
          ...(request.body?.resourceId ? { resourceId: request.body.resourceId } : {}),
          ...(request.body?.payload ? { payload: request.body.payload } : {}),
          ...(Array.isArray(request.body?.dependencies) ? { dependencies: request.body.dependencies } : {}),
          createdBy: request.authPrincipal?.userId ?? "system"
        });
        return { item };
      } catch (error) {
        return reply.code(resolveErrorStatusCode(error, 400)).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to create job"
        });
      }
    }
  );

  fastify.get<{ Params: { jobId: string } }>(
    "/jobs/:jobId",
    {
      schema: { tags: ["jobs"], summary: "Get a job scoped to current tenant" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const item = await getJob(request.params.jobId);
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.get<{ Params: { jobId: string } }>(
    "/jobs/:jobId/runtime",
    {
      schema: { tags: ["jobs"], summary: "Get runtime snapshot for a job (logs, dependencies, details)" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const item = await getJobRuntimeSnapshot(request.params.jobId);
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.patch<{ Params: { jobId: string }; Body: UpdateJobStatusBody }>(
    "/jobs/:jobId/status",
    {
      schema: { tags: ["jobs"], summary: "Update job status (tenant edit permission required)" }
    },
    async (request, reply) => {
      const status = jobStatusSchema.safeParse(request.body?.status);
      if (!status.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "status is required and must be valid"
        });
      }

      const existing = await getJob(request.params.jobId);
      if (!existing) {
        return reply.code(404).send({
          error: "not_found",
          message: "Job not found"
        });
      }

      const canEditGlobally = request.tenantPermissions?.canEdit === true;
      const isOwner = Boolean(request.authPrincipal?.userId && existing.createdBy === request.authPrincipal.userId);

      if (!canEditGlobally && !isOwner) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Missing permission to modify this job"
        });
      }

      const actionType = request.body?.actionType ? jobActionTypeSchema.safeParse(request.body.actionType) : null;
      if (actionType && !actionType.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "Invalid actionType"
        });
      }

      try {
        const item = await updateJobStatus(request.params.jobId, status.data, {
          ...(typeof request.body.actionRequired === "boolean"
            ? { actionRequired: request.body.actionRequired }
            : {}),
          ...(actionType?.success ? { actionType: actionType.data } : {}),
          ...(request.body.resourceType ? { resourceType: request.body.resourceType } : {}),
          ...(request.body.resourceId ? { resourceId: request.body.resourceId } : {})
        });
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to update job status"
        });
      }
    }
  );
};
