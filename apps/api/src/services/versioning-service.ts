import type { VersionSnapshot } from "@cp/domain";
import { VersioningService, type VersionSnapshotStore } from "@cp/versioning";
import { apiStore } from "./api-store.js";

class ApiVersionSnapshotStoreAdapter implements VersionSnapshotStore {
  async listVersionSnapshots(filters?: {
    localRepositoryId?: string;
    taskId?: string;
  }): Promise<VersionSnapshot[]> {
    return apiStore.listVersionSnapshots(filters);
  }

  async getVersionSnapshotById(snapshotId: string): Promise<VersionSnapshot | null> {
    return apiStore.getVersionSnapshot(snapshotId);
  }

  async createVersionSnapshot(snapshot: VersionSnapshot): Promise<VersionSnapshot> {
    return apiStore.createVersionSnapshot(snapshot);
  }
}

export const versioningService = new VersioningService({
  store: new ApiVersionSnapshotStoreAdapter()
});
