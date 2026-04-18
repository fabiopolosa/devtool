import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Workspace, WorkspaceMode, WorkspaceRuntimeStatus } from "@cp/domain";
import { runWithTenantContext } from "@cp/db";
import { apiStore } from "./api-store.js";
import { getWorkspaceAllowedRoots, isPathWithinRoot } from "./workspace-browser-service.js";

const nowIso = (): string => new Date().toISOString();

const workspaceModes = ["local", "remote"] as const;
const workspaceRuntimeStatuses = [
  "stopped",
  "starting",
  "running",
  "deploying",
  "unknown",
  "error"
] as const;
const workspaceRuntimeActions = ["start", "stop", "deploy", "restart"] as const;

export type WorkspaceRuntimeAction = (typeof workspaceRuntimeActions)[number];
export type WorkspacePathValidationReason =
  | "not_required"
  | "missing_path"
  | "path_not_found"
  | "path_not_directory"
  | "path_escape"
  | "symlink_not_allowed"
  | "permission_denied"
  | "validation_error";

export interface WorkspacePathValidation {
  checkedAt: string;
  mode: WorkspaceMode;
  status: "valid" | "invalid" | "not_required";
  valid: boolean;
  path?: string;
  resolvedPath?: string;
  workspaceRoot?: string;
  exists: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  readable: boolean;
  writable: boolean;
  executable: boolean;
  directorySizeBytes?: number;
  fileCount?: number;
  sizeEstimateTruncated?: boolean;
  reason?: WorkspacePathValidationReason;
  message: string;
}

export class WorkspacePathValidationError extends Error {
  readonly validation: WorkspacePathValidation;

  constructor(validation: WorkspacePathValidation) {
    super(validation.message);
    this.name = "WorkspacePathValidationError";
    this.validation = validation;
  }
}

const workspaceModeSet = new Set<WorkspaceMode>(workspaceModes);
const workspaceRuntimeStatusSet = new Set<WorkspaceRuntimeStatus>(workspaceRuntimeStatuses);
const workspaceRuntimeActionSet = new Set<WorkspaceRuntimeAction>(workspaceRuntimeActions);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const checkPathAccess = async (targetPath: string, mode: number): Promise<boolean> => {
  try {
    await access(targetPath, mode);
    return true;
  } catch {
    return false;
  }
};

const pathHasTraversalSegments = (value: string): boolean =>
  value
    .split(/[\\/]+/)
    .map((segment) => segment.trim())
    .some((segment) => segment === "..");

interface DirectoryFootprint {
  bytes: number;
  files: number;
  truncated: boolean;
}

const estimateDirectoryFootprint = async (
  rootPath: string,
  options?: { maxEntries?: number; maxBytes?: number }
): Promise<DirectoryFootprint> => {
  const maxEntries = Math.max(100, options?.maxEntries ?? 10_000);
  const maxBytes = Math.max(1_048_576, options?.maxBytes ?? 512 * 1024 * 1024);
  const queue: string[] = [rootPath];
  let bytes = 0;
  let files = 0;
  let visitedEntries = 0;
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > maxEntries) {
        truncated = true;
        return { bytes, files, truncated };
      }
      const absoluteEntryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        truncated = true;
        continue;
      }
      if (entry.isDirectory()) {
        queue.push(absoluteEntryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = await stat(absoluteEntryPath);
      bytes += Math.max(0, stats.size);
      files += 1;
      if (bytes >= maxBytes) {
        truncated = true;
        return { bytes, files, truncated };
      }
    }
  }

  return { bytes, files, truncated };
};

const validateWorkspaceLocalPath = async (
  mode: WorkspaceMode,
  localPath?: string
): Promise<WorkspacePathValidation> => {
  const checkedAt = nowIso();
  if (mode !== "local") {
    return {
      checkedAt,
      mode,
      status: "not_required",
      valid: true,
      exists: false,
      isDirectory: false,
      isSymlink: false,
      readable: false,
      writable: false,
      executable: false,
      reason: "not_required",
      message: "Local path is not required in remote mode."
    };
  }

  const rawPath = asString(localPath);
  if (rawPath && pathHasTraversalSegments(rawPath)) {
    return {
      checkedAt,
      mode,
      status: "invalid",
      valid: false,
      path: rawPath,
      exists: false,
      isDirectory: false,
      isSymlink: false,
      readable: false,
      writable: false,
      executable: false,
      reason: "path_escape",
      message: "Local workspace path contains traversal segments and is not allowed."
    };
  }

  const normalizedPath = rawPath ? path.resolve(rawPath) : undefined;
  if (!normalizedPath) {
    return {
      checkedAt,
      mode,
      status: "invalid",
      valid: false,
      exists: false,
      isDirectory: false,
      isSymlink: false,
      readable: false,
      writable: false,
      executable: false,
      reason: "missing_path",
      message: "Local workspace path is required in local mode."
    };
  }

  try {
    const stats = await lstat(normalizedPath);
    const isSymlink = stats.isSymbolicLink();
    if (isSymlink) {
      return {
        checkedAt,
        mode,
        status: "invalid",
        valid: false,
        path: normalizedPath,
        exists: true,
        isDirectory: false,
        isSymlink: true,
        readable: false,
        writable: false,
        executable: false,
        reason: "symlink_not_allowed",
        message: "Symlink paths are not allowed for local workspaces."
      };
    }
    const resolvedPath = await realpath(normalizedPath);
    const workspaceAllowedRootsInitial = getWorkspaceAllowedRoots();
    if (workspaceAllowedRootsInitial.length > 0) {
      const matchedRoot = workspaceAllowedRootsInitial.find((root) =>
        isPathWithinRoot(resolvedPath, root)
      );
      if (!matchedRoot) {
        return {
          checkedAt,
          mode,
          status: "invalid",
          valid: false,
          path: normalizedPath,
          resolvedPath,
          exists: true,
          isDirectory: stats.isDirectory(),
          isSymlink: false,
          readable: false,
          writable: false,
          executable: false,
          reason: "path_escape",
          message: "Local workspace path is outside configured workspace roots."
        };
      }
    }

    const exists = true;
    const isDirectory = stats.isDirectory();
    const readable = await checkPathAccess(resolvedPath, fsConstants.R_OK);
    const writable = await checkPathAccess(resolvedPath, fsConstants.W_OK);
    const executable = await checkPathAccess(resolvedPath, fsConstants.X_OK);
    if (!isDirectory) {
      return {
        checkedAt,
        mode,
        status: "invalid",
        valid: false,
        path: normalizedPath,
        resolvedPath,
        exists,
        isDirectory,
        isSymlink: false,
        readable,
        writable,
        executable,
        reason: "path_not_directory",
        message: "Local workspace path must be a directory."
      };
    }
    if (!readable || !writable || !executable) {
      const missing: string[] = [];
      if (!readable) missing.push("read");
      if (!writable) missing.push("write");
      if (!executable) missing.push("execute");
      return {
        checkedAt,
        mode,
        status: "invalid",
        valid: false,
        path: normalizedPath,
        resolvedPath,
        exists,
        isDirectory,
        isSymlink: false,
        readable,
        writable,
        executable,
        reason: "permission_denied",
        message: `Local workspace path is missing required permissions: ${missing.join(", ")}.`
      };
    }

    let footprint: DirectoryFootprint | null = null;
    try {
      footprint = await estimateDirectoryFootprint(resolvedPath);
    } catch {
      footprint = null;
    }

    const workspaceAllowedRootsAfterFootprint = getWorkspaceAllowedRoots();
    const matchedRoot = workspaceAllowedRootsAfterFootprint.find((root) =>
      isPathWithinRoot(resolvedPath, root)
    );
    return {
      checkedAt,
      mode,
      status: "valid",
      valid: true,
      path: normalizedPath,
      resolvedPath,
      ...(matchedRoot ? { workspaceRoot: matchedRoot } : {}),
      exists,
      isDirectory,
      isSymlink: false,
      readable,
      writable,
      executable,
      ...(footprint
        ? {
            directorySizeBytes: footprint.bytes,
            fileCount: footprint.files,
            sizeEstimateTruncated: footprint.truncated
          }
        : {}),
      message: "Local workspace path is valid."
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const code = typeof err?.code === "string" ? err.code : "";
    const reason: WorkspacePathValidationReason =
      code === "ENOENT"
        ? "path_not_found"
        : code === "EACCES" || code === "EPERM"
          ? "permission_denied"
          : "validation_error";
    const message =
      reason === "path_not_found"
        ? "Local workspace path does not exist."
        : reason === "permission_denied"
          ? "Insufficient permission to access local workspace path."
          : `Unable to validate local workspace path${code ? ` (${code})` : ""}.`;
    return {
      checkedAt,
      mode,
      status: "invalid",
      valid: false,
      path: normalizedPath,
      exists: false,
      isDirectory: false,
      isSymlink: false,
      readable: false,
      writable: false,
      executable: false,
      reason,
      message
    };
  }
};

const withPathValidation = (
  runtimeDetails: Record<string, unknown> | undefined,
  pathValidation: WorkspacePathValidation
): Record<string, unknown> => ({
  ...(runtimeDetails ?? {}),
  pathValidation
});

export const toWorkspaceMode = (value: unknown): WorkspaceMode | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return workspaceModeSet.has(normalized as WorkspaceMode) ? (normalized as WorkspaceMode) : undefined;
};

export const toWorkspaceRuntimeStatus = (value: unknown): WorkspaceRuntimeStatus | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return workspaceRuntimeStatusSet.has(normalized as WorkspaceRuntimeStatus)
    ? (normalized as WorkspaceRuntimeStatus)
    : undefined;
};

export const toWorkspaceRuntimeAction = (value: unknown): WorkspaceRuntimeAction | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return workspaceRuntimeActionSet.has(normalized as WorkspaceRuntimeAction)
    ? (normalized as WorkspaceRuntimeAction)
    : undefined;
};

const assertProjectExists = async (tenantId: string, projectId: string): Promise<void> => {
  const project = await runWithTenantContext({ tenantId }, async () => apiStore.getProject(projectId));
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
};

const pendingStatusForAction = (action: WorkspaceRuntimeAction): WorkspaceRuntimeStatus => {
  if (action === "start") return "starting";
  if (action === "stop") return "unknown";
  if (action === "deploy") return "deploying";
  return "starting";
};

export interface ListWorkspacesInput {
  tenantId: string;
  projectId?: string;
  runtimeStatus?: WorkspaceRuntimeStatus;
}

export const listWorkspaces = async (input: ListWorkspacesInput): Promise<Workspace[]> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () =>
    apiStore.listWorkspaces({
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.runtimeStatus ? { runtimeStatus: input.runtimeStatus } : {})
    })
  );

export const getWorkspace = async (tenantId: string, workspaceId: string): Promise<Workspace | null> =>
  runWithTenantContext({ tenantId }, async () => apiStore.getWorkspace(workspaceId));

export interface CreateWorkspaceInput {
  tenantId: string;
  projectId: string;
  actor: string;
  mode?: WorkspaceMode;
  localPath?: string;
  runtimeStatus?: WorkspaceRuntimeStatus;
  runtimeDetails?: Record<string, unknown>;
}

export const createWorkspace = async (input: CreateWorkspaceInput): Promise<Workspace> => {
  await assertProjectExists(input.tenantId, input.projectId);
  return runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const existing = await apiStore.listWorkspaces({ projectId: input.projectId });
    if (existing.length > 0) {
      throw new Error(`Workspace already exists for project ${input.projectId}`);
    }
    const mode = input.mode ?? "remote";
    const pathValidation = await validateWorkspaceLocalPath(mode, input.localPath);
    const runtimeDetails = withPathValidation(input.runtimeDetails, pathValidation);
    const runtimeStatus: WorkspaceRuntimeStatus =
      mode === "local" && !pathValidation.valid ? "error" : (input.runtimeStatus ?? "stopped");
    const timestamp = nowIso();
    return apiStore.createWorkspace({
      id: randomUUID(),
      tenantId: input.tenantId,
      projectId: input.projectId,
      mode,
      ...(input.localPath ? { localPath: input.localPath } : {}),
      runtimeStatus,
      runtimeDetails,
      createdAt: timestamp,
      createdBy: input.actor,
      updatedAt: timestamp,
      updatedBy: input.actor
    });
  });
};

export interface UpdateWorkspaceInput {
  tenantId: string;
  workspaceId: string;
  actor: string;
  mode?: WorkspaceMode;
  localPath?: string;
  runtimeStatus?: WorkspaceRuntimeStatus;
  runtimeDetails?: Record<string, unknown>;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastDeployedAt?: string;
  validatePath?: boolean;
}

export const updateWorkspace = async (input: UpdateWorkspaceInput): Promise<Workspace> =>
  runWithTenantContext({ tenantId: input.tenantId }, async () => {
    const existing = await apiStore.getWorkspace(input.workspaceId);
    if (!existing) {
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    }
    const nextMode = input.mode ?? existing.mode;
    const nextLocalPath = typeof input.localPath === "string" ? input.localPath : existing.localPath;
    const shouldValidatePath =
      input.validatePath === true || input.mode !== undefined || typeof input.localPath === "string";
    const mergedRuntimeDetails = {
      ...(asRecord(existing.runtimeDetails) ?? {}),
      ...(input.runtimeDetails ?? {})
    };
    const pathValidation = shouldValidatePath
      ? await validateWorkspaceLocalPath(nextMode, nextLocalPath)
      : undefined;
    const runtimeDetails = pathValidation
      ? withPathValidation(mergedRuntimeDetails, pathValidation)
      : mergedRuntimeDetails;
    const runtimeStatusFromPathValidation: WorkspaceRuntimeStatus | undefined =
      pathValidation && nextMode === "local" && !pathValidation.valid ? "error" : undefined;
    return apiStore.updateWorkspace(input.workspaceId, {
      ...(input.mode ? { mode: input.mode } : {}),
      ...(typeof input.localPath === "string" ? { localPath: input.localPath } : {}),
      ...(runtimeStatusFromPathValidation
        ? { runtimeStatus: runtimeStatusFromPathValidation }
        : input.runtimeStatus
          ? { runtimeStatus: input.runtimeStatus }
          : {}),
      runtimeDetails,
      ...(input.lastStartedAt ? { lastStartedAt: input.lastStartedAt } : {}),
      ...(input.lastStoppedAt ? { lastStoppedAt: input.lastStoppedAt } : {}),
      ...(input.lastDeployedAt ? { lastDeployedAt: input.lastDeployedAt } : {}),
      updatedAt: nowIso(),
      updatedBy: input.actor
    });
  });

export interface MarkWorkspaceRuntimePendingInput {
  tenantId: string;
  workspaceId: string;
  actor: string;
  action: WorkspaceRuntimeAction;
  metadata?: Record<string, unknown>;
}

export const markWorkspaceRuntimePending = async (
  input: MarkWorkspaceRuntimePendingInput
): Promise<Workspace> => {
  const current = await getWorkspace(input.tenantId, input.workspaceId);
  if (!current) {
    throw new Error(`Workspace not found: ${input.workspaceId}`);
  }
  return updateWorkspace({
    tenantId: input.tenantId,
    workspaceId: current.id,
    actor: input.actor,
    runtimeStatus: pendingStatusForAction(input.action),
    runtimeDetails: {
      ...(current.runtimeDetails ?? {}),
      pendingAction: input.action,
      pendingAt: nowIso(),
      pendingError: null,
      ...(input.metadata ? { pendingMetadata: input.metadata } : {})
    }
  });
};

const actionRequiresValidatedLocalPath = (action: WorkspaceRuntimeAction): boolean =>
  action === "start" || action === "deploy" || action === "restart";

export interface EnsureWorkspaceActionReadinessInput {
  tenantId: string;
  workspaceId: string;
  actor: string;
  action: WorkspaceRuntimeAction;
}

export const ensureWorkspaceActionReadiness = async (
  input: EnsureWorkspaceActionReadinessInput
): Promise<Workspace> => {
  const existing = await getWorkspace(input.tenantId, input.workspaceId);
  if (!existing) {
    throw new Error(`Workspace not found: ${input.workspaceId}`);
  }
  if (!actionRequiresValidatedLocalPath(input.action) || existing.mode !== "local") {
    return existing;
  }

  const pathValidation = await validateWorkspaceLocalPath(existing.mode, existing.localPath);
  const nextRuntimeDetails = withPathValidation(existing.runtimeDetails, pathValidation);
  const workspace = await updateWorkspace({
    tenantId: input.tenantId,
    workspaceId: existing.id,
    actor: input.actor,
    runtimeDetails: nextRuntimeDetails,
    ...(pathValidation.valid ? {} : { runtimeStatus: "error" })
  });

  if (!pathValidation.valid) {
    throw new WorkspacePathValidationError(pathValidation);
  }
  return workspace;
};

export interface ApplyWorkspaceRuntimeActionInput {
  tenantId: string;
  workspaceId: string;
  actor: string;
  action: WorkspaceRuntimeAction;
  metadata?: Record<string, unknown>;
}

export const applyWorkspaceRuntimeAction = async (
  input: ApplyWorkspaceRuntimeActionInput
): Promise<{
  workspace: Workspace;
  action: WorkspaceRuntimeAction;
  summary: string;
}> => {
  const existing = await getWorkspace(input.tenantId, input.workspaceId);
  if (!existing) {
    throw new Error(`Workspace not found: ${input.workspaceId}`);
  }

  const timestamp = nowIso();
  const nextDetails = {
    ...(existing.runtimeDetails ?? {}),
    lastAction: input.action,
    lastActionAt: timestamp,
    ...(input.metadata ? { lastActionMetadata: input.metadata } : {})
  };

  const next: UpdateWorkspaceInput = {
    tenantId: input.tenantId,
    workspaceId: existing.id,
    actor: input.actor,
    runtimeDetails: nextDetails
  };

  if (input.action === "start") {
    next.runtimeStatus = "running";
    next.lastStartedAt = timestamp;
  } else if (input.action === "stop") {
    next.runtimeStatus = "stopped";
    next.lastStoppedAt = timestamp;
  } else if (input.action === "deploy") {
    next.runtimeStatus = "running";
    next.lastDeployedAt = timestamp;
  } else {
    next.runtimeStatus = "running";
    next.lastStoppedAt = timestamp;
    next.lastStartedAt = timestamp;
  }

  const workspace = await updateWorkspace(next);
  return {
    workspace,
    action: input.action,
    summary: `Workspace ${workspace.id} ${input.action} completed`
  };
};

export const normalizeWorkspaceMetadata = (value: unknown): Record<string, unknown> | undefined =>
  asRecord(value);
