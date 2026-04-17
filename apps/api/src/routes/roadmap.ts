import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { requireAuthenticatedTenantPermission } from "../tenant/rbac.js";

export const roadmapRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/roadmap",
    { schema: { tags: ["roadmap"], summary: "List roadmap items" } },
    async (request, reply) => {
      if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listRoadmap(request.query.projectId) };
    }
  );
};
