import type { FastifyPluginAsync } from "fastify";
import {
  applyBrainstormPlan,
  approveBrainstormPlan,
  getBrainstormPlan,
  getBrainstormSession,
  listBrainstormPlans,
  listBrainstormSessions,
  startBrainstormSession
} from "../services/brainstorming-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface StartBrainstormBody {
  projectIntent: string;
  threadId?: string;
  projectId?: string;
  selectedSubpromptIds?: string[];
  guidedAnswers?: Record<string, string>;
  actor?: string;
  generatePlan?: boolean;
}

interface ApplyPlanBody {
  actor?: string;
  projectName?: string;
  projectKey?: string;
  description?: string;
  repositoryIds?: string[];
  repositoryUrls?: string[];
}

export const brainstormRoutes: FastifyPluginAsync = async (fastify) => {
  const isContractError = (message: string): boolean =>
    message.includes("Legacy top-level plan fields") ||
    message.includes("Invalid or missing canonical plan payload") ||
    message.includes("Invalid canonical brainstorm plan payload") ||
    message.includes("Non-canonical plan detected at runtime source");

  fastify.get<{
    Querystring: { threadId?: string; projectId?: string; status?: "collecting" | "planned" | "approved" | "applied" | "archived" };
  }>(
    "/brainstorm",
    {
      schema: { tags: ["brainstorm"], summary: "List brainstorming sessions" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const items = await listBrainstormSessions({
        ...(request.query.threadId ? { threadId: request.query.threadId } : {}),
        ...(request.query.projectId ? { projectId: request.query.projectId } : {}),
        ...(request.query.status ? { status: request.query.status } : {})
      });
      return { items };
    }
  );

  fastify.post<{ Body: StartBrainstormBody }>(
    "/brainstorm",
    {
      schema: { tags: ["brainstorm"], summary: "Start a brainstorming session and optionally generate a plan" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const body = request.body;
      if (!body?.projectIntent?.trim()) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "projectIntent is required"
        });
      }

      const item = await startBrainstormSession({
        tenantId: request.tenantId ?? "tenant_default",
        projectIntent: body.projectIntent,
        ...(body.threadId ? { threadId: body.threadId } : {}),
        ...(body.projectId ? { projectId: body.projectId } : {}),
        ...(Array.isArray(body.selectedSubpromptIds)
          ? { selectedSubpromptIds: body.selectedSubpromptIds }
          : {}),
        ...(body.guidedAnswers ? { guidedAnswers: body.guidedAnswers } : {}),
        ...(body.actor ? { actor: body.actor } : request.authPrincipal?.userId ? { actor: request.authPrincipal.userId } : {}),
        ...(typeof body.generatePlan === "boolean" ? { generatePlan: body.generatePlan } : {})
      });

      return { item };
    }
  );

  fastify.get<{ Params: { sessionId: string } }>(
    "/brainstorm/:sessionId",
    {
      schema: { tags: ["brainstorm"], summary: "Get brainstorming session with associated plans" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      try {
        const session = await getBrainstormSession(request.params.sessionId);
        if (!session) {
          return reply.code(404).send({ item: null });
        }
        const plans = await listBrainstormPlans(session.id);
        request.log.info(
          {
            sessionId: request.params.sessionId,
            planCount: plans.length,
            planIds: plans.map((plan) => plan.id)
          },
          "RETURNING PLAN"
        );
        return {
          item: {
            session,
            plans
          }
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid brainstorm session contract";
        if (isContractError(message)) {
          return reply.code(422).send({ error: "invalid_contract", message });
        }
        throw error;
      }
    }
  );

  fastify.get<{ Params: { planId: string } }>(
    "/brainstorm/plan/:planId",
    {
      schema: { tags: ["brainstorm"], summary: "Get final brainstorm plan by id" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      try {
        const item = await getBrainstormPlan(request.params.planId);
        if (!item) {
          return reply.code(404).send({ item: null });
        }
        if (!item.plan) {
          throw new Error("Non-canonical plan detected at runtime source");
        }
        request.log.info(
          {
            planId: request.params.planId,
            sessionId: item.sessionId,
            hasPlan: Boolean(item.plan)
          },
          "RETURNING PLAN"
        );
        return { item };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid brainstorm plan contract";
        if (isContractError(message)) {
          return reply.code(422).send({ error: "invalid_contract", message });
        }
        throw error;
      }
    }
  );

  fastify.post<{ Params: { planId: string }; Body?: { actor?: string } }>(
    "/brainstorm/plan/:planId/approve",
    {
      schema: { tags: ["brainstorm"], summary: "Approve a brainstorm plan and mark session approved" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canApprove")) return;
      try {
        const item = await approveBrainstormPlan(
          request.params.planId,
          request.body?.actor ?? request.authPrincipal?.userId ?? "brainstorming_approval"
        );
        return { item };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Plan not found";
        if (isContractError(message)) {
          return reply.code(422).send({
            error: "invalid_contract",
            message
          });
        }
        return reply.code(404).send({
          error: "not_found",
          message
        });
      }
    }
  );

  fastify.post<{ Params: { planId: string }; Body?: ApplyPlanBody }>(
    "/brainstorm/plan/:planId/create-project",
    {
      schema: {
        tags: ["brainstorm"],
        summary: "Create project/roadmap/tasks/provider bindings from an approved brainstorm plan"
      }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const result = await applyBrainstormPlan({
          tenantId: request.tenantId ?? "tenant_default",
          planId: request.params.planId,
          ...(request.body?.actor ? { actor: request.body.actor } : request.authPrincipal?.userId ? { actor: request.authPrincipal.userId } : {}),
          ...(request.body?.projectName ? { projectName: request.body.projectName } : {}),
          ...(request.body?.projectKey ? { projectKey: request.body.projectKey } : {}),
          ...(request.body?.description ? { description: request.body.description } : {}),
          ...(Array.isArray(request.body?.repositoryIds) ? { repositoryIds: request.body.repositoryIds } : {}),
          ...(Array.isArray(request.body?.repositoryUrls)
            ? { repositoryUrls: request.body.repositoryUrls }
            : {})
        });
        return { item: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to apply brainstorm plan";
        if (isContractError(message)) {
          return reply.code(422).send({ error: "invalid_contract", message });
        }
        if (message.includes("must be approved")) {
          return reply.code(409).send({ error: "invalid_state", message });
        }
        return reply.code(404).send({ error: "not_found", message });
      }
    }
  );
};
