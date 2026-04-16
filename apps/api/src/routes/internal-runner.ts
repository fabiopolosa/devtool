import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { executeInternalRunnerAction } from "../services/internal-runner-action-service.js";

interface RunnerExecuteBody {
  action: string;
  payload?: Record<string, unknown>;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const allowRunnerExecution = (request: FastifyRequest, reply: FastifyReply): boolean => {
  const expected = process.env.RUNNER_INTERNAL_TOKEN?.trim();
  if (!expected) return true;
  const providedHeader = request.headers["x-runner-token"];
  const provided = Array.isArray(providedHeader) ? providedHeader[0] : providedHeader;
  if (provided === expected) return true;
  reply.code(403).send({
    error: "forbidden",
    message: "Invalid runner token"
  });
  return false;
};

export const internalRunnerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: RunnerExecuteBody }>(
    "/internal/runner/execute",
    {
      schema: { tags: ["internal"], summary: "Runner-only execution endpoint" }
    },
    async (request, reply) => {
      if (!allowRunnerExecution(request, reply)) return;

      const action = request.body?.action?.trim();
      const payload = asRecord(request.body?.payload) ?? {};
      if (!action) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "action is required"
        });
      }

      try {
        const item = await executeInternalRunnerAction({
          action,
          payload
        });
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "runner_execution_failed",
          message: error instanceof Error ? error.message : "Internal runner execution failed"
        });
      }
    }
  );
};
