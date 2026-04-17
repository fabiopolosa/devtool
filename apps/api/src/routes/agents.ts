import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { AgentConfig } from "@cp/domain";
import { agentConfigSchema } from "@cp/domain";
import { AgentRuntimeSchedulerUnavailableError } from "@cp/agents";
import type { AgentCreateInput, AgentRuntimeInvocationOptions } from "@cp/agents";
import { resolveSkillTenantId } from "@cp/skills";
import { agentsService, listWorkflowRuntimeDefinitions } from "../services/agents-service.js";
import {
  dispatchAndAwaitRunnerJob,
  getRunnerJobOutput
} from "../services/job-dispatch-service.js";
import { listContextNotes } from "../services/context-service.js";
import { skillsService } from "../services/skills-service.js";
import {
  buildCompactKnowledgeContext,
  formatCompactKnowledgeContext
} from "../services/knowledge-service.js";
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
    metadata: z.record(z.unknown()).optional(),
    projectId: z.string().min(1).optional()
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

const isSchedulerUnavailableMessage = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("REDIS_URL");

const buildAgentRuntimeContextMetadata = async (input: {
  tenantId: string;
  projectId?: string;
  query: string;
}): Promise<Record<string, unknown> | undefined> => {
  if (!input.projectId) return undefined;

  const [knowledgeEntries, notes] = await Promise.all([
    buildCompactKnowledgeContext({
      tenantId: input.tenantId,
      projectId: input.projectId,
      query: input.query,
      limit: 6
    }),
    listContextNotes({
      tenantId: input.tenantId,
      projectId: input.projectId,
      limit: 6
    })
  ]);

  return {
    projectId: input.projectId,
    knowledgeSummary: formatCompactKnowledgeContext(knowledgeEntries),
    knowledgeEntryCount: knowledgeEntries.length,
    contextNoteCount: notes.items.length,
    contextNotes: notes.items.slice(0, 4).map((note) => ({ path: note.path, title: note.title }))
  };
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
        if (isSchedulerUnavailableMessage(error)) {
          return reply.code(503).send({
            error: "scheduler_unavailable",
            message: error instanceof Error ? error.message : "Agent runtime scheduler unavailable"
          });
        }
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
        if (isSchedulerUnavailableMessage(error)) {
          return reply.code(503).send({
            error: "scheduler_unavailable",
            message: error instanceof Error ? error.message : "Agent runtime scheduler unavailable"
          });
        }
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
        const tenantId = request.tenantId ?? "tenant_default";
        const projectId = parse.data?.projectId?.trim();
        let options = toOperationOptions(parse.data);
        const contextMetadata = await buildAgentRuntimeContextMetadata({
          tenantId,
          ...(projectId ? { projectId } : {}),
          query: options?.reason ?? `agent heartbeat for ${request.params.agentId}`
        });
        if (contextMetadata) {
          options = {
            ...(options ?? {}),
            metadata: {
              ...(options?.metadata ?? {}),
              ...contextMetadata
            }
          };
        }
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId,
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
        const tenantId = request.tenantId ?? "tenant_default";
        const projectId = parse.data?.projectId?.trim();
        let options = toOperationOptions(parse.data);
        const contextMetadata = await buildAgentRuntimeContextMetadata({
          tenantId,
          ...(projectId ? { projectId } : {}),
          query: options?.reason ?? `agent diagnose for ${request.params.agentId}`
        });
        if (contextMetadata) {
          options = {
            ...(options ?? {}),
            metadata: {
              ...(options?.metadata ?? {}),
              ...contextMetadata
            }
          };
        }
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId,
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

  fastify.post<{
    Params: { agentId: string; skillId: string };
    Body?: {
      mode?: "remote" | "local" | "hybrid";
      command?: string;
      args?: string[];
      input?: Record<string, unknown>;
      confirm?: boolean;
    };
  }>(
    "/agents/:agentId/skills/:skillId/execute",
    {
      schema: {
        tags: ["agents"],
        summary: "Execute an assigned skill for an agent via runner"
      }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const agent = await agentsService.getAgent(request.params.agentId);
      if (!agent) {
        return reply.code(404).send({ error: "not_found", message: "Agent not found" });
      }

      const skill = await skillsService.getSkill(request.params.skillId);
      if (!skill) {
        return reply.code(404).send({ error: "not_found", message: "Skill not found" });
      }
      const tenantId = request.tenantId ?? "tenant_default";
      const skillTenantId = resolveSkillTenantId(skill);
      if (skillTenantId && skillTenantId !== tenantId) {
        return reply.code(404).send({ error: "not_found", message: "Skill not found" });
      }
      const actor = request.authPrincipal?.userId ?? "agent_runtime";
      if (!skillsService.canActorAccessSkill(skill, actor, tenantId)) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Skill scope policy denies access for this actor"
        });
      }

      const assigned = agent.desiredSkills.includes(skill.id) || agent.desiredSkills.includes(skill.name);
      if (!assigned) {
        return reply.code(400).send({
          error: "skill_not_assigned",
          message: `Skill '${skill.name}' is not assigned to agent '${agent.name}'`
        });
      }

      const mode =
        request.body?.mode === "local" || request.body?.mode === "remote" || request.body?.mode === "hybrid"
          ? request.body.mode
          : undefined;
      const projectId =
        request.body?.input && typeof request.body.input["projectId"] === "string"
          ? (request.body.input["projectId"] as string)
          : undefined;

      try {
        const job = await dispatchAndAwaitRunnerJob(
          {
            tenantId: request.tenantId ?? "tenant_default",
            type: "system",
            title: `Agent ${agent.name} execute skill ${skill.name}`,
            createdBy: actor,
            payload: {
              internalAction: "skill.execute",
              skillId: skill.id,
              actor,
              tenantId: request.tenantId ?? "tenant_default",
              ...(projectId ? { projectId } : {}),
              ...(typeof request.body?.command === "string" && request.body.command.trim().length > 0
                ? { command: request.body.command.trim() }
                : {}),
              ...(Array.isArray(request.body?.args)
                ? {
                    args: request.body.args.filter(
                      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
                    )
                  }
                : {}),
              ...(request.body?.input && typeof request.body.input === "object" && !Array.isArray(request.body.input)
                ? { input: request.body.input }
                : {}),
              ...(typeof request.body?.confirm === "boolean" ? { confirm: request.body.confirm } : {}),
              ...(mode ? { execution: { mode } } : {})
            },
            resourceType: "agent",
            resourceId: agent.id,
            ...(projectId ? { projectId } : {})
          },
          { timeoutMs: 120_000 }
        );
        const output = getRunnerJobOutput<{ result?: unknown }>(job);
        return {
          jobId: job.id,
          status: job.status,
          item: output?.result ?? output ?? null
        };
      } catch (error) {
        return reply.code(400).send({
          error: "skill_execute_failed",
          message: error instanceof Error ? error.message : "Unable to execute skill"
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

      let item: Awaited<ReturnType<typeof agentsService.getRuntimeJob>> | null;
      try {
        item = await agentsService.getRuntimeJob(request.params.jobId);
      } catch (error) {
        if (error instanceof AgentRuntimeSchedulerUnavailableError) {
          return reply.code(503).send({
            error: "scheduler_unavailable",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "runtime_snapshot_failed",
          message: error instanceof Error ? error.message : "Unable to load runtime job snapshot"
        });
      }
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

      try {
        await flushSnapshot();
      } catch (error) {
        if (error instanceof AgentRuntimeSchedulerUnavailableError) {
          return reply.code(503).send({
            error: "scheduler_unavailable",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "runtime_snapshot_failed",
          message: error instanceof Error ? error.message : "Unable to stream runtime job logs"
        });
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

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
        } catch (error) {
          clearInterval(interval);
          reply.raw.write(
            `event: error\ndata: ${JSON.stringify({
              jobId: request.params.jobId,
              message:
                error instanceof Error ? error.message : "Unable to stream runtime job logs"
            })}\n\n`
          );
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
