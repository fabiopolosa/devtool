import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ProjectStatus } from "@cp/domain";
import { apiStore } from "../services/api-store.js";
import { createProjectWithCoordinator } from "../services/project-bootstrap-service.js";
import {
  dispatchProjectAppTargetAction,
  getProjectAppTargets,
  getProjectLocalHost,
  ProjectRuntimeError,
  updateProjectAppTargets
} from "../services/project-runtime-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

interface CreateProjectBody {
  name: string;
  key?: string;
  description?: string;
  status?: ProjectStatus;
  policySetId?: string;
  actor?: string;
}

const normalizeProjectKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const projectAppTargetSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  runCommand: z.string().min(1).optional(),
  testCommand: z.string().min(1).optional(),
  devCommand: z.string().min(1).optional(),
  previewCommand: z.string().min(1).optional(),
  defaultPort: z.number().int().positive().max(65535).optional(),
  previewType: z.enum(["port", "url"]).optional(),
  previewUrl: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional()
});

const projectAppTargetsUpdateSchema = z.object({
  items: z.array(projectAppTargetSchema)
});

const projectAppTargetActionSchema = z.object({
  action: z.enum(["run", "test", "dev", "preview"]),
  executionMode: z.enum(["local", "remote", "hybrid"]).optional(),
  reason: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/projects",
    {
      schema: { tags: ["projects"], summary: "List projects" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const tenantId = request.tenantId ?? "tenant_default";
      const items = (await apiStore.listProjects()).filter((project) => project.tenantId === tenantId);
      return { items };
    }
  );

  fastify.post<{ Body: CreateProjectBody }>(
    "/projects",
    {
      schema: { tags: ["projects"], summary: "Create a project" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;

      const name = request.body?.name?.trim();
      if (!name) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "name is required"
        });
      }

      const keyInput = request.body?.key?.trim() || name;
      const key = normalizeProjectKey(keyInput);
      if (!key) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "Unable to derive project key from name/key input"
        });
      }

      const tenantId = request.tenantId ?? "tenant_default";
      const existing = (await apiStore.listProjects()).filter((project) => project.tenantId === tenantId);
      if (existing.some((project) => project.key === key)) {
        return reply.code(409).send({
          error: "conflict",
          message: `Project key already exists: ${key}`
        });
      }

      const actor = request.body?.actor?.trim() || request.authPrincipal?.userId || "project_service";
      const { project: item } = await createProjectWithCoordinator({
        tenantId,
        key,
        name,
        ...(request.body?.description?.trim() ? { description: request.body.description.trim() } : {}),
        ...(request.body?.status ? { status: request.body.status } : {}),
        ...(request.body?.policySetId?.trim() ? { policySetId: request.body.policySetId.trim() } : {}),
        actor
      });

      return reply.code(201).send({ item });
    }
  );

  fastify.get<{ Params: { projectId: string } }>("/projects/:projectId", {
    schema: { tags: ["projects"], summary: "Get a project" }
  }, async (request, reply) => {
    if (!requireTenantPermission(request, reply, "canView")) return;
    const item = await apiStore.getProject(request.params.projectId);
    if (!item || item.tenantId !== (request.tenantId ?? "tenant_default")) {
      return reply.code(404).send({ item: null });
    }
    return { item };
  });

  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/local-host",
    { schema: { tags: ["projects"], summary: "Get the project local companion host" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      try {
        const item = await getProjectLocalHost({
          tenantId: request.tenantId ?? "tenant_default",
          projectId: request.params.projectId
        });
        return { item };
      } catch (error) {
        if (error instanceof ProjectRuntimeError) {
          return reply.code(404).send({
            error: "not_found",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "project_local_host_failed",
          message: error instanceof Error ? error.message : "Unable to load project local host"
        });
      }
    }
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/app-targets",
    { schema: { tags: ["projects"], summary: "List project app targets" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      try {
        const { items } = await getProjectAppTargets({
          tenantId: request.tenantId ?? "tenant_default",
          projectId: request.params.projectId
        });
        return { items };
      } catch (error) {
        if (error instanceof ProjectRuntimeError) {
          return reply.code(404).send({
            error: "not_found",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "project_app_targets_failed",
          message: error instanceof Error ? error.message : "Unable to load project app targets"
        });
      }
    }
  );

  fastify.put<{ Params: { projectId: string }; Body: unknown }>(
    "/projects/:projectId/app-targets",
    { schema: { tags: ["projects"], summary: "Update project app targets" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const parse = projectAppTargetsUpdateSchema.safeParse(request.body ?? {});
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const { items } = await updateProjectAppTargets({
          tenantId: request.tenantId ?? "tenant_default",
          projectId: request.params.projectId,
          targets: parse.data.items
        });
        return { items };
      } catch (error) {
        if (error instanceof ProjectRuntimeError) {
          return reply.code(404).send({
            error: "not_found",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "project_app_targets_update_failed",
          message: error instanceof Error ? error.message : "Unable to update project app targets"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string; targetId: string }; Body: unknown }>(
    "/projects/:projectId/app-targets/:targetId/actions",
    { schema: { tags: ["projects"], summary: "Run an action on a project app target" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const parse = projectAppTargetActionSchema.safeParse(request.body ?? {});
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const item = await dispatchProjectAppTargetAction({
          tenantId: request.tenantId ?? "tenant_default",
          projectId: request.params.projectId,
          targetId: request.params.targetId,
          action: parse.data.action,
          actor: request.authPrincipal?.userId ?? "project_runtime",
          ...(parse.data.executionMode ? { executionMode: parse.data.executionMode } : {}),
          ...(parse.data.reason ? { reason: parse.data.reason } : {}),
          ...(parse.data.metadata ? { metadata: parse.data.metadata } : {})
        });
        return { item };
      } catch (error) {
        if (error instanceof ProjectRuntimeError) {
          return reply.code(404).send({
            error: "not_found",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "project_app_target_action_failed",
          message: error instanceof Error ? error.message : "Unable to run app target action"
        });
      }
    }
  );
};
