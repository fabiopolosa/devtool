import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import {
  dispatchAndAwaitRunnerJob,
  getRunnerJobOutput
} from "../services/job-dispatch-service.js";
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

      try {
        const actor = request.authPrincipal?.userId ?? "chat_runtime";
        const runnerJob = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Process chat message${request.body.jobId ? ` for job ${request.body.jobId}` : ""}`,
            createdBy: actor,
            payload: {
              internalAction: "chat.process_message",
              message,
              ...(request.body.jobId ? { jobId: request.body.jobId } : {}),
              ...(request.body.context ? { context: request.body.context } : {})
            },
            resourceType: "chat",
            ...(request.body.jobId ? { resourceId: request.body.jobId } : {})
          },
          { timeoutMs: 90_000 }
        );

        const output = getRunnerJobOutput<{
          action?: string;
          result?: {
            response: string;
            job?: Record<string, unknown>;
            context?: Record<string, unknown>;
          };
        }>(runnerJob);
        const result = output?.result;
        if (!result) {
          throw new Error("Runner completed chat job without result payload");
        }

        return { item: result };
      } catch (error) {
        return reply.code(400).send({
          error: "chat_runner_error",
          message: error instanceof Error ? error.message : "Unable to process chat message"
        });
      }
    }
  );
};
