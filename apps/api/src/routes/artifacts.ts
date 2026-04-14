import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const artifactsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { runId?: string } }>("/artifacts", { schema: { tags: ["artifacts"], summary: "List artifacts" } }, async (request) => ({ items: await apiStore.listArtifacts(request.query.runId) }));
};
