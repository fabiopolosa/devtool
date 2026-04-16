import type { FastifyPluginAsync } from "fastify";
import {
  createCodingWorkflow,
  getCodingWorkflow,
  listCodingWorkflows
} from "../services/coding-workflow-service.js";
import {
  dispatchAndAwaitRunnerJob,
  getRunnerJobOutput
} from "../services/job-dispatch-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface CodingWorkflowCreateBody {
  title?: string;
  request: string;
  actor?: string;
  mode?: "remote" | "local" | "hybrid";
}

interface RevisionBody {
  actor?: string;
  note?: string;
  mode?: "remote" | "local" | "hybrid";
}

const toActor = (request: { authPrincipal: { userId?: string } | undefined }, bodyActor?: string): string =>
  bodyActor ?? request.authPrincipal?.userId ?? "coding_workflow_service";

const toExecutionMode = (value: unknown): "remote" | "local" | "hybrid" | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "remote" || normalized === "local" || normalized === "hybrid") return normalized;
  return undefined;
};

export const codingWorkflowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { projectId: string };
    Querystring: { state?: string };
  }>(
    "/projects/:projectId/coding-workflows",
    {
      schema: { tags: ["coding-workflow"], summary: "List project-scoped coding workflows" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const items = await listCodingWorkflows({
        projectId: request.params.projectId,
        ...(request.query.state ? { state: request.query.state as never } : {})
      });
      return { items };
    }
  );

  fastify.post<{
    Params: { projectId: string };
    Body: CodingWorkflowCreateBody;
  }>(
    "/projects/:projectId/coding-workflows",
    {
      schema: { tags: ["coding-workflow"], summary: "Create a new coding request and generated plan" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      if (!request.body?.request?.trim()) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "request is required"
        });
      }

      try {
        const actor = toActor(request, request.body.actor);
        const mode = toExecutionMode(request.body.mode);
        const title = request.body.title?.trim() || request.body.request.slice(0, 64);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "system",
            title: `Create coding workflow: ${title.slice(0, 80)}`,
            createdBy: actor,
            payload: {
              internalAction: "coding.workflow.create",
              tenantId: request.tenantId ?? "tenant_default",
              projectId: request.params.projectId,
              title,
              request: request.body.request,
              actor,
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{ result?: Awaited<ReturnType<typeof createCodingWorkflow>> }>(job);
        if (!output?.result) {
          throw new Error("Runner completed coding workflow create job without result payload");
        }
        return { item: output.result };
      } catch (error) {
        return reply.code(400).send({
          error: "coding_workflow_runner_error",
          message: error instanceof Error ? error.message : "Unable to create coding workflow"
        });
      }
    }
  );

  fastify.get<{ Params: { projectId: string; workflowId: string } }>(
    "/projects/:projectId/coding-workflows/:workflowId",
    {
      schema: { tags: ["coding-workflow"], summary: "Get a coding workflow by id" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const item = await getCodingWorkflow(
        request.params.workflowId,
        request.params.projectId,
        request.tenantId ?? "tenant_default"
      );
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.post<{ Params: { projectId: string; workflowId: string }; Body?: RevisionBody }>(
    "/projects/:projectId/coding-workflows/:workflowId/plan/approve",
    { schema: { tags: ["coding-workflow"], summary: "Approve the generated plan" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canApprove")) return;
      try {
        const actor = toActor(request, request.body?.actor);
        const mode = toExecutionMode(request.body?.mode);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "system",
            title: `Approve coding workflow plan ${request.params.workflowId}`,
            createdBy: actor,
            payload: {
              internalAction: "coding.plan.approve",
              workflowId: request.params.workflowId,
              projectId: request.params.projectId,
              tenantId: request.tenantId ?? "tenant_default",
              actor,
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{
          result?: {
            item: Awaited<ReturnType<typeof getCodingWorkflow>>;
            generatedTasks?: Array<Record<string, unknown>>;
          };
        }>(job);
        if (!output?.result) {
          throw new Error("Runner completed plan approval job without result payload");
        }
        return {
          item: output.result.item,
          ...(output.result.generatedTasks ? { generatedTasks: output.result.generatedTasks } : {})
        };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Coding workflow not found"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string; workflowId: string }; Body?: RevisionBody }>(
    "/projects/:projectId/coding-workflows/:workflowId/plan/reject",
    { schema: { tags: ["coding-workflow"], summary: "Reject the generated plan" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canApprove")) return;
      try {
        const actor = toActor(request, request.body?.actor);
        const mode = toExecutionMode(request.body?.mode);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "system",
            title: `Reject coding workflow plan ${request.params.workflowId}`,
            createdBy: actor,
            payload: {
              internalAction: "coding.plan.reject",
              workflowId: request.params.workflowId,
              projectId: request.params.projectId,
              tenantId: request.tenantId ?? "tenant_default",
              actor,
              ...(request.body?.note ? { note: request.body.note } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        if (!output?.result) {
          throw new Error("Runner completed plan reject job without result payload");
        }
        return { item: output.result };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Coding workflow not found"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string; workflowId: string }; Body?: RevisionBody }>(
    "/projects/:projectId/coding-workflows/:workflowId/plan/request-revision",
    { schema: { tags: ["coding-workflow"], summary: "Request a plan revision" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const actor = toActor(request, request.body?.actor);
        const mode = toExecutionMode(request.body?.mode);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "system",
            title: `Request coding workflow plan revision ${request.params.workflowId}`,
            createdBy: actor,
            payload: {
              internalAction: "coding.plan.request_revision",
              workflowId: request.params.workflowId,
              projectId: request.params.projectId,
              tenantId: request.tenantId ?? "tenant_default",
              actor,
              ...(request.body?.note ? { note: request.body.note } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        if (!output?.result) {
          throw new Error("Runner completed plan revision job without result payload");
        }
        return { item: output.result };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Coding workflow not found"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string; workflowId: string }; Body?: RevisionBody }>(
    "/projects/:projectId/coding-workflows/:workflowId/patch/approve",
    { schema: { tags: ["coding-workflow"], summary: "Approve the patch proposal and execute workflow" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canApprove")) return;
      try {
        const actor = toActor(request, request.body?.actor);
        const mode = toExecutionMode(request.body?.mode);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "system",
            title: `Approve coding workflow patch ${request.params.workflowId}`,
            createdBy: actor,
            payload: {
              internalAction: "coding.patch.approve",
              workflowId: request.params.workflowId,
              projectId: request.params.projectId,
              tenantId: request.tenantId ?? "tenant_default",
              actor,
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        if (!output?.result) {
          throw new Error("Runner completed patch approve job without result payload");
        }
        return { item: output.result };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Coding workflow not found"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string; workflowId: string }; Body?: RevisionBody }>(
    "/projects/:projectId/coding-workflows/:workflowId/patch/reject",
    { schema: { tags: ["coding-workflow"], summary: "Reject the patch proposal" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canApprove")) return;
      try {
        const actor = toActor(request, request.body?.actor);
        const mode = toExecutionMode(request.body?.mode);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "system",
            title: `Reject coding workflow patch ${request.params.workflowId}`,
            createdBy: actor,
            payload: {
              internalAction: "coding.patch.reject",
              workflowId: request.params.workflowId,
              projectId: request.params.projectId,
              tenantId: request.tenantId ?? "tenant_default",
              actor,
              ...(request.body?.note ? { note: request.body.note } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        if (!output?.result) {
          throw new Error("Runner completed patch reject job without result payload");
        }
        return { item: output.result };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Coding workflow not found"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string; workflowId: string }; Body?: RevisionBody }>(
    "/projects/:projectId/coding-workflows/:workflowId/patch/request-revision",
    { schema: { tags: ["coding-workflow"], summary: "Request a patch revision" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const actor = toActor(request, request.body?.actor);
        const mode = toExecutionMode(request.body?.mode);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            projectId: request.params.projectId,
            type: "system",
            title: `Request coding workflow patch revision ${request.params.workflowId}`,
            createdBy: actor,
            payload: {
              internalAction: "coding.patch.request_revision",
              workflowId: request.params.workflowId,
              projectId: request.params.projectId,
              tenantId: request.tenantId ?? "tenant_default",
              actor,
              ...(request.body?.note ? { note: request.body.note } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "project",
            resourceId: request.params.projectId
          },
          { timeoutMs: 120_000 }
        );

        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        if (!output?.result) {
          throw new Error("Runner completed patch revision job without result payload");
        }
        return { item: output.result };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Coding workflow not found"
        });
      }
    }
  );
};
