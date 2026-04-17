import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LocalRepository } from "@cp/domain";
import { describe, expect, it } from "vitest";
import {
  InMemoryLocalRepoJobScheduler,
  LocalRepositoriesService,
  UnavailableLocalRepoJobScheduler,
  type LocalRepositoryStore
} from "./service.js";

class InMemoryLocalRepoStore implements LocalRepositoryStore {
  private readonly map = new Map<string, LocalRepository>();

  async listLocalRepositories(): Promise<LocalRepository[]> {
    return [...this.map.values()];
  }
  async getLocalRepositoryById(localRepositoryId: string): Promise<LocalRepository | null> {
    return this.map.get(localRepositoryId) ?? null;
  }
  async createLocalRepository(localRepository: LocalRepository): Promise<LocalRepository> {
    this.map.set(localRepository.id, localRepository);
    return localRepository;
  }
  async updateLocalRepository(
    localRepositoryId: string,
    patch: Partial<LocalRepository>
  ): Promise<LocalRepository> {
    const existing = this.map.get(localRepositoryId);
    if (!existing) throw new Error("missing");
    const next = { ...existing, ...patch };
    this.map.set(localRepositoryId, next);
    return next;
  }
  async deleteLocalRepository(localRepositoryId: string): Promise<void> {
    this.map.delete(localRepositoryId);
  }
}

describe("LocalRepositoriesService", () => {
  it("creates, scans, lists files and reads content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cp-local-repo-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "README.md"), "# Demo repo\n");
    await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;\n");

    const service = new LocalRepositoriesService({
      store: new InMemoryLocalRepoStore(),
      now: () => new Date("2026-04-14T00:00:00.000Z"),
      idGenerator: () => "repo-local-1",
      scheduler: new InMemoryLocalRepoJobScheduler()
    });

    const repo = await service.createLocalRepository(
      {
        name: "demo",
        rootPath: root
      },
      "tester"
    );
    expect(repo.id).toBe("repo-local-1");

    const entries = await service.listFiles(repo.id, ".");
    expect(entries.some((entry) => entry.name === "README.md")).toBe(true);

    const file = await service.readFileContent(repo.id, "README.md");
    expect(file.content).toContain("Demo repo");

    const scanned = await service.scanRepository(repo.id, "tester");
    expect(scanned.indexedFileCount).toBeGreaterThan(0);

    const scheduled = await service.scheduleScan(repo.id);
    expect(scheduled.operation).toBe("scan");
    const job = await service.getJob(scheduled.jobId);
    expect(job?.state).toBe("completed");

    await rm(root, { recursive: true, force: true });
  });

  it("fails explicitly when the scan scheduler is unavailable", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cp-local-repo-unavailable-"));
    await writeFile(path.join(root, "README.md"), "# Demo repo\n");

    const service = new LocalRepositoriesService({
      store: new InMemoryLocalRepoStore(),
      now: () => new Date("2026-04-14T00:00:00.000Z"),
      idGenerator: () => "repo-local-unavailable",
      scheduler: new UnavailableLocalRepoJobScheduler()
    });

    const repo = await service.createLocalRepository(
      {
        name: "demo",
        rootPath: root
      },
      "tester"
    );

    await expect(service.scheduleScan(repo.id)).rejects.toThrow(
      "Local repository job scheduler requires REDIS_URL"
    );

    await rm(root, { recursive: true, force: true });
  });

  it("rejects symlink roots and escaped repository paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cp-local-repo-root-"));
    const alias = path.join(tmpdir(), `cp-local-repo-alias-${Date.now()}`);
    const outside = await mkdtemp(path.join(tmpdir(), "cp-local-repo-outside-"));
    await writeFile(path.join(outside, "secret.txt"), "shh\n");

    const service = new LocalRepositoriesService({
      store: new InMemoryLocalRepoStore(),
      now: () => new Date("2026-04-14T00:00:00.000Z"),
      idGenerator: () => "repo-local-escape",
      scheduler: new InMemoryLocalRepoJobScheduler()
    });

    try {
      await symlink(root, alias, "dir");
      await expect(
        service.createLocalRepository(
          {
            name: "demo",
            rootPath: alias
          },
          "tester"
        )
      ).rejects.toMatchObject({
        name: "LocalRepositoryPathValidationError",
        validation: {
          reason: "symlink_not_allowed"
        }
      });

      const repo = await service.createLocalRepository(
        {
          name: "demo",
          rootPath: root
        },
        "tester"
      );
      await symlink(outside, path.join(root, "escape"), "dir");

      await expect(service.readFileContent(repo.id, "escape/secret.txt")).rejects.toMatchObject({
        name: "LocalRepositoryPathValidationError",
        validation: {
          reason: "path_escape"
        }
      });
    } finally {
      await rm(alias, { force: true }).catch(() => undefined);
      await rm(outside, { recursive: true, force: true }).catch(() => undefined);
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
