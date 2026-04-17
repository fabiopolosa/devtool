import type { FastifyPluginAsync } from "fastify";
import { dispatchRunnerJob } from "../services/job-dispatch-service.js";
import {
  createWorkspace,
  ensureWorkspaceActionReadiness,
  getWorkspace,
  listWorkspaces,
  markWorkspaceRuntimePending,
  normalizeWorkspaceMetadata,
  toWorkspaceMode,
  toWorkspaceRuntimeAction,
  toWorkspaceRuntimeStatus,
  updateWorkspace,
  WorkspacePathValidationError
} from "../services/workspaces-service.js";
import { requireTenantPermission } from "../tenant/rbac.js";

type ExecutionMode = "remote" | "local" | "hybrid";
type AsyncRouteStatus = "pending" | "running" | "waiting_user" | "done" | "error";

interface ListWorkspacesQuery {
  projectId?: string;
  runtimeStatus?: string;
}

interface CreateWorkspaceBody {
  projectId?: string;
  mode?: string;
  localPath?: string;
  actor?: string;
}

interface PatchWorkspaceBody {
  mode?: string;
  localPath?: string;
  runtimeStatus?: string;
  action?: string;
  executionMode?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const toExecutionMode = (value: unknown): ExecutionMode | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "remote" || normalized === "local" || normalized === "hybrid") {
    return normalized;
  }
  return undefined;
};

const toAsyncRouteStatus = (status: string): AsyncRouteStatus =>
  status === "idle"
    ? "pending"
    : status === "running"
      ? "running"
      : status === "waiting_user"
        ? "waiting_user"
        : status === "done"
          ? "done"
          : "error";

export const workspacesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: ListWorkspacesQuery }>(
    "/workspaces",
    {
      schema: { tags: ["workspaces"], summary: "List workspaces scoped to the current tenant" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const runtimeStatus =
        request.query.runtimeStatus !== undefined
          ? toWorkspaceRuntimeStatus(request.query.runtimeStatus)
          : undefined;
      if (request.query.runtimeStatus !== undefined && !runtimeStatus) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "runtimeStatus must be one of: stopped, starting, running, deploying, unknown, error"
        });
      }

      const items = await listWorkspaces({
        tenantId: request.tenantId ?? "tenant_default",
        ...(request.query.projectId ? { projectId: request.query.projectId } : {}),
        ...(runtimeStatus ? { runtimeStatus } : {})
      });
      return { items };
    }
  );

  fastify.post<{ Body: CreateWorkspaceBody }>(
    "/workspaces",
    {
      schema: { tags: ["workspaces"], summary: "Create project workspace runtime" }
    },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const projectId = request.body?.projectId?.trim();
      if (!projectId) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "projectId is required"
        });
      }
      const mode = request.body.mode !== undefined ? toWorkspaceMode(request.body.mode) : undefined;
      if (request.body.mode !== undefined && !mode) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "mode must be either local or remote"
        });
      }
      const localPath = asString(request.body.localPath);
      const actor = asString(request.body.actor) ?? request.authPrincipal?.userId ?? "workspace_service";

      try {
        const item = await createWorkspace({
          tenantId: request.tenantId ?? "tenant_default",
          projectId,
          actor,
          ...(mode ? { mode } : {}),
          ...(localPath ? { localPath } : {})
        });
        return reply.code(201).send({ item });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create workspace";
        const statusCode = message.includes("already exists") ? 409 : 400;
        return reply.code(statusCode).send({
          error: statusCode === 409 ? "conflict" : "workspace_create_failed",
          message
        });
      }
    }
  );

  fastify.patch<{ Params: { workspaceId: string }; Body: PatchWorkspaceBody }>(
    "/workspaces/:workspaceId",
    {
      schema: { tags: ["workspaces"], summary: "Update workspace configuration or dispatch runtime action" }
    },
    async (request, reply) => {
      const workspaceId = request.params.workspaceId;
      const tenantId = request.tenantId ?? "tenant_default";
      const actor = asString(request.body?.actor) ?? request.authPrincipal?.userId ?? "workspace_service";
      const action = request.body?.action !== undefined ? toWorkspaceRuntimeAction(request.body.action) : undefined;
      if (request.body?.action !== undefined && !action) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "action must be one of: start, stop, deploy, restart"
        });
      }

      if (action) {
        if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      } else {
        if (!requireTenantPermission(request, reply, "canEdit")) return;
      }

      const existing = await getWorkspace(tenantId, workspaceId);
      if (!existing) {
        return reply.code(404).send({
          error: "not_found",
          message: `Workspace not found: ${workspaceId}`
        });
      }
      let actionWorkspace = existing;

      if (!action) {
        const mode = request.body?.mode !== undefined ? toWorkspaceMode(request.body.mode) : undefined;
        if (request.body?.mode !== undefined && !mode) {
          return reply.code(400).send({
            error: "invalid_request",
            message: "mode must be either local or remote"
          });
        }
        const runtimeStatus =
          request.body?.runtimeStatus !== undefined
            ? toWorkspaceRuntimeStatus(request.body.runtimeStatus)
            : undefined;
        if (request.body?.runtimeStatus !== undefined && !runtimeStatus) {
          return reply.code(400).send({
            error: "invalid_request",
            message: "runtimeStatus must be one of: stopped, starting, running, deploying, unknown, error"
          });
        }
        const localPath = asString(request.body?.localPath);
        const item = await updateWorkspace({
          tenantId,
          workspaceId,
          actor,
          ...(mode ? { mode } : {}),
          ...(localPath ? { localPath } : {}),
          ...(runtimeStatus ? { runtimeStatus } : {})
        });
        return { item };
      }

      try {
        actionWorkspace = await ensureWorkspaceActionReadiness({
          tenantId,
          workspaceId: existing.id,
          actor,
          action
        });
      } catch (error) {
        if (error instanceof WorkspacePathValidationError) {
          return reply.code(400).send({
            error: "workspace_path_invalid",
            message: error.message,
            validation: error.validation
          });
        }
        return reply.code(400).send({
          error: "workspace_action_invalid",
          message: error instanceof Error ? error.message : "Workspace action is not allowed"
        });
      }

      const executionMode =
        toExecutionMode(request.body.executionMode) ??
        (actionWorkspace.mode === "local" ? "local" : "remote");
      const metadata = normalizeWorkspaceMetadata(request.body.metadata);

      const previousStatus = actionWorkspace.runtimeStatus;
      const previousDetails = actionWorkspace.runtimeDetails ?? {};
      await markWorkspaceRuntimePending({
        tenantId,
        workspaceId: actionWorkspace.id,
        actor,
        action,
        ...(metadata ? { metadata } : {})
      });

      try {
        const job = await dispatchRunnerJob({
          tenantId,
          projectId: actionWorkspace.projectId,
          type: "system",
          title: `Workspace ${action}: ${actionWorkspace.projectId}`,
          createdBy: actor,
          resourceType: "workspace",
          resourceId: actionWorkspace.id,
          payload: {
            internalAction: `workspace.${action}`,
            tenantId,
            projectId: actionWorkspace.projectId,
            workspaceId: actionWorkspace.id,
            mode: actionWorkspace.mode,
            ...(actionWorkspace.localPath ? { localPath: actionWorkspace.localPath } : {}),
            ...(metadata ? { metadata } : {}),
            execution: {
              mode: executionMode
            }
          }
        });
        const item = await getWorkspace(tenantId, actionWorkspace.id);
        return {
          ...(item ? { item } : {}),
          jobId: job.id,
          status: toAsyncRouteStatus(job.status)
        };
      } catch (error) {
        await updateWorkspace({
          tenantId,
          workspaceId: actionWorkspace.id,
          actor,
          runtimeStatus: previousStatus,
          runtimeDetails: previousDetails
        });
        return reply.code(400).send({
          error: "workspace_action_dispatch_failed",
          message: error instanceof Error ? error.message : `Unable to dispatch workspace ${action}`
        });
      }
    }
  );
};
