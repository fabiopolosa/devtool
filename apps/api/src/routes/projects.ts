import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ProjectStatus } from "@cp/domain";
import { apiStore } from "../services/api-store.js";
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

      const now = new Date().toISOString();
      const actor = request.body?.actor?.trim() || request.authPrincipal?.userId || "project_service";
      const item = await apiStore.createProject({
        id: randomUUID(),
        tenantId,
        key,
        name,
        ...(request.body?.description?.trim() ? { description: request.body.description.trim() } : {}),
        status: request.body?.status === "paused" || request.body?.status === "archived" ? request.body.status : "active",
        ...(request.body?.policySetId?.trim() ? { policySetId: request.body.policySetId.trim() } : {}),
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor
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
};
