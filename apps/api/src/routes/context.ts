import type { FastifyPluginAsync } from "fastify";
import {
  createContextNote,
  deleteContextNote,
  getContextNote,
  listContextNotes,
  updateContextNote
} from "../services/context-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface ContextListQuery {
  projectId?: string;
  q?: string;
  query?: string;
  path?: string;
  limit?: string;
}

interface ContextCreateBody {
  projectId: string;
  path: string;
  title: string;
  content: string;
  tags?: string[];
  linkRefs?: string[];
  pinned?: boolean;
}

interface ContextUpdateBody {
  path?: string;
  title?: string;
  content?: string;
  tags?: string[];
  linkRefs?: string[];
  pinned?: boolean;
}

export const contextRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ContextListQuery }>(
    "/context",
    {
      schema: { tags: ["context"], summary: "List or search project context notes" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const projectId = request.query.projectId?.trim();
      if (!projectId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "projectId is required"
        });
      }

      const parsedLimit = request.query.limit ? Number.parseInt(request.query.limit, 10) : undefined;
      const result = await listContextNotes({
        tenantId: request.tenantId ?? "tenant_default",
        projectId,
        ...(request.query.path ? { path: request.query.path } : {}),
        ...(request.query.q?.trim() ? { query: request.query.q.trim() } : request.query.query?.trim() ? { query: request.query.query.trim() } : {}),
        ...(typeof parsedLimit === "number" && Number.isFinite(parsedLimit) ? { limit: parsedLimit } : {})
      });

      return {
        items: result.items,
        ...(result.hits ? { hits: result.hits } : {})
      };
    }
  );

  fastify.get<{ Params: { contextNoteId: string }; Querystring: { projectId?: string } }>(
    "/context/:contextNoteId",
    {
      schema: { tags: ["context"], summary: "Get a project context note by id" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const projectId = request.query.projectId?.trim();
      if (!projectId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "projectId is required"
        });
      }
      const item = await getContextNote(request.params.contextNoteId, request.tenantId ?? "tenant_default", projectId);
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.post<{ Body: ContextCreateBody }>(
    "/context",
    {
      schema: { tags: ["context"], summary: "Create a project context note" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      try {
        const item = await createContextNote(
          {
            ...(request.body ?? {}),
            tenantId: request.tenantId ?? "tenant_default"
          },
          request.authPrincipal?.userId ?? "system",
          request.tenantId ?? "tenant_default"
        );
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to create context note"
        });
      }
    }
  );

  fastify.patch<{ Params: { contextNoteId: string }; Body: ContextUpdateBody; Querystring: { projectId?: string } }>(
    "/context/:contextNoteId",
    {
      schema: { tags: ["context"], summary: "Update a project context note" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const projectId = request.query.projectId?.trim();
      if (!projectId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "projectId is required"
        });
      }
      try {
        const item = await updateContextNote(
          request.params.contextNoteId,
          request.body ?? {},
          request.authPrincipal?.userId ?? "system",
          request.tenantId ?? "tenant_default",
          projectId
        );
        return { item };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update context note";
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        return reply.code(400).send({ error: "invalid_request", message });
      }
    }
  );

  fastify.delete<{ Params: { contextNoteId: string }; Querystring: { projectId?: string } }>(
    "/context/:contextNoteId",
    {
      schema: { tags: ["context"], summary: "Delete a project context note" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const projectId = request.query.projectId?.trim();
      if (!projectId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "projectId is required"
        });
      }
      try {
        await deleteContextNote(request.params.contextNoteId, request.tenantId ?? "tenant_default", projectId);
        return { ok: true as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to delete context note";
        if (message.includes("not found")) {
          return reply.code(404).send({ error: "not_found", message });
        }
        return reply.code(400).send({ error: "invalid_request", message });
      }
    }
  );
};
