import type { FastifyPluginAsync } from "fastify";
import { buildKnowledgeContext } from "../services/knowledge-service.js";
import { apiStore } from "../services/api-store.js";
import { requireTenantPermission } from "../tenant/rbac.js";

export const retrievalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/retrieval/logs",
    { schema: { tags: ["retrieval"], summary: "List retrieval logs" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      return { items: await apiStore.listRetrievalLogs(request.query.projectId) };
    }
  );

  fastify.get<{
    Querystring: { projectId?: string; query?: string; limit?: string; threshold?: string };
  }>(
    "/retrieval/search",
    { schema: { tags: ["retrieval"], summary: "Run semantic retrieval over knowledge/context" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const query = request.query.query?.trim();
      if (!query) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "query is required"
        });
      }

      const limitRaw = request.query.limit ? Number.parseInt(request.query.limit, 10) : undefined;
      const thresholdRaw = request.query.threshold
        ? Number.parseFloat(request.query.threshold)
        : undefined;

      const item = await buildKnowledgeContext({
        tenantId: request.tenantId ?? "tenant_default",
        ...(request.query.projectId ? { projectId: request.query.projectId } : {}),
        query,
        ...(typeof limitRaw === "number" && Number.isFinite(limitRaw) ? { limit: limitRaw } : {}),
        ...(typeof thresholdRaw === "number" && Number.isFinite(thresholdRaw)
          ? { threshold: thresholdRaw }
          : {})
      });
      return { item };
    }
  );
};
