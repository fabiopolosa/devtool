import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { requireAuthenticatedTenantPermission } from "../tenant/rbac.js";

export const repositoriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/repositories", { schema: { tags: ["repositories"], summary: "List repositories" } }, async (request, reply) => {
    if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
    return { items: await apiStore.listRepositories() };
  });

  fastify.get<{ Params: { repositoryId: string } }>("/repositories/:repositoryId", { schema: { tags: ["repositories"], summary: "Get repository" } }, async (request, reply) => {
    if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
    const item = await apiStore.getRepository(request.params.repositoryId);
    if (!item) return reply.code(404).send({ item: null });
    return { item };
  });
};
