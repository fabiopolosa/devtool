import type { FastifyPluginAsync } from "fastify";
import {
  buildKnowledgeContext,
  createKnowledgeNode,
  deleteKnowledgeNode,
  getKnowledgeNode,
  type ListKnowledgeInput,
  listKnowledge,
  syncKnowledgeFromFilesystem,
  updateKnowledgeNode
} from "../services/knowledge-service.js";
import {
  createKnowledgeConfig,
  listKnowledgeConfigs,
  patchKnowledgeConfig,
  resolveEffectiveKnowledgeConfig
} from "../services/knowledge-config-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface KnowledgeListQuery {
  projectId?: string;
  scope?: string;
  path?: string;
  query?: string;
  limit?: string;
  threshold?: string;
}

interface KnowledgeCreateBody {
  tenantId?: string;
  projectId?: string;
  scope: "system" | "tenant" | "project";
  path: string;
  content: string;
}

interface KnowledgeUpdateBody {
  path?: string;
  content?: string;
}

interface KnowledgeConfigQuery {
  projectId?: string;
  scope?: "system" | "tenant" | "project";
}

export const knowledgeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: KnowledgeConfigQuery }>(
    "/knowledge/config",
    {
      schema: { tags: ["knowledge"], summary: "Resolve effective knowledge configuration for tenant/project scope" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const tenantId = request.tenantId ?? "tenant_default";
      const [items, effective] = await Promise.all([
        listKnowledgeConfigs(tenantId, request.query.projectId),
        resolveEffectiveKnowledgeConfig({
          tenantId,
          ...(request.query.projectId ? { projectId: request.query.projectId } : {}),
          ...(request.query.scope ? { scope: request.query.scope } : {})
        })
      ]);

      return {
        item: effective.item,
        source: effective.source,
        items
      };
    }
  );

  fastify.post<{ Body: unknown }>(
    "/knowledge/config",
    {
      schema: { tags: ["knowledge"], summary: "Create a scoped knowledge configuration record" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canManageUsers")) return;
      try {
        const item = await createKnowledgeConfig(
          request.body,
          request.authPrincipal?.userId ?? "system",
          request.tenantId ?? "tenant_default"
        );
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to create knowledge config"
        });
      }
    }
  );

  fastify.patch<{ Body: unknown; Querystring: { projectId?: string } }>(
    "/knowledge/config",
    {
      schema: { tags: ["knowledge"], summary: "Patch scoped knowledge configuration (creates scoped default when absent)" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canManageUsers")) return;
      try {
        const result = await patchKnowledgeConfig({
          raw: request.body,
          actor: request.authPrincipal?.userId ?? "system",
          tenantId: request.tenantId ?? "tenant_default",
          ...(request.query.projectId ? { projectId: request.query.projectId } : {})
        });
        return result;
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to patch knowledge config"
        });
      }
    }
  );

  fastify.get<{ Querystring: KnowledgeListQuery }>(
    "/knowledge",
    {
      schema: { tags: ["knowledge"], summary: "List or search knowledge nodes" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;

      const parsedLimitRaw = request.query.limit ? Number.parseInt(request.query.limit, 10) : null;
      const parsedLimit = typeof parsedLimitRaw === "number" && Number.isFinite(parsedLimitRaw)
        ? parsedLimitRaw
        : null;
      const input: ListKnowledgeInput = {
        tenantId: request.tenantId ?? "tenant_default"
      };
      if (request.query.projectId) {
        input.projectId = request.query.projectId;
      }
      if (request.query.scope) {
        input.scope = request.query.scope;
      }
      if (request.query.path) {
        input.path = request.query.path;
      }
      if (request.query.query) {
        input.query = request.query.query;
      }
      if (typeof parsedLimit === "number") {
        input.limit = parsedLimit;
      }
      const result = await listKnowledge(input);

      return {
        items: result.items,
        ...(result.hits ? { hits: result.hits } : {})
      };
    }
  );

  fastify.get<{ Params: { knowledgeNodeId: string }; Querystring: { projectId?: string } }>(
    "/knowledge/:knowledgeNodeId",
    {
      schema: { tags: ["knowledge"], summary: "Get knowledge node by id" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const item = await getKnowledgeNode(
        request.params.knowledgeNodeId,
        request.tenantId ?? "tenant_default",
        request.query.projectId
      );
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.post<{ Body: KnowledgeCreateBody }>(
    "/knowledge",
    {
      schema: { tags: ["knowledge"], summary: "Create knowledge node" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const item = await createKnowledgeNode(
          request.body,
          request.authPrincipal?.userId ?? "system",
          request.tenantId ?? "tenant_default"
        );
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to create knowledge node"
        });
      }
    }
  );

  fastify.patch<{ Params: { knowledgeNodeId: string }; Body: KnowledgeUpdateBody; Querystring: { projectId?: string } }>(
    "/knowledge/:knowledgeNodeId",
    {
      schema: { tags: ["knowledge"], summary: "Update knowledge node" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const item = await updateKnowledgeNode(
          request.params.knowledgeNodeId,
          request.body ?? {},
          request.authPrincipal?.userId ?? "system",
          request.tenantId ?? "tenant_default",
          request.query.projectId
        );
        return { item };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update knowledge node";
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        return reply.code(400).send({
          error: "invalid_request",
          message
        });
      }
    }
  );

  fastify.delete<{ Params: { knowledgeNodeId: string }; Querystring: { projectId?: string } }>(
    "/knowledge/:knowledgeNodeId",
    {
      schema: { tags: ["knowledge"], summary: "Delete knowledge node" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        await deleteKnowledgeNode(
          request.params.knowledgeNodeId,
          request.tenantId ?? "tenant_default",
          request.query.projectId
        );
        return { ok: true as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to delete knowledge node";
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        return reply.code(400).send({ error: "invalid_request", message });
      }
    }
  );

  fastify.post<{ Body: { actor?: string } }>(
    "/knowledge/sync",
    {
      schema: { tags: ["knowledge"], summary: "Sync markdown knowledge tree from filesystem into DB" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const item = await syncKnowledgeFromFilesystem(request.body?.actor ?? request.authPrincipal?.userId ?? "system");
      return { item };
    }
  );

  fastify.get<{ Querystring: { projectId?: string; query: string; limit?: string; threshold?: string } }>(
    "/knowledge/context/search",
    {
      schema: { tags: ["knowledge"], summary: "Search compact knowledge context for generation flows" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const query = request.query.query?.trim();
      if (!query) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "query is required"
        });
      }
      const parsedLimitRaw = request.query.limit ? Number.parseInt(request.query.limit, 10) : null;
      const parsedLimit = typeof parsedLimitRaw === "number" && Number.isFinite(parsedLimitRaw)
        ? parsedLimitRaw
        : null;
      const parsedThresholdRaw = request.query.threshold
        ? Number.parseFloat(request.query.threshold)
        : null;
      const parsedThreshold = typeof parsedThresholdRaw === "number" && Number.isFinite(parsedThresholdRaw)
        ? parsedThresholdRaw
        : null;
      const effectiveConfig = await resolveEffectiveKnowledgeConfig({
        tenantId: request.tenantId ?? "tenant_default",
        ...(request.query.projectId ? { projectId: request.query.projectId } : {})
      });
      const input: {
        tenantId: string;
        projectId?: string;
        query: string;
        limit?: number;
        threshold?: number;
      } = {
        tenantId: request.tenantId ?? "tenant_default",
        query
      };
      if (request.query.projectId) {
        input.projectId = request.query.projectId;
      }
      if (typeof parsedLimit === "number") {
        input.limit = parsedLimit;
      } else {
        input.limit = effectiveConfig.item.maxNodes;
      }
      if (typeof parsedThreshold === "number") {
        input.threshold = parsedThreshold;
      } else {
        input.threshold = effectiveConfig.item.relevanceThreshold;
      }
      const item = await buildKnowledgeContext(input);
      return { item };
    }
  );
};
