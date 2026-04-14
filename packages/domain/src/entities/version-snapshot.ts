export type VersionSnapshotTrigger = "task_start" | "task_end" | "manual";

export interface VersionSnapshotFile {
  path: string;
  contentHash: string;
  content: string;
}

export interface VersionSnapshot {
  id: string;
  localRepositoryId: string;
  taskId?: string;
  label: string;
  trigger: VersionSnapshotTrigger;
  files: VersionSnapshotFile[];
  metadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
