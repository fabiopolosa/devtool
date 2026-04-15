import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { auditLogService } from "../services/audit-log-service.js";

const statusSchema = z.enum(["success", "failure"]);

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
  userId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  status: statusSchema.optional()
});

export const createAuditRoutes = (service = auditLogService): FastifyPluginAsync => async (fastify) => {
  fastify.get(
    "/audit",
    {
      schema: {
        tags: ["audit"],
        summary: "List audit events with tenant/project/job filters"
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
      const items = await service.list({
        ...(tenantId ? { tenantId } : {}),
        ...(parse.data.projectId ? { projectId: parse.data.projectId } : {}),
        ...(parse.data.jobId ? { jobId: parse.data.jobId } : {}),
        ...(parse.data.userId ? { userId: parse.data.userId } : {}),
        ...(parse.data.action ? { action: parse.data.action } : {}),
        ...(parse.data.resourceType ? { resourceType: parse.data.resourceType } : {}),
        ...(parse.data.resourceId ? { resourceId: parse.data.resourceId } : {}),
        ...(parse.data.status ? { status: parse.data.status } : {})
      });
      const summary = await service.summary({
        ...(tenantId ? { tenantId } : {}),
        ...(parse.data.projectId ? { projectId: parse.data.projectId } : {}),
        ...(parse.data.jobId ? { jobId: parse.data.jobId } : {}),
        ...(parse.data.userId ? { userId: parse.data.userId } : {}),
        ...(parse.data.action ? { action: parse.data.action } : {}),
        ...(parse.data.resourceType ? { resourceType: parse.data.resourceType } : {}),
        ...(parse.data.resourceId ? { resourceId: parse.data.resourceId } : {}),
        ...(parse.data.status ? { status: parse.data.status } : {})
      });
      return { items, summary };
    }
  );
};

export const auditRoutes = createAuditRoutes();
