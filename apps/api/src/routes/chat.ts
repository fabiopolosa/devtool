import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>("/chat/threads", { schema: { tags: ["chat"], summary: "List chat threads" } }, async (request) => ({ items: await apiStore.listThreads(request.query.projectId) }));

  fastify.get<{ Params: { threadId: string } }>("/chat/threads/:threadId/messages", { schema: { tags: ["chat"], summary: "List chat messages" } }, async (request) => ({
    items: await apiStore.listMessages(request.params.threadId)
  }));
};
