import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AgentConfig } from "@cp/domain";
import { agentConfigSchema } from "@cp/domain";
import type { AgentCreateInput, AgentRuntimeInvocationOptions } from "@cp/agents";
import { agentsService, listWorkflowRuntimeDefinitions } from "../services/agents-service.js";
import {
  dispatchAndAwaitRunnerJob,
  getRunnerJobOutput
} from "../services/job-dispatch-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

const createAgentBodySchema = agentConfigSchema
  .omit({
    createdAt: true,
    updatedAt: true
  })
  .partial({ id: true });

const updateAgentBodySchema = createAgentBodySchema.omit({ id: true }).partial();

const operationBodySchema = z
  .object({
    reason: z.string().min(1).optional(),
    timeoutMs: z.number().int().positive().optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .optional();

const toCreateInput = (data: z.infer<typeof createAgentBodySchema>): AgentCreateInput => ({
  ...(data.id !== undefined ? { id: data.id } : {}),
  name: data.name,
  role: data.role,
  icon: data.icon,
  description: data.description,
  adapterType: data.adapterType,
  desiredSkills: [...data.desiredSkills],
  ...(data.reportTo !== undefined ? { reportTo: data.reportTo } : {}),
  runtimeConfig: { ...data.runtimeConfig },
  capabilities: [...data.capabilities],
  status: data.status
});

const toUpdatePatch = (data: z.infer<typeof updateAgentBodySchema>): Partial<AgentConfig> => {
  const patch: Partial<AgentConfig> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.role !== undefined) patch.role = data.role;
  if (data.icon !== undefined) patch.icon = data.icon;
  if (data.description !== undefined) patch.description = data.description;
  if (data.adapterType !== undefined) patch.adapterType = data.adapterType;
  if (data.desiredSkills !== undefined) patch.desiredSkills = [...data.desiredSkills];
  if (data.reportTo !== undefined) patch.reportTo = data.reportTo;
  if (data.runtimeConfig !== undefined) patch.runtimeConfig = { ...data.runtimeConfig };
  if (data.capabilities !== undefined) patch.capabilities = [...data.capabilities];
  if (data.status !== undefined) patch.status = data.status;
  return patch;
};

const toOperationOptions = (
  data: z.infer<typeof operationBodySchema>
): AgentRuntimeInvocationOptions | undefined => {
  if (!data) return undefined;
  const options: AgentRuntimeInvocationOptions = {};
  if (data.reason !== undefined) options.reason = data.reason;
  if (data.timeoutMs !== undefined) options.timeoutMs = data.timeoutMs;
  if (data.metadata !== undefined) options.metadata = { ...data.metadata };
  return Object.keys(options).length > 0 ? options : undefined;
};

export const agentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/agents/runtime/workflows",
    {
      schema: {
        tags: ["agents"],
        summary: "List Ruflo workflow runtime parameters loaded from configs/workflows"
      }
    },
    async () => ({ items: listWorkflowRuntimeDefinitions() })
  );

  fastify.post<{
    Params: { workflowId: string };
    Body?: {
      taskId: string;
      actor?: string;
      budget?: {
        maxRetries?: number;
        maxInputTokens?: number;
        maxOutputTokens?: number;
        maxCostUsd?: number;
      };
      autoApprove?: boolean;
    };
  }>(
    "/agents/runtime/workflows/:workflowId/run",
    {
      schema: {
        tags: ["agents"],
        summary: "Execute a Ruflo workflow via runner"
      }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const taskId = request.body?.taskId?.trim();
      if (!taskId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "taskId is required"
        });
      }

      const actor = request.body?.actor ?? request.authPrincipal?.userId ?? "ruflo_runtime";
      try {
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Ruflo workflow ${request.params.workflowId}`,
            createdBy: actor,
            payload: {
              internalAction: "ruflo.execute_workflow",
              workflowId: request.params.workflowId,
              taskId,
              actor,
              ...(request.body?.budget ? { budget: request.body.budget } : {}),
              ...(typeof request.body?.autoApprove === "boolean"
                ? { autoApprove: request.body.autoApprove }
                : {})
            },
            resourceType: "task",
            resourceId: taskId
          },
          { timeoutMs: 180_000 }
        );
        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        return { item: output?.result ?? null };
      } catch (error) {
        return reply.code(400).send({
          error: "workflow_run_failed",
          message: error instanceof Error ? error.message : "Unable to execute workflow"
        });
      }
    }
  );

  fastify.get(
    "/agents",
    { schema: { tags: ["agents"], summary: "List configured agents" } },
    async () => ({ items: await agentsService.listAgents() })
  );

  fastify.post<{ Body: z.infer<typeof createAgentBodySchema> }>(
    "/agents",
    { schema: { tags: ["agents"], summary: "Create agent config" } },
    async (request, reply) => {
      const parse = createAgentBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }
      const item = await agentsService.createAgent(toCreateInput(parse.data));
      return { item };
    }
  );

  fastify.get<{ Params: { agentId: string } }>(
    "/agents/:agentId",
    { schema: { tags: ["agents"], summary: "Get agent config by id" } },
    async (request, reply) => {
      const item = await agentsService.getAgent(request.params.agentId);
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.put<{ Params: { agentId: string }; Body: z.infer<typeof updateAgentBodySchema> }>(
    "/agents/:agentId",
    { schema: { tags: ["agents"], summary: "Update agent config" } },
    async (request, reply) => {
      const parse = updateAgentBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const item = await agentsService.updateAgent(
          request.params.agentId,
          toUpdatePatch(parse.data)
        );
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Agent not found"
        });
      }
    }
  );

  fastify.delete<{ Params: { agentId: string } }>(
    "/agents/:agentId",
    { schema: { tags: ["agents"], summary: "Delete agent config" } },
    async (request, reply) => {
      try {
        await agentsService.deleteAgent(request.params.agentId);
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Agent not found"
        });
      }
    }
  );

  fastify.post<{ Params: { agentId: string }; Body?: z.infer<typeof operationBodySchema> }>(
    "/agents/:agentId/heartbeat",
    { schema: { tags: ["agents"], summary: "Schedule heartbeat run for an agent" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const parse = operationBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const actor = request.authPrincipal?.userId ?? "agent_runtime";
        const options = toOperationOptions(parse.data);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Agent heartbeat ${request.params.agentId}`,
            createdBy: actor,
            payload: {
              internalAction: "agent.runtime.heartbeat",
              agentId: request.params.agentId,
              ...(options?.reason ? { reason: options.reason } : {}),
              ...(typeof options?.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
              ...(options?.metadata ? { metadata: options.metadata } : {})
            },
            resourceType: "agent",
            resourceId: request.params.agentId
          },
          { timeoutMs: 90_000 }
        );
        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        return { item: output?.result ?? null };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Agent not found"
        });
      }
    }
  );

  fastify.post<{ Params: { agentId: string }; Body?: z.infer<typeof operationBodySchema> }>(
    "/agents/:agentId/diagnose",
    { schema: { tags: ["agents"], summary: "Schedule diagnostic run for an agent" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const parse = operationBodySchema.safeParse(request.body);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const actor = request.authPrincipal?.userId ?? "agent_runtime";
        const options = toOperationOptions(parse.data);
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Agent diagnose ${request.params.agentId}`,
            createdBy: actor,
            payload: {
              internalAction: "agent.runtime.diagnose",
              agentId: request.params.agentId,
              ...(options?.reason ? { reason: options.reason } : {}),
              ...(typeof options?.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
              ...(options?.metadata ? { metadata: options.metadata } : {})
            },
            resourceType: "agent",
            resourceId: request.params.agentId
          },
          { timeoutMs: 90_000 }
        );
        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        return { item: output?.result ?? null };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Agent not found"
        });
      }
    }
  );

  fastify.get<{ Params: { agentId: string; jobId: string } }>(
    "/agents/:agentId/jobs/:jobId",
    { schema: { tags: ["agents"], summary: "Inspect queued/running/completed runtime job" } },
    async (request, reply) => {
      const agent = await agentsService.getAgent(request.params.agentId);
      if (!agent) {
        return reply.code(404).send({ error: "not_found", message: "Agent not found" });
      }

      const item = await agentsService.getRuntimeJob(request.params.jobId);
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.get<{ Params: { agentId: string; jobId: string }; Querystring: { snapshot?: string } }>(
    "/agents/:agentId/jobs/:jobId/events",
    {
      schema: {
        tags: ["agents"],
        summary: "Stream runtime job logs as SSE"
      }
    },
    async (request, reply) => {
      const agent = await agentsService.getAgent(request.params.agentId);
      if (!agent) {
        return reply.code(404).send({ error: "not_found", message: "Agent not found" });
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

      let lastLogCount = 0;
      let stopped = false;
      const terminalStates = new Set(["completed", "failed"]);
      let pollCount = 0;
      const maxPolls = 5;

      const flushSnapshot = async () => {
        const snapshot = await agentsService.getRuntimeJob(request.params.jobId);
        if (!snapshot) {
          reply.raw.write(`event: missing\ndata: ${JSON.stringify({ jobId: request.params.jobId })}\n\n`);
          stopped = true;
          return;
        }

        const newLogs = snapshot.logs.slice(lastLogCount);
        for (const logLine of newLogs) {
          reply.raw.write(`event: log\ndata: ${JSON.stringify({ message: logLine })}\n\n`);
        }
        lastLogCount = snapshot.logs.length;
        reply.raw.write(
          `event: state\ndata: ${JSON.stringify({ state: snapshot.state, progress: snapshot.progress })}\n\n`
        );

        if (terminalStates.has(snapshot.state)) {
          stopped = true;
        }
      };

      await flushSnapshot();
      const snapshotMode = request.query.snapshot === "1";
      if (snapshotMode) {
        stopped = true;
      }
      if (stopped) {
        reply.raw.write(
          `event: complete\ndata: ${JSON.stringify({ jobId: request.params.jobId, state: "snapshot" })}\n\n`
        );
        reply.raw.end();
        return reply;
      }

      const interval = setInterval(async () => {
        try {
          pollCount += 1;
          await flushSnapshot();
          if (pollCount >= maxPolls) {
            stopped = true;
          }
          if (stopped) {
            clearInterval(interval);
            reply.raw.write(
              `event: complete\ndata: ${JSON.stringify({ jobId: request.params.jobId, state: "snapshot" })}\n\n`
            );
            reply.raw.end();
          }
        } catch {
          clearInterval(interval);
          reply.raw.end();
        }
      }, 1000);

      request.raw.on("close", () => {
        clearInterval(interval);
      });

      return reply;
    }
  );
};
