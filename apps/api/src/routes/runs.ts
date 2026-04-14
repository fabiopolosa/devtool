import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { runEventService } from "../services/run-event-service.js";

export const runsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { taskId?: string } }>("/runs", { schema: { tags: ["runs"], summary: "List task runs" } }, async (request) => ({ items: await apiStore.listRuns(request.query.taskId) }));

  fastify.get<{ Params: { runId: string } }>("/runs/:runId", { schema: { tags: ["runs"], summary: "Get run" } }, async (request, reply) => {
    const item = await apiStore.getRun(request.params.runId);
    if (!item) return reply.code(404).send({ item: null });
    return { item };
  });

  fastify.get<{ Params: { runId: string } }>("/runs/:runId/events", {
    schema: { tags: ["runs"], summary: "Stream run events" }
  }, async (request, reply) => {
    const runId = request.params.runId;
    const events = await runEventService.list(runId);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });

    for (const event of events) {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    reply.raw.write(`event: complete\ndata: ${JSON.stringify({ runId, status: "snapshot" })}\n\n`);
    reply.raw.end();
  });
};
