import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import {
  dispatchAndAwaitRunnerJob,
  getRunnerJobOutput
} from "../services/job-dispatch-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

export const experimentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/experiments",
    { schema: { tags: ["experiments"], summary: "List experiments" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listExperiments() };
    }
  );

  fastify.get<{ Params: { experimentId: string } }>(
    "/experiments/:experimentId/runs",
    { schema: { tags: ["experiments"], summary: "List experiment runs" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listExperimentRuns(request.params.experimentId) };
    }
  );

  fastify.post<{
    Params: { experimentId: string };
    Body?: { query?: string; variantIds?: string[]; actor?: string };
  }>(
    "/experiments/:experimentId/run",
    { schema: { tags: ["experiments"], summary: "Run an AutoResearch experiment via runner" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const actor = request.body?.actor ?? request.authPrincipal?.userId ?? "autoresearch_service";
      try {
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Run experiment ${request.params.experimentId}`,
            createdBy: actor,
            payload: {
              internalAction: "autoresearch.run_experiment",
              tenantId: request.tenantId ?? "tenant_default",
              experimentId: request.params.experimentId,
              actor,
              ...(request.body?.query ? { query: request.body.query } : {}),
              ...(Array.isArray(request.body?.variantIds) ? { variantIds: request.body.variantIds } : {})
            },
            resourceType: "experiment",
            resourceId: request.params.experimentId
          },
          { timeoutMs: 180_000 }
        );

        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        return { item: output?.result ?? null };
      } catch (error) {
        return reply.code(400).send({
          error: "experiment_run_failed",
          message: error instanceof Error ? error.message : "Unable to run experiment"
        });
      }
    }
  );

  fastify.post<{
    Params: { experimentId: string };
    Body?: { actor?: string };
  }>(
    "/experiments/:experimentId/evaluate",
    { schema: { tags: ["experiments"], summary: "Evaluate AutoResearch experiment runs via runner" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const actor = request.body?.actor ?? request.authPrincipal?.userId ?? "autoresearch_service";
      try {
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Evaluate experiment ${request.params.experimentId}`,
            createdBy: actor,
            payload: {
              internalAction: "autoresearch.evaluate_experiment",
              experimentId: request.params.experimentId,
              actor
            },
            resourceType: "experiment",
            resourceId: request.params.experimentId
          },
          { timeoutMs: 120_000 }
        );
        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        return { item: output?.result ?? null };
      } catch (error) {
        return reply.code(400).send({
          error: "experiment_evaluate_failed",
          message: error instanceof Error ? error.message : "Unable to evaluate experiment"
        });
      }
    }
  );
};
