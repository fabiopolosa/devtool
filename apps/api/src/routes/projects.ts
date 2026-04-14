import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/projects", {
    schema: { tags: ["projects"], summary: "List projects" }
  }, async () => ({ items: await apiStore.listProjects() }));

  fastify.get<{ Params: { projectId: string } }>("/projects/:projectId", {
    schema: { tags: ["projects"], summary: "Get a project" }
  }, async (request, reply) => {
    const item = await apiStore.getProject(request.params.projectId);
    if (!item) return reply.code(404).send({ item: null });
    return { item };
  });
};
