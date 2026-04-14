export const projectStatuses = ["active", "paused", "archived"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const repositoryStatuses = ["active", "disconnected"] as const;
export type RepositoryStatus = (typeof repositoryStatuses)[number];

export const roadmapStates = [
  "draft",
  "proposed",
  "approved",
  "in_progress",
  "completed",
  "converted",
  "rejected",
  "archived"
] as const;
export type RoadmapState = (typeof roadmapStates)[number];

export const taskStates = [
  "draft",
  "proposed",
  "approved",
  "queued",
  "running",
  "waiting_for_research",
  "waiting_for_debug",
  "waiting_for_approval",
  "verification_failed",
  "completed",
  "archived",
  "canceled"
] as const;
export type TaskState = (typeof taskStates)[number];

export const taskRunStatuses = [
  "queued",
  "running",
  "waiting",
  "failed",
  "completed",
  "canceled"
] as const;
export type TaskRunStatus = (typeof taskRunStatuses)[number];

export const approvalStatuses = ["pending", "approved", "rejected", "expired"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

export const verificationStatuses = ["pass", "fail", "partial", "skipped"] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export const healthStatuses = ["healthy", "degraded", "down", "unknown"] as const;
export type HealthStatus = (typeof healthStatuses)[number];

export const userStatuses = ["active", "disabled"] as const;
export type UserStatus = (typeof userStatuses)[number];

export const rbacRoleNames = ["admin", "editor", "operator", "viewer"] as const;
export type RbacRoleName = (typeof rbacRoleNames)[number];
