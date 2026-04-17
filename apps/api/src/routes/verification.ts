import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { requireAuthenticatedTenantPermission } from "../tenant/rbac.js";

export const verificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { runId?: string } }>(
    "/verification/results",
    { schema: { tags: ["verification"], summary: "List verification results" } },
    async (request, reply) => {
      if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listVerificationResults(request.query.runId) };
    }
  );

  fastify.get<{ Querystring: { runId?: string } }>(
    "/verification/steps",
    { schema: { tags: ["verification"], summary: "List verification steps" } },
    async (request, reply) => {
      if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listVerificationSteps(request.query.runId) };
    }
  );
};
