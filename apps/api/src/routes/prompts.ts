import type { FastifyPluginAsync } from "fastify";
import {
  promptRegistryService,
  type PromptRegistryCreateInput,
  type PromptRegistryUpdateInput
} from "../services/prompt-registry-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface PromptListQuery {
  projectId?: string;
  scope?: "system" | "tenant" | "project";
  type?: string;
  target?: string;
  status?: "active" | "draft" | "deprecated";
}

export const promptsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: PromptListQuery }>(
    "/prompts",
    {
      schema: { tags: ["prompts"], summary: "List prompt registry entries" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const items = await promptRegistryService.listPrompts({
        tenantId: request.tenantId ?? "tenant_default",
        ...(request.query.projectId ? { projectId: request.query.projectId } : {}),
        ...(request.query.scope ? { scope: request.query.scope } : {}),
        ...(request.query.type ? { type: request.query.type } : {}),
        ...(request.query.target ? { target: request.query.target } : {}),
        ...(request.query.status ? { status: request.query.status } : {})
      });
      return { items };
    }
  );

  fastify.get<{ Params: { promptId: string }; Querystring: { projectId?: string } }>(
    "/prompts/:promptId",
    {
      schema: { tags: ["prompts"], summary: "Get prompt registry entry by id" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const item = await promptRegistryService.getPrompt(
        request.params.promptId,
        request.tenantId ?? "tenant_default",
        request.query.projectId
      );
      if (!item) {
        return reply.code(404).send({ item: null });
      }
      return { item };
    }
  );

  fastify.post<{ Body: PromptRegistryCreateInput }>(
    "/prompts",
    {
      schema: { tags: ["prompts"], summary: "Create prompt registry entry" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canManageUsers")) return;
      try {
        const item = await promptRegistryService.createPrompt(
          {
            ...request.body,
            ...(request.body.scope === "system"
              ? {}
              : {
                  tenantId: request.tenantId ?? "tenant_default"
                })
          },
          request.authPrincipal?.userId ?? "system"
        );
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to create prompt registry entry"
        });
      }
    }
  );

  fastify.patch<{ Params: { promptId: string }; Body: PromptRegistryUpdateInput }>(
    "/prompts/:promptId",
    {
      schema: { tags: ["prompts"], summary: "Update prompt registry entry" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canManageUsers")) return;
      try {
        const item = await promptRegistryService.updatePrompt(
          request.params.promptId,
          {
            ...request.body,
            ...(request.body.scope && request.body.scope !== "system"
              ? {
                  tenantId: request.tenantId ?? "tenant_default"
                }
              : {})
          },
          request.authPrincipal?.userId ?? "system"
        );
        return { item };
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Unable to update prompt registry entry"
        });
      }
    }
  );

  fastify.post<{ Params: { promptId: string } }>(
    "/prompts/:promptId/activate",
    {
      schema: { tags: ["prompts"], summary: "Activate a prompt registry entry and deprecate siblings" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canManageUsers")) return;
      try {
        const item = await promptRegistryService.activatePrompt(
          request.params.promptId,
          request.authPrincipal?.userId ?? "system"
        );
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Prompt registry entry not found"
        });
      }
    }
  );

  fastify.post<{ Params: { promptId: string } }>(
    "/prompts/:promptId/deprecate",
    {
      schema: { tags: ["prompts"], summary: "Deprecate a prompt registry entry" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canManageUsers")) return;
      try {
        const item = await promptRegistryService.deprecatePrompt(
          request.params.promptId,
          request.authPrincipal?.userId ?? "system"
        );
        return { item };
      } catch (error) {
        return reply.code(404).send({
          error: "not_found",
          message: error instanceof Error ? error.message : "Prompt registry entry not found"
        });
      }
    }
  );
};
