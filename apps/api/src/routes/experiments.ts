import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const experimentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/experiments", { schema: { tags: ["experiments"], summary: "List experiments" } }, async () => ({ items: await apiStore.listExperiments() }));

  fastify.get<{ Params: { experimentId: string } }>("/experiments/:experimentId/runs", { schema: { tags: ["experiments"], summary: "List experiment runs" } }, async (request) => ({ items: await apiStore.listExperimentRuns(request.params.experimentId) }));
};
