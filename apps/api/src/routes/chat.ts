import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { getJob, updateJobStatus } from "../services/jobs-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface AgentChatBody {
  message: string;
  jobId?: string;
  context?: Record<string, unknown>;
}

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { projectId?: string } }>("/chat/threads", { schema: { tags: ["chat"], summary: "List chat threads" } }, async (request) => ({ items: await apiStore.listThreads(request.query.projectId) }));

  fastify.get<{ Params: { threadId: string } }>("/chat/threads/:threadId/messages", { schema: { tags: ["chat"], summary: "List chat messages" } }, async (request) => ({
    items: await apiStore.listMessages(request.params.threadId)
  }));

  fastify.post<{ Body: AgentChatBody }>(
    "/agent/chat",
    { schema: { tags: ["chat"], summary: "Send an operational chat message scoped to a job context" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;

      const message = request.body?.message?.trim();
      if (!message) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "message is required"
        });
      }

      const normalized = message.toLowerCase();
      const context = request.body.context ?? {};
      const jobId = request.body.jobId;
      let updatedJob = null;

      if (jobId) {
        const existing = await getJob(jobId);
        if (!existing) {
          return reply.code(404).send({
            error: "not_found",
            message: "Job not found"
          });
        }

        if (/(need|missing|input|details?)/.test(normalized)) {
          updatedJob = await updateJobStatus(jobId, "waiting_user", {
            actionRequired: true,
            actionType: "input"
          });
        } else if (/(approve|approval)/.test(normalized)) {
          updatedJob = await updateJobStatus(jobId, "waiting_user", {
            actionRequired: true,
            actionType: "approve"
          });
        } else if (/(review|check|validate)/.test(normalized)) {
          updatedJob = await updateJobStatus(jobId, "waiting_user", {
            actionRequired: true,
            actionType: "review"
          });
        } else if (/(done|complete|completed|resolved|fixed)/.test(normalized)) {
          updatedJob = await updateJobStatus(jobId, "done", {
            actionRequired: false
          });
        }
      }

      const planId = typeof context.planId === "string" ? context.planId : undefined;
      const responseText = updatedJob
        ? `Context received for job ${updatedJob.id}. Status is now ${updatedJob.status}.`
        : `Message received${jobId ? ` for job ${jobId}` : ""}${planId ? ` (plan ${planId})` : ""}. No job transition was required.`;

      return {
        item: {
          response: responseText,
          ...(updatedJob ? { job: updatedJob } : {}),
          context: {
            ...(jobId ? { jobId } : {}),
            ...(planId ? { planId } : {})
          }
        }
      };
    }
  );
};
