import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>("/memory/entries", { schema: { tags: ["memory"], summary: "List memory entries" } }, async (request) => ({ items: await apiStore.listMemoryEntries(request.query.projectId) }));

  fastify.get<{ Querystring: { projectId?: string } }>("/memory/chunks", { schema: { tags: ["memory"], summary: "List memory chunks" } }, async (request) => ({ items: await apiStore.listMemoryChunks(request.query.projectId) }));
};
