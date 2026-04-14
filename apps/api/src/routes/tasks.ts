import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>("/tasks", { schema: { tags: ["tasks"], summary: "List tasks" } }, async (request) => ({ items: await apiStore.listTasks(request.query.projectId) }));

  fastify.get<{ Params: { taskId: string } }>("/tasks/:taskId", { schema: { tags: ["tasks"], summary: "Get task" } }, async (request, reply) => {
    const item = await apiStore.getTask(request.params.taskId);
    if (!item) return reply.code(404).send({ item: null });
    return { item };
  });
};
