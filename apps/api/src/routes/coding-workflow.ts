import type { FastifyPluginAsync } from "fastify";
import {
  approvePatch,
  approvePlan,
  createCodingWorkflow,
  getCodingWorkflow,
  listCodingWorkflows,
  rejectPatch,
  rejectPlan,
  requestPatchRevision,
  requestPlanRevision
} from "../services/coding-workflow-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface CodingWorkflowCreateBody {
  title?: string;
  request: string;
  actor?: string;
}

interface RevisionBody {
  actor?: string;
  note?: string;
}

const toActor = (request: { authPrincipal: { userId?: string } | undefined }, bodyActor?: string): string =>
  bodyActor ?? request.authPrincipal?.userId ?? "coding_workflow_service";

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

      const item = await createCodingWorkflow({
        tenantId: request.tenantId ?? "tenant_default",
        projectId: request.params.projectId,
        title: request.body.title?.trim() || request.body.request.slice(0, 64),
        request: request.body.request,
        actor: toActor(request, request.body.actor)
      });
      return { item };
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
        const result = await approvePlan(
          request.params.workflowId,
          request.params.projectId,
          request.tenantId ?? "tenant_default",
          toActor(request, request.body?.actor)
        );
        return { item: result.item, generatedTasks: result.generatedTasks };
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
        const item = await rejectPlan(
          request.params.workflowId,
          request.params.projectId,
          request.tenantId ?? "tenant_default",
          toActor(request, request.body?.actor),
          request.body?.note
        );
        return { item };
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
        const item = await requestPlanRevision(
          request.params.workflowId,
          request.params.projectId,
          request.tenantId ?? "tenant_default",
          toActor(request, request.body?.actor),
          request.body?.note
        );
        return { item };
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
        const item = await approvePatch(
          request.params.workflowId,
          request.params.projectId,
          request.tenantId ?? "tenant_default",
          toActor(request, request.body?.actor)
        );
        return { item };
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
        const item = await rejectPatch(
          request.params.workflowId,
          request.params.projectId,
          request.tenantId ?? "tenant_default",
          toActor(request, request.body?.actor),
          request.body?.note
        );
        return { item };
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
        const item = await requestPatchRevision(
          request.params.workflowId,
          request.params.projectId,
          request.tenantId ?? "tenant_default",
          toActor(request, request.body?.actor),
          request.body?.note
        );
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Coding workflow not found"
        });
      }
    }
  );
};
