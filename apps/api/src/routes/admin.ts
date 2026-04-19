import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { AuditEvent, Project, Task } from "@cp/domain";
import { requirePermission, requireRole, requireScopedPermission } from "../auth/runtime.js";
import { auditLogService } from "../services/audit-log-service.js";
import { apiStore } from "../services/api-store.js";
import { createProjectWithCoordinator } from "../services/project-bootstrap-service.js";

interface CreateRoleBody {
  name: "admin" | "editor" | "operator" | "viewer";
  description: string;
  permissions: string[];
  isSystem?: boolean;
}

interface UpdateRolePermissionsBody {
  permissions: string[];
}

interface AuditEventsQuery {
  userId?: string;
  action?: string;
  status?: AuditEvent["status"];
  resourceType?: string;
  from?: string;
  to?: string;
  groupBy?: "action" | "resourceType" | "status" | "userId";
  format?: "json" | "csv";
}

interface CreateProjectBody {
  key: string;
  name: string;
  description?: string;
  status?: Project["status"];
  policySetId?: string;
}

interface UpdateProjectBody {
  name?: string;
  description?: string;
  status?: Project["status"];
  policySetId?: string;
}

interface CreateTaskBody {
  projectId: string;
  roadmapItemId?: string;
  title: string;
  type?: Task["type"];
  goal: string;
  targetRepositoryIds?: string[];
  scopeInclude?: string[];
  scopeExclude?: string[];
  constraints?: string[];
  successCriteria?: string[];
  verificationPlan?: string[];
  dependencyTaskIds?: string[];
  riskNotes?: string[];
  approvalsRequired?: boolean;
}

interface UpdateTaskBody {
  title?: string;
  state?: Task["state"];
  goal?: string;
  scopeInclude?: string[];
  scopeExclude?: string[];
  constraints?: string[];
  targetRepositoryIds?: string[];
  successCriteria?: string[];
  verificationPlan?: string[];
  dependencyTaskIds?: string[];
  riskNotes?: string[];
  approvalsRequired?: boolean;
}

interface CreateProjectRoleBindingBody {
  userId: string;
  projectId: string;
  roleName: "admin" | "editor" | "operator" | "viewer";
  expiresAt?: string;
}

interface CreateRepositoryRoleBindingBody {
  userId: string;
  repositoryId: string;
  roleName: "admin" | "editor" | "operator" | "viewer";
  expiresAt?: string;
}

interface CreateDelegatedPermissionBody {
  granteeUserId: string;
  permission: string;
  scopeType: "global" | "project" | "repository";
  scopeId?: string;
  expiresAt: string;
}

const toCsv = (events: AuditEvent[]): string => {
  const headers = [
    "id",
    "occurredAt",
    "userId",
    "action",
    "resourceType",
    "resourceId",
    "status",
    "metadata"
  ];

  const escape = (value: string): string => {
    const normalized = value.replaceAll("\"", "\"\"");
    return `"${normalized}"`;
  };

  const rows = events.map((event) => [
    event.id,
    event.occurredAt,
    event.userId ?? "",
    event.action,
    event.resourceType,
    event.resourceId ?? "",
    event.status,
    JSON.stringify(event.metadata ?? {})
  ]);

  return [headers, ...rows].map((row) => row.map((cell) => escape(cell)).join(",")).join("\n");
};

const filterAuditEvents = (events: AuditEvent[], query: AuditEventsQuery): AuditEvent[] => {
  const fromMs = query.from ? new Date(query.from).getTime() : Number.NEGATIVE_INFINITY;
  const toMs = query.to ? new Date(query.to).getTime() : Number.POSITIVE_INFINITY;

  return events.filter((event) => {
    if (query.action && event.action !== query.action) return false;
    if (query.status && event.status !== query.status) return false;
    if (query.resourceType && event.resourceType !== query.resourceType) return false;

    const occurred = new Date(event.occurredAt).getTime();
    if (Number.isFinite(fromMs) && occurred < fromMs) return false;
    if (Number.isFinite(toMs) && occurred > toMs) return false;
    return true;
  });
};

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/admin/roles", {
    schema: { tags: ["admin"], summary: "List role definitions (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;
    return { items: await fastify.authRuntime.service.listRoles() };
  });

  fastify.post<{ Body: CreateRoleBody }>("/admin/roles", {
    schema: { tags: ["admin"], summary: "Create role definition (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const body = request.body;
    if (!body?.name || !body?.description || !body?.permissions?.length) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "name, description and permissions are required"
      });
    }

    const role = await fastify.authRuntime.service.createRole({
      name: body.name,
      description: body.description,
      permissions: body.permissions,
      ...(body.isSystem !== undefined ? { isSystem: body.isSystem } : {})
    }, principal.userId);

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.role.create",
      resourceType: "role",
      resourceId: role.id,
      status: "success",
      metadata: { name: role.name },
      actor: principal.userId
    });

    return { item: role };
  });

  fastify.patch<{ Params: { roleId: string }; Body: UpdateRolePermissionsBody }>("/admin/roles/:roleId/permissions", {
    schema: { tags: ["admin"], summary: "Update role permissions (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const permissions = request.body?.permissions ?? [];
    if (!permissions.length) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "permissions must contain at least one value"
      });
    }

    try {
      const role = await fastify.authRuntime.service.updateRolePermissions(
        request.params.roleId,
        permissions,
        principal.userId
      );
      await auditLogService.record({
        userId: principal.userId,
        action: "admin.role.permissions.update",
        resourceType: "role",
        resourceId: role.id,
        status: "success",
        metadata: { permissionsCount: role.permissions.length },
        actor: principal.userId
      });
      return { item: role };
    } catch (error) {
      return reply.code(400).send({
        error: "invalid_request",
        message: error instanceof Error ? error.message : "Unable to update role permissions"
      });
    }
  });

  fastify.get<{ Querystring: AuditEventsQuery }>("/admin/audit-events", {
    schema: { tags: ["admin"], summary: "List audit events with filters/grouping/export (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const query = request.query ?? {};
    const events = await apiStore.listAuditEvents(query.userId);
    const filtered = filterAuditEvents(events, query).sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt)
    );

    if (query.groupBy) {
      const groups = new Map<string, number>();
      for (const event of filtered) {
        const key =
          query.groupBy === "action"
            ? event.action
            : query.groupBy === "resourceType"
              ? event.resourceType
              : query.groupBy === "status"
                ? event.status
                : event.userId ?? "unknown";
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }

      return {
        items: [...groups.entries()]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count)
      };
    }

    if (query.format === "csv") {
      reply.header("content-type", "text/csv; charset=utf-8");
      return toCsv(filtered);
    }

    return { items: filtered };
  });

  fastify.get<{ Querystring: { userId?: string; projectId?: string } }>("/admin/project-role-bindings", {
    schema: { tags: ["admin"], summary: "List project role bindings (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const items = await fastify.authRuntime.service.listProjectRoleBindings({
      ...(request.query.userId ? { userId: request.query.userId } : {}),
      ...(request.query.projectId ? { projectId: request.query.projectId } : {})
    });

    return { items };
  });

  fastify.post<{ Body: CreateProjectRoleBindingBody }>("/admin/project-role-bindings", {
    schema: { tags: ["admin"], summary: "Assign a role at project scope (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const body = request.body;
    if (!body?.userId || !body?.projectId || !body?.roleName) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "userId, projectId and roleName are required"
      });
    }

    await fastify.authRuntime.service.assignProjectRole(
      body.userId,
      body.projectId,
      body.roleName,
      principal.userId,
      body.expiresAt
    );

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.project_role_binding.create",
      resourceType: "project_role_binding",
      status: "success",
      metadata: { userId: body.userId, projectId: body.projectId, roleName: body.roleName },
      actor: principal.userId
    });

    const items = await fastify.authRuntime.service.listProjectRoleBindings({
      userId: body.userId,
      projectId: body.projectId
    });
    return { items };
  });

  fastify.delete<{ Params: { bindingId: string } }>("/admin/project-role-bindings/:bindingId", {
    schema: { tags: ["admin"], summary: "Remove a project role binding (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    await fastify.authRuntime.service.removeProjectRoleBinding(request.params.bindingId);

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.project_role_binding.delete",
      resourceType: "project_role_binding",
      resourceId: request.params.bindingId,
      status: "success",
      metadata: {},
      actor: principal.userId
    });

    return { ok: true };
  });

  fastify.get<{ Querystring: { userId?: string; repositoryId?: string } }>("/admin/repository-role-bindings", {
    schema: { tags: ["admin"], summary: "List repository role bindings (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const items = await fastify.authRuntime.service.listRepositoryRoleBindings({
      ...(request.query.userId ? { userId: request.query.userId } : {}),
      ...(request.query.repositoryId ? { repositoryId: request.query.repositoryId } : {})
    });

    return { items };
  });

  fastify.post<{ Body: CreateRepositoryRoleBindingBody }>("/admin/repository-role-bindings", {
    schema: { tags: ["admin"], summary: "Assign a role at repository scope (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const body = request.body;
    if (!body?.userId || !body?.repositoryId || !body?.roleName) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "userId, repositoryId and roleName are required"
      });
    }

    await fastify.authRuntime.service.assignRepositoryRole(
      body.userId,
      body.repositoryId,
      body.roleName,
      principal.userId,
      body.expiresAt
    );

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.repository_role_binding.create",
      resourceType: "repository_role_binding",
      status: "success",
      metadata: { userId: body.userId, repositoryId: body.repositoryId, roleName: body.roleName },
      actor: principal.userId
    });

    const items = await fastify.authRuntime.service.listRepositoryRoleBindings({
      userId: body.userId,
      repositoryId: body.repositoryId
    });
    return { items };
  });

  fastify.delete<{ Params: { bindingId: string } }>("/admin/repository-role-bindings/:bindingId", {
    schema: { tags: ["admin"], summary: "Remove a repository role binding (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    await fastify.authRuntime.service.removeRepositoryRoleBinding(request.params.bindingId);

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.repository_role_binding.delete",
      resourceType: "repository_role_binding",
      resourceId: request.params.bindingId,
      status: "success",
      metadata: {},
      actor: principal.userId
    });

    return { ok: true };
  });

  fastify.get<{
    Querystring: { granteeUserId?: string; scopeType?: "global" | "project" | "repository"; scopeId?: string }
  }>("/admin/delegated-permissions", {
    schema: { tags: ["admin"], summary: "List delegated permissions (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const items = await fastify.authRuntime.service.listDelegatedPermissions({
      ...(request.query.granteeUserId ? { granteeUserId: request.query.granteeUserId } : {}),
      ...(request.query.scopeType ? { scopeType: request.query.scopeType } : {}),
      ...(request.query.scopeId ? { scopeId: request.query.scopeId } : {})
    });

    return { items };
  });

  fastify.post<{ Body: CreateDelegatedPermissionBody }>("/admin/delegated-permissions", {
    schema: { tags: ["admin"], summary: "Delegate permission temporarily (admin required)" }
  }, async (request, reply) => {
    const principal = requireRole(request, reply, "admin");
    if (!principal) return;

    const body = request.body;
    if (!body?.granteeUserId || !body.permission || !body.scopeType || !body.expiresAt) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "granteeUserId, permission, scopeType and expiresAt are required"
      });
    }

    try {
      const item = await fastify.authRuntime.service.grantDelegatedPermission({
        grantedByUserId: principal.userId,
        granteeUserId: body.granteeUserId,
        permission: body.permission,
        scopeType: body.scopeType,
        ...(body.scopeId ? { scopeId: body.scopeId } : {}),
        expiresAt: body.expiresAt
      }, principal.userId);

      await auditLogService.record({
        userId: principal.userId,
        action: "admin.delegated_permission.create",
        resourceType: "delegated_permission",
        resourceId: item.id,
        status: "success",
        metadata: {
          granteeUserId: body.granteeUserId,
          permission: body.permission,
          scopeType: body.scopeType,
          scopeId: body.scopeId
        },
        actor: principal.userId
      });

      return { item };
    } catch (error) {
      return reply.code(400).send({
        error: "invalid_request",
        message: error instanceof Error ? error.message : "Unable to grant delegated permission"
      });
    }
  });

  fastify.post<{ Params: { delegatedPermissionId: string } }>(
    "/admin/delegated-permissions/:delegatedPermissionId/revoke",
    {
      schema: { tags: ["admin"], summary: "Revoke a delegated permission (admin required)" }
    },
    async (request, reply) => {
      const principal = requireRole(request, reply, "admin");
      if (!principal) return;

      await fastify.authRuntime.service.revokeDelegatedPermission(
        request.params.delegatedPermissionId,
        principal.userId
      );

      await auditLogService.record({
        userId: principal.userId,
        action: "admin.delegated_permission.revoke",
        resourceType: "delegated_permission",
        resourceId: request.params.delegatedPermissionId,
        status: "success",
        metadata: {},
        actor: principal.userId
      });

      return { ok: true };
    }
  );

  fastify.post<{ Body: CreateProjectBody }>("/admin/projects", {
    schema: { tags: ["admin"], summary: "Create project (project.write required)" }
  }, async (request, reply) => {
    const principal = requirePermission(request, reply, "project.write");
    if (!principal) return;

    const body = request.body;
    if (!body?.key || !body?.name) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "key and name are required"
      });
    }

    const { project: created } = await createProjectWithCoordinator({
      tenantId: request.tenantId ?? "tenant_default",
      key: body.key,
      name: body.name,
      ...(body.description ? { description: body.description } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.policySetId ? { policySetId: body.policySetId } : {}),
      actor: principal.userId
    });

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.project.create",
      resourceType: "project",
      resourceId: created.id,
      status: "success",
      metadata: { key: created.key },
      actor: principal.userId
    });

    return { item: created };
  });

  fastify.patch<{ Params: { projectId: string }; Body: UpdateProjectBody }>("/admin/projects/:projectId", {
    schema: { tags: ["admin"], summary: "Update project (project.write on project scope required)" }
  }, async (request, reply) => {
    const principal = await requireScopedPermission(request, reply, "project.write", {
      projectId: request.params.projectId
    });
    if (!principal) return;

    const existing = await apiStore.getProject(request.params.projectId);
    if (!existing) {
      return reply.code(404).send({ item: null });
    }

    const now = new Date().toISOString();
    const updated = await apiStore.updateProject(existing.id, {
      ...(request.body.name !== undefined ? { name: request.body.name } : {}),
      ...(request.body.description !== undefined ? { description: request.body.description } : {}),
      ...(request.body.status !== undefined ? { status: request.body.status } : {}),
      ...(request.body.policySetId !== undefined ? { policySetId: request.body.policySetId } : {}),
      updatedAt: now,
      updatedBy: principal.userId
    });

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.project.update",
      resourceType: "project",
      resourceId: updated.id,
      status: "success",
      metadata: { changedFields: Object.keys(request.body ?? {}) },
      actor: principal.userId
    });

    return { item: updated };
  });

  fastify.post<{ Body: CreateTaskBody }>("/admin/tasks", {
    schema: { tags: ["admin"], summary: "Create task (task.write on project scope required)" }
  }, async (request, reply) => {
    const body = request.body;
    if (!body?.projectId || !body?.title || !body?.goal) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "projectId, title and goal are required"
      });
    }

    const principal = await requireScopedPermission(request, reply, "task.write", {
      projectId: body.projectId
    });
    if (!principal) return;

    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      tenantId: request.tenantId ?? "tenant_default",
      projectId: body.projectId,
      ...(body.roadmapItemId ? { roadmapItemId: body.roadmapItemId } : {}),
      title: body.title,
      type: body.type ?? "feature",
      state: "proposed",
      goal: body.goal,
      scopeInclude: body.scopeInclude ?? [],
      scopeExclude: body.scopeExclude ?? [],
      constraints: body.constraints ?? [],
      targetRepositoryIds: body.targetRepositoryIds ?? [],
      successCriteria: body.successCriteria ?? [],
      verificationPlan: body.verificationPlan ?? ["lint", "test", "build"],
      dependencyTaskIds: body.dependencyTaskIds ?? [],
      riskNotes: body.riskNotes ?? [],
      budget: { maxRetries: 1 },
      approvalsRequired: body.approvalsRequired ?? true,
      createdAt: now,
      createdBy: principal.userId,
      updatedAt: now,
      updatedBy: principal.userId
    };
    const created = await apiStore.createTask(task);

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.task.create",
      resourceType: "task",
      resourceId: created.id,
      status: "success",
      metadata: { projectId: created.projectId },
      actor: principal.userId
    });

    return { item: created };
  });

  fastify.patch<{ Params: { taskId: string }; Body: UpdateTaskBody }>("/admin/tasks/:taskId", {
    schema: { tags: ["admin"], summary: "Update task (task.write on project scope required)" }
  }, async (request, reply) => {
    const existing = await apiStore.getTask(request.params.taskId);
    if (!existing) {
      return reply.code(404).send({ item: null });
    }

    const principal = await requireScopedPermission(request, reply, "task.write", {
      projectId: existing.projectId
    });
    if (!principal) return;

    const now = new Date().toISOString();
    const updated = await apiStore.updateTask(existing.id, {
      ...(request.body.title !== undefined ? { title: request.body.title } : {}),
      ...(request.body.state !== undefined ? { state: request.body.state } : {}),
      ...(request.body.goal !== undefined ? { goal: request.body.goal } : {}),
      ...(request.body.scopeInclude !== undefined ? { scopeInclude: request.body.scopeInclude } : {}),
      ...(request.body.scopeExclude !== undefined ? { scopeExclude: request.body.scopeExclude } : {}),
      ...(request.body.constraints !== undefined ? { constraints: request.body.constraints } : {}),
      ...(request.body.targetRepositoryIds !== undefined
        ? { targetRepositoryIds: request.body.targetRepositoryIds }
        : {}),
      ...(request.body.successCriteria !== undefined ? { successCriteria: request.body.successCriteria } : {}),
      ...(request.body.verificationPlan !== undefined ? { verificationPlan: request.body.verificationPlan } : {}),
      ...(request.body.dependencyTaskIds !== undefined ? { dependencyTaskIds: request.body.dependencyTaskIds } : {}),
      ...(request.body.riskNotes !== undefined ? { riskNotes: request.body.riskNotes } : {}),
      ...(request.body.approvalsRequired !== undefined ? { approvalsRequired: request.body.approvalsRequired } : {}),
      updatedAt: now,
      updatedBy: principal.userId
    });

    await auditLogService.record({
      userId: principal.userId,
      action: "admin.task.update",
      resourceType: "task",
      resourceId: updated.id,
      status: "success",
      metadata: { changedFields: Object.keys(request.body ?? {}) },
      actor: principal.userId
    });

    return { item: updated };
  });
};
