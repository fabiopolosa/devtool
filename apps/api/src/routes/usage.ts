import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { usageService } from "../services/usage-service.js";

const resolveTenantId = (request: FastifyRequest): string | undefined => {
  const requestTenant = (request as FastifyRequest & { tenantId?: string }).tenantId;
  if (requestTenant) return requestTenant;
  const header = request.headers["x-tenant-id"];
  return typeof header === "string" && header.trim().length > 0 ? header.trim() : undefined;
};

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
      const parse = querySchema.safeParse(request.query);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      const tenantId = parse.data.tenantId ?? resolveTenantId(request);
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
