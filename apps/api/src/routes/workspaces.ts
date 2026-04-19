import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { dispatchRunnerJob } from "../services/job-dispatch-service.js";
import {
  getProjectHeartbeatStatus,
  getProjectRuntimeProfile,
  ProjectRuntimeError,
  tickProjectHeartbeat,
  triggerProjectHeartbeat,
  updateProjectRuntimeProfile
} from "../services/project-runtime-service.js";
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
import {
  browseWorkspacePath,
  listWorkspaceBrowserRoots,
  pickWorkspaceFolderDialog,
  WorkspaceBrowserDialogError,
  WorkspaceBrowserPathError
} from "../services/workspace-browser-service.js";
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

const heartbeatTriggerSchema = z.enum([
  "manual",
  "on_startup",
  "after_deploy",
  "after_failure"
]);

const heartbeatIntervalSchema = z.enum(["manual", "1m", "5m", "15m", "30m", "1h"]);

const projectRuntimeProfilePatchSchema = z.object({
  primaryAgentId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  defaultHost: z.enum(["desktop_app", "local_worker", "remote_worker", "api"]).optional(),
  defaultExecutionMode: z.enum(["interactive", "headless", "queued"]).optional(),
  heartbeatPolicy: z
    .object({
      interval: heartbeatIntervalSchema.optional(),
      triggers: z.array(heartbeatTriggerSchema).min(1).optional(),
      enabled: z.boolean().optional(),
      metadata: z.record(z.unknown()).optional()
    })
    .optional(),
  agentSelectionPolicy: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional()
});

const projectHeartbeatBodySchema = z.object({
  trigger: heartbeatTriggerSchema.optional(),
  reason: z.string().min(1).optional(),
  agentIds: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
  force: z.boolean().optional()
});

const workspaceBrowserQuerySchema = z.object({
  path: z.string().min(1).optional()
});

const workspaceBrowserPickBodySchema = z.object({
  path: z.string().min(1).optional()
});

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
        const localPathProvided = request.body ? Object.prototype.hasOwnProperty.call(request.body, "localPath") : false;
        const localPath = localPathProvided
          ? typeof request.body?.localPath === "string"
            ? request.body.localPath.trim()
            : ""
          : undefined;
        const item = await updateWorkspace({
          tenantId,
          workspaceId,
          actor,
          ...(mode ? { mode } : {}),
          ...(localPath !== undefined ? { localPath } : {}),
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

  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/runtime",
    { schema: { tags: ["projects"], summary: "Get project runtime profile" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      try {
        const item = await getProjectRuntimeProfile({
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
          error: "project_runtime_lookup_failed",
          message: error instanceof Error ? error.message : "Unable to load project runtime profile"
        });
      }
    }
  );

  fastify.put<{ Params: { projectId: string }; Body: unknown }>(
    "/projects/:projectId/runtime",
    { schema: { tags: ["projects"], summary: "Update project runtime profile" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const parse = projectRuntimeProfilePatchSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const item = await updateProjectRuntimeProfile({
          tenantId: request.tenantId ?? "tenant_default",
          projectId: request.params.projectId,
          patch: parse.data
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
          error: "project_runtime_update_failed",
          message: error instanceof Error ? error.message : "Unable to update project runtime profile"
        });
      }
    }
  );

  fastify.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/runtime/heartbeat/status",
    { schema: { tags: ["projects"], summary: "Get project heartbeat status" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      try {
        const item = await getProjectHeartbeatStatus({
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
          error: "project_heartbeat_status_failed",
          message: error instanceof Error ? error.message : "Unable to load project heartbeat status"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string }; Body: unknown }>(
    "/projects/:projectId/runtime/heartbeat",
    { schema: { tags: ["projects"], summary: "Trigger project heartbeat" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const parse = projectHeartbeatBodySchema.safeParse(request.body ?? {});
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const item = await triggerProjectHeartbeat({
          tenantId: request.tenantId ?? "tenant_default",
          projectId: request.params.projectId,
          actor: request.authPrincipal?.userId ?? "project_runtime",
          ...(parse.data.trigger ? { trigger: parse.data.trigger } : {}),
          ...(parse.data.reason ? { reason: parse.data.reason } : {}),
          ...(parse.data.agentIds ? { agentIds: parse.data.agentIds } : {}),
          ...(parse.data.metadata ? { metadata: parse.data.metadata } : {}),
          ...(parse.data.force !== undefined ? { force: parse.data.force } : {})
        });
        return { item };
      } catch (error) {
        if (error instanceof ProjectRuntimeError) {
          return reply.code(400).send({
            error: "project_heartbeat_failed",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "project_heartbeat_failed",
          message: error instanceof Error ? error.message : "Unable to trigger project heartbeat"
        });
      }
    }
  );

  fastify.post<{ Params: { projectId: string }; Body: unknown }>(
    "/projects/:projectId/runtime/heartbeat/tick",
    { schema: { tags: ["projects"], summary: "Run scheduled project heartbeat tick" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canRunAgent")) return;
      const parse = projectHeartbeatBodySchema.safeParse(request.body ?? {});
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const item = await tickProjectHeartbeat({
          tenantId: request.tenantId ?? "tenant_default",
          projectId: request.params.projectId,
          actor: request.authPrincipal?.userId ?? "project_runtime",
          ...(parse.data.trigger ? { trigger: parse.data.trigger } : {}),
          ...(parse.data.reason ? { reason: parse.data.reason } : {}),
          ...(parse.data.agentIds ? { agentIds: parse.data.agentIds } : {}),
          ...(parse.data.metadata ? { metadata: parse.data.metadata } : {})
        });
        return { item };
      } catch (error) {
        if (error instanceof ProjectRuntimeError) {
          return reply.code(400).send({
            error: "project_heartbeat_tick_failed",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "project_heartbeat_tick_failed",
          message: error instanceof Error ? error.message : "Unable to run project heartbeat tick"
        });
      }
    }
  );

  fastify.get(
    "/workspaces/browser/roots",
    { schema: { tags: ["workspaces"], summary: "List allowed workspace roots" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      try {
        const item = await listWorkspaceBrowserRoots();
        return { items: item.allowedRoots };
      } catch (error) {
        return reply.code(500).send({
          error: "workspace_browser_failed",
          message: error instanceof Error ? error.message : "Unable to list workspace roots"
        });
      }
    }
  );

  fastify.get<{ Querystring: { path?: string } }>(
    "/workspaces/browser",
    { schema: { tags: ["workspaces"], summary: "Browse allowed workspace folders" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canView")) return;
      const parse = workspaceBrowserQuerySchema.safeParse(request.query ?? {});
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const item = await browseWorkspacePath(
          parse.data.path !== undefined ? { path: parse.data.path } : {}
        );
        return { item };
      } catch (error) {
        if (error instanceof WorkspaceBrowserPathError) {
          return reply.code(400).send({
            error: "workspace_browser_invalid_path",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "workspace_browser_failed",
          message: error instanceof Error ? error.message : "Unable to browse workspace folders"
        });
      }
    }
  );

  fastify.post<{ Body: { path?: string } }>(
    "/workspaces/browser/pick-folder",
    { schema: { tags: ["workspaces"], summary: "Open a native folder picker for local workspace selection" } },
    async (request, reply) => {
      if (!requireTenantPermission(request, reply, "canEdit")) return;
      const parse = workspaceBrowserPickBodySchema.safeParse(request.body ?? {});
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: parse.error.issues.map((issue) => issue.message).join("; ")
        });
      }

      try {
        const item = await pickWorkspaceFolderDialog(
          parse.data.path !== undefined ? { path: parse.data.path } : {}
        );
        if (!item) {
          return { cancelled: true };
        }
        return { item };
      } catch (error) {
        if (error instanceof WorkspaceBrowserPathError) {
          return reply.code(400).send({
            error: "workspace_browser_invalid_path",
            message: error.message
          });
        }
        if (error instanceof WorkspaceBrowserDialogError) {
          return reply.code(501).send({
            error: "workspace_browser_dialog_unavailable",
            message: error.message
          });
        }
        return reply.code(500).send({
          error: "workspace_browser_dialog_failed",
          message: error instanceof Error ? error.message : "Unable to open local folder picker"
        });
      }
    }
  );
};
