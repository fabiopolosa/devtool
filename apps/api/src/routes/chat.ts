import type { FastifyPluginAsync } from "fastify";
import { apiStore } from "../services/api-store.js";
import { listContextNotes } from "../services/context-service.js";
import {
  buildCompactKnowledgeContext,
  formatCompactKnowledgeContext
} from "../services/knowledge-service.js";
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
        const tenantId = request.tenantId ?? "tenant_default";
        const incomingContext =
          request.body.context && typeof request.body.context === "object" && !Array.isArray(request.body.context)
            ? request.body.context
            : undefined;
        const projectId =
          incomingContext && typeof incomingContext.projectId === "string" && incomingContext.projectId.trim().length > 0
            ? incomingContext.projectId.trim()
            : undefined;

        let enrichedContext = incomingContext;
        if (projectId) {
          const [knowledgeEntries, contextNotes] = await Promise.all([
            buildCompactKnowledgeContext({
              tenantId,
              projectId,
              query: message,
              limit: 6
            }),
            listContextNotes({
              tenantId,
              projectId,
              limit: 6
            })
          ]);
          enrichedContext = {
            ...(incomingContext ?? {}),
            projectId,
            knowledgeEntryCount: knowledgeEntries.length,
            knowledgeSummary: formatCompactKnowledgeContext(knowledgeEntries),
            contextNoteCount: contextNotes.items.length,
            contextNotes: contextNotes.items.slice(0, 4).map((note) => ({
              path: note.path,
              title: note.title
            }))
          };
        }

        const runnerJob = await dispatchAndAwaitRunnerJob(
          {
            tenantId,
            type: "system",
            title: `Process chat message${request.body.jobId ? ` for job ${request.body.jobId}` : ""}`,
            createdBy: actor,
            payload: {
              internalAction: "chat.process_message",
              message,
              ...(request.body.jobId ? { jobId: request.body.jobId } : {}),
              ...(enrichedContext ? { context: enrichedContext } : {})
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
