import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { McpConnection } from "@cp/domain";
import { mcpService } from "../services/mcp-service.js";

interface UpsertMcpConnectionBody {
  id?: string;
  name: string;
  baseUrl: string;
  authSecretRef?: string;
  enabled?: boolean;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

interface DelegateBody {
  connectionId: string;
  operation: string;
  payload?: Record<string, unknown>;
  actor?: string;
}

export const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/mcp/status",
    {
      schema: { tags: ["mcp"], summary: "Get MCP integration status" }
    },
    async () => ({
      enabled: mcpService.isEnabled(),
      message: mcpService.isEnabled() ? "MCP configured" : "MCP non configurato"
    })
  );

  fastify.get(
    "/mcp/connections",
    {
      schema: { tags: ["mcp"], summary: "List MCP connections" }
    },
    async () => ({
      items: await mcpService.listConnections(),
      enabled: mcpService.isEnabled()
    })
  );

  fastify.post<{ Body: UpsertMcpConnectionBody }>(
    "/mcp/connections",
    {
      schema: { tags: ["mcp"], summary: "Create or update MCP connection" }
    },
    async (request, reply) => {
      const body = request.body;
      if (!body?.name?.trim() || !body?.baseUrl?.trim()) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "name and baseUrl are required"
        });
      }

      const now = new Date().toISOString();
      const connection: Omit<McpConnection, "createdAt" | "updatedAt"> = {
        id: body.id?.trim() || randomUUID(),
        name: body.name.trim(),
        baseUrl: body.baseUrl.trim(),
        ...(body.authSecretRef ? { authSecretRef: body.authSecretRef.trim() } : {}),
        enabled: body.enabled ?? false,
        status: body.enabled ? "unknown" : "disabled",
        capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
        metadata: body.metadata ?? {},
        ...(body.enabled ? {} : { lastCheckedAt: now }),
        createdBy: "mcp_api",
        updatedBy: "mcp_api"
      } as Omit<McpConnection, "createdAt" | "updatedAt">;

      const item = await mcpService.upsertConnection(connection, "mcp_api");
      return { item };
    }
  );

  fastify.post<{ Params: { connectionId: string } }>(
    "/mcp/connections/:connectionId/healthcheck",
    {
      schema: { tags: ["mcp"], summary: "Run MCP connection healthcheck" }
    },
    async (request, reply) => {
      try {
        const item = await mcpService.runHealthcheck(request.params.connectionId, "mcp_api");
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "MCP connection not found"
        });
      }
    }
  );

  fastify.get<{ Querystring: { connectionId?: string } }>(
    "/mcp/runs",
    {
      schema: { tags: ["mcp"], summary: "List MCP delegation runs" }
    },
    async (request) => ({
      items: await mcpService.listDelegationRuns(
        request.query.connectionId ? { connectionId: request.query.connectionId } : undefined
      )
    })
  );

  fastify.post<{ Body: DelegateBody }>(
    "/mcp/delegate",
    {
      schema: { tags: ["mcp"], summary: "Delegate operation to MCP connection" }
    },
    async (request, reply) => {
      const body = request.body;
      if (!body?.connectionId || !body?.operation) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "connectionId and operation are required"
        });
      }

      try {
        const item = await mcpService.delegate({
          connectionId: body.connectionId,
          operation: body.operation,
          payload: body.payload ?? {},
          actor: body.actor ?? "mcp_api"
        });
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "MCP connection not found"
        });
      }
    }
  );
};
