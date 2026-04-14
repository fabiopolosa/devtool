import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { VersionSnapshot } from "@cp/domain";

export interface VersionSnapshotStore {
  listVersionSnapshots(filters?: { localRepositoryId?: string; taskId?: string }): Promise<VersionSnapshot[]>;
  getVersionSnapshotById(snapshotId: string): Promise<VersionSnapshot | null>;
  createVersionSnapshot(snapshot: VersionSnapshot): Promise<VersionSnapshot>;
}

export interface CreateVersionSnapshotInput {
  localRepositoryId: string;
  repositoryPath: string;
  label: string;
  trigger: VersionSnapshot["trigger"];
  taskId?: string;
  maxFiles?: number;
  maxFileBytes?: number;
}

export interface SnapshotDiffResult {
  leftSnapshotId: string;
  rightSnapshotId: string;
  added: string[];
  removed: string[];
  changed: Array<{
    path: string;
    beforeHash: string;
    afterHash: string;
  }>;
}

export interface VersioningServiceOptions {
  store: VersionSnapshotStore;
  now?: () => Date;
  idGenerator?: () => string;
}

export class VersioningService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(private readonly options: VersioningServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  async listSnapshots(filters?: { localRepositoryId?: string; taskId?: string }): Promise<VersionSnapshot[]> {
    return this.options.store.listVersionSnapshots(filters);
  }

  async getSnapshot(snapshotId: string): Promise<VersionSnapshot | null> {
    return this.options.store.getVersionSnapshotById(snapshotId);
  }

  async createSnapshot(input: CreateVersionSnapshotInput, actor: string): Promise<VersionSnapshot> {
    const nowIso = this.now().toISOString();
    const files = await this.collectFiles(
      input.repositoryPath,
      input.maxFiles ?? 400,
      input.maxFileBytes ?? 200_000
    );
    return this.options.store.createVersionSnapshot({
      id: this.idGenerator(),
      localRepositoryId: input.localRepositoryId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      label: input.label.trim(),
      trigger: input.trigger,
      files,
      metadata: {
        fileCount: files.length
      },
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }

  async diffSnapshots(leftSnapshotId: string, rightSnapshotId: string): Promise<SnapshotDiffResult> {
    const [left, right] = await Promise.all([
      this.options.store.getVersionSnapshotById(leftSnapshotId),
      this.options.store.getVersionSnapshotById(rightSnapshotId)
    ]);
    if (!left || !right) {
      throw new Error("Both snapshots must exist to compute a diff");
    }

    const leftMap = new Map(left.files.map((file) => [file.path, file]));
    const rightMap = new Map(right.files.map((file) => [file.path, file]));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: SnapshotDiffResult["changed"] = [];

    for (const [filePath, rightFile] of rightMap) {
      const leftFile = leftMap.get(filePath);
      if (!leftFile) {
        added.push(filePath);
        continue;
      }
      if (leftFile.contentHash !== rightFile.contentHash) {
        changed.push({
          path: filePath,
          beforeHash: leftFile.contentHash,
          afterHash: rightFile.contentHash
        });
      }
    }

    for (const [filePath] of leftMap) {
      if (!rightMap.has(filePath)) {
        removed.push(filePath);
      }
    }

    return {
      leftSnapshotId,
      rightSnapshotId,
      added: added.sort((a, b) => a.localeCompare(b)),
      removed: removed.sort((a, b) => a.localeCompare(b)),
      changed: changed.sort((a, b) => a.path.localeCompare(b.path))
    };
  }

  private async collectFiles(rootPath: string, maxFiles: number, maxFileBytes: number): Promise<VersionSnapshot["files"]> {
    const queue = [rootPath];
    const files: VersionSnapshot["files"] = [];
    const normalizedRoot = path.resolve(rootPath);

    while (queue.length > 0 && files.length < maxFiles) {
      const current = queue.shift();
      if (!current) continue;
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const relativePath = path.relative(normalizedRoot, fullPath);
        const content = await readFile(fullPath, "utf8");
        const contentBuffer = Buffer.from(content, "utf8");
        const normalized = contentBuffer.subarray(0, maxFileBytes);
        const normalizedContent = normalized.toString("utf8");
        files.push({
          path: relativePath,
          contentHash: createHash("sha256").update(normalized).digest("hex"),
          content: normalizedContent
        });
        if (files.length >= maxFiles) {
          break;
        }
      }
    }

    return files.sort((left, right) => left.path.localeCompare(right.path));
  }
}
