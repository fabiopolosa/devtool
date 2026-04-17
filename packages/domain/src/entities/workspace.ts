export type WorkspaceMode = "local" | "remote";

export type WorkspaceRuntimeStatus =
  | "stopped"
  | "starting"
  | "running"
  | "deploying"
  | "unknown"
  | "error";

export interface Workspace {
  id: string;
  tenantId: string;
  projectId: string;
  mode: WorkspaceMode;
  localPath?: string;
  runtimeStatus: WorkspaceRuntimeStatus;
  runtimeDetails: Record<string, unknown>;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastDeployedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
