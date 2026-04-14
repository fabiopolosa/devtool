import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const repositoriesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/repositories", { schema: { tags: ["repositories"], summary: "List repositories" } }, async () => ({ items: await apiStore.listRepositories() }));

  fastify.get<{ Params: { repositoryId: string } }>("/repositories/:repositoryId", { schema: { tags: ["repositories"], summary: "Get repository" } }, async (request, reply) => {
    const item = await apiStore.getRepository(request.params.repositoryId);
    if (!item) return reply.code(404).send({ item: null });
    return { item };
  });
};
