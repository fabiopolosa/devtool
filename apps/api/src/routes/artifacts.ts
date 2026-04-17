import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { requireAuthenticatedTenantPermission } from "../tenant/rbac.js";

export const artifactsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { runId?: string } }>(
    "/artifacts",
    { schema: { tags: ["artifacts"], summary: "List artifacts" } },
    async (request, reply) => {
      if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listArtifacts(request.query.runId) };
    }
  );
};
