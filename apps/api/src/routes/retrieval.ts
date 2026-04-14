import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const retrievalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>("/retrieval/logs", { schema: { tags: ["retrieval"], summary: "List retrieval logs" } }, async (request) => ({ items: await apiStore.listRetrievalLogs(request.query.projectId) }));
};
