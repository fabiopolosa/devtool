export type JobStatus = "idle" | "running" | "waiting_user" | "done" | "error";
export type JobActionType = "input" | "approve" | "review";
export type JobType =
  | "ingestion"
  | "processing"
  | "generation"
  | "review"
  | "deployment"
  | "brainstorm"
  | "brainstorm_apply"
  | "agent_runtime"
  | "system";

export interface Job {
  id: string;
  tenantId: string;
  projectId?: string;
  type: JobType;
  title: string;
  status: JobStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  actionRequired: boolean;
  actionType?: JobActionType;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  dependencies: string[];
  dependsOnCount: number;
  ready: boolean;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
