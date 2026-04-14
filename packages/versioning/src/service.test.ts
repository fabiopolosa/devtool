import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { VersionSnapshot } from "@cp/domain";
import { describe, expect, it } from "vitest";
import { VersioningService, type VersionSnapshotStore } from "./service.js";

class InMemoryVersionSnapshotStore implements VersionSnapshotStore {
  private readonly map = new Map<string, VersionSnapshot>();

  async listVersionSnapshots(filters?: { localRepositoryId?: string; taskId?: string }): Promise<VersionSnapshot[]> {
    const all = [...this.map.values()];
    if (!filters) return all;
    return all.filter((item) => {
      if (filters.localRepositoryId && item.localRepositoryId !== filters.localRepositoryId) return false;
      if (filters.taskId && item.taskId !== filters.taskId) return false;
      return true;
    });
  }
  async getVersionSnapshotById(snapshotId: string): Promise<VersionSnapshot | null> {
    return this.map.get(snapshotId) ?? null;
  }
  async createVersionSnapshot(snapshot: VersionSnapshot): Promise<VersionSnapshot> {
    this.map.set(snapshot.id, snapshot);
    return snapshot;
  }
}

describe("VersioningService", () => {
  it("creates snapshots and computes diffs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cp-versioning-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "index.ts"), "export const n = 1;\n");

    const ids = ["snapshot-1", "snapshot-2"];
    const service = new VersioningService({
      store: new InMemoryVersionSnapshotStore(),
      now: () => new Date("2026-04-14T00:00:00.000Z"),
      idGenerator: () => ids.shift() ?? "snapshot-x"
    });

    const first = await service.createSnapshot(
      {
        localRepositoryId: "repo-local-1",
        repositoryPath: root,
        label: "before",
        trigger: "manual"
      },
      "tester"
    );

    await writeFile(path.join(root, "src", "index.ts"), "export const n = 2;\n");
    await writeFile(path.join(root, "src", "added.ts"), "export const added = true;\n");

    const second = await service.createSnapshot(
      {
        localRepositoryId: "repo-local-1",
        repositoryPath: root,
        label: "after",
        trigger: "manual"
      },
      "tester"
    );

    const diff = await service.diffSnapshots(first.id, second.id);
    expect(diff.changed.some((entry) => entry.path === "src/index.ts")).toBe(true);
    expect(diff.added).toContain("src/added.ts");

    await rm(root, { recursive: true, force: true });
  });
});
