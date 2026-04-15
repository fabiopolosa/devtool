import type { FastifyPluginAsync } from "fastify";
import { requireTenantPermission } from "../tenant/rbac.js";
import { getSchemaObservabilitySnapshot } from "../services/schema-observability-service.js";

export const schemaObservabilityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/schema-observability",
    {
      schema: {
        tags: ["schema-observability"],
        summary: "Return node-based schema observability snapshot"
      }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const item = await getSchemaObservabilitySnapshot({
        tenantId: request.tenantId ?? "tenant_default",
        ...(request.query.projectId ? { projectId: request.query.projectId } : {})
      });
      return { item };
    }
  );
};
