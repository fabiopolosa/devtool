import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";

export const verificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { runId?: string } }>("/verification/results", { schema: { tags: ["verification"], summary: "List verification results" } }, async (request) => ({ items: await apiStore.listVerificationResults(request.query.runId) }));

  fastify.get<{ Querystring: { runId?: string } }>("/verification/steps", { schema: { tags: ["verification"], summary: "List verification steps" } }, async (request) => ({ items: await apiStore.listVerificationSteps(request.query.runId) }));
};
