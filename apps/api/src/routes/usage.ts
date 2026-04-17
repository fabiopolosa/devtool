import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { usageService } from "../services/usage-service.js";
import { requireAuthenticatedTenantPermission } from "../tenant/rbac.js";

const querySchema = z.object({
  tenantId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional()
});

export const createUsageRoutes = (service = usageService): FastifyPluginAsync => async (fastify) => {
  fastify.get(
    "/usage",
    {
      schema: {
        tags: ["usage"],
        summary: "List usage events with cost/token aggregates"
      }
    },
    async (request, reply) => {
      if (!requireAuthenticatedTenantPermission(request, reply, "canView")) return;
      const parse = querySchema.safeParse(request.query);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      if (parse.data.tenantId && parse.data.tenantId !== request.tenantId) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Tenant override is not permitted"
        });
      }

      const tenantId = request.tenantId;
      const filters = {
        ...(tenantId ? { tenantId } : {}),
        ...(parse.data.projectId ? { projectId: parse.data.projectId } : {}),
        ...(parse.data.jobId ? { jobId: parse.data.jobId } : {}),
        ...(parse.data.provider ? { provider: parse.data.provider } : {}),
        ...(parse.data.model ? { model: parse.data.model } : {})
      };

      const items = await service.list(filters);
      const summary = await service.summary(filters);
      return { items, summary };
    }
  );
};

export const usageRoutes = createUsageRoutes();
