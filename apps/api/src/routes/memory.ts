import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { requireAuthenticatedTenantPermission } from "../tenant/rbac.js";

export const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/memory/entries",
    { schema: { tags: ["memory"], summary: "List memory entries" } },
    async (request, reply) => {
      if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listMemoryEntries(request.query.projectId) };
    }
  );

  fastify.get<{ Querystring: { projectId?: string } }>(
    "/memory/chunks",
    { schema: { tags: ["memory"], summary: "List memory chunks" } },
    async (request, reply) => {
      if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listMemoryChunks(request.query.projectId) };
    }
  );
};
