import type { FastifyPluginAsync } from "fastify";
import { healthService } from "../services/health-service.js";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", { schema: { tags: ["health"], summary: "Health endpoint" } }, async () => healthService.health());
};
