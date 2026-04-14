import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const roadmapRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>("/roadmap", { schema: { tags: ["roadmap"], summary: "List roadmap items" } }, async (request) => ({ items: await apiStore.listRoadmap(request.query.projectId) }));
};
