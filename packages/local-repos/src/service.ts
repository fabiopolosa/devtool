import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { LocalRepository } from "@cp/domain";

const execFileAsync = promisify(execFile);

export interface LocalRepositoryStore {
  listLocalRepositories(): Promise<LocalRepository[]>;
  getLocalRepositoryById(localRepositoryId: string): Promise<LocalRepository | null>;
  createLocalRepository(localRepository: LocalRepository): Promise<LocalRepository>;
  updateLocalRepository(localRepositoryId: string, patch: Partial<LocalRepository>): Promise<LocalRepository>;
  deleteLocalRepository(localRepositoryId: string): Promise<void>;
}

export interface LocalRepoFileEntry {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  sizeBytes?: number;
}

export interface LocalRepoCommitEntry {
  sha: string;
  author: string;
  date: string;
  subject: string;
}

export interface LocalRepositoryCreateInput {
  name: string;
  rootPath: string;
  description?: string;
  status?: LocalRepository["status"];
}

export interface LocalRepoJobData {
  localRepositoryId: string;
  operation: "scan" | "git_history";
  command: string;
  args: string[];
  cwd: string;
  requestedAt: string;
}

export interface LocalRepoJobReference {
  jobId: string;
  localRepositoryId: string;
  operation: LocalRepoJobData["operation"];
  command: string;
  args: string[];
  createdAt: string;
}

export interface LocalRepoJobSnapshot {
  jobId: string;
  state: string;
  progress: number;
  logs: string[];
  failedReason?: string;
}

export interface LocalRepoJobScheduler {
  schedule(job: LocalRepoJobData): Promise<LocalRepoJobReference>;
  getJob(jobId: string): Promise<LocalRepoJobSnapshot | null>;
  close?(): Promise<void>;
}

export class BullmqLocalRepoJobScheduler implements LocalRepoJobScheduler {
  private readonly connection: Redis;
  private readonly queue: Queue<LocalRepoJobData>;

  constructor(redisUrl: string, queueName = "local-repo-jobs") {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<LocalRepoJobData>(queueName, { connection: this.connection });
  }

  async schedule(job: LocalRepoJobData): Promise<LocalRepoJobReference> {
    const queued = await this.queue.add(job.operation, job, {
      removeOnComplete: 100,
      removeOnFail: 200
    });

    return {
      jobId: queued.id ? String(queued.id) : randomUUID(),
      localRepositoryId: job.localRepositoryId,
      operation: job.operation,
      command: job.command,
      args: job.args,
      createdAt: job.requestedAt
    };
  }

  async getJob(jobId: string): Promise<LocalRepoJobSnapshot | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const resolvedJobId = job.id ? String(job.id) : jobId;
    const [state, logs] = await Promise.all([job.getState(), this.queue.getJobLogs(resolvedJobId, 0, 200)]);
    const progress = typeof job.progress === "number" ? job.progress : 0;
    return {
      jobId,
      state,
      progress,
      logs: logs.logs,
      ...(job.failedReason ? { failedReason: job.failedReason } : {})
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

export class InMemoryLocalRepoJobScheduler implements LocalRepoJobScheduler {
  private readonly jobs = new Map<string, LocalRepoJobSnapshot>();

  async schedule(job: LocalRepoJobData): Promise<LocalRepoJobReference> {
    const jobId = randomUUID();
    this.jobs.set(jobId, {
      jobId,
      state: "completed",
      progress: 100,
      logs: [`[queued] ${job.command} ${job.args.join(" ")}`, "[done] simulated in-memory scheduler"]
    });
    return {
      jobId,
      localRepositoryId: job.localRepositoryId,
      operation: job.operation,
      command: job.command,
      args: job.args,
      createdAt: job.requestedAt
    };
  }

  async getJob(jobId: string): Promise<LocalRepoJobSnapshot | null> {
    return this.jobs.get(jobId) ?? null;
  }
}

export interface LocalRepositoriesServiceOptions {
  store: LocalRepositoryStore;
  now?: () => Date;
  idGenerator?: () => string;
  scheduler?: LocalRepoJobScheduler;
  maxReadBytes?: number;
}

export class LocalRepositoriesService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly maxReadBytes: number;

  constructor(private readonly options: LocalRepositoriesServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.maxReadBytes = options.maxReadBytes ?? 500_000;
  }

  async listLocalRepositories(): Promise<LocalRepository[]> {
    return this.options.store.listLocalRepositories();
  }

  async getLocalRepository(localRepositoryId: string): Promise<LocalRepository | null> {
    return this.options.store.getLocalRepositoryById(localRepositoryId);
  }

  async createLocalRepository(input: LocalRepositoryCreateInput, actor: string): Promise<LocalRepository> {
    const rootPath = path.resolve(input.rootPath.trim());
    const stats = await stat(rootPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${rootPath}`);
    }
    const nowIso = this.now().toISOString();
    const gitMeta = await this.inspectGit(rootPath);
    const indexedFileCount = await this.countFiles(rootPath, 20_000);
    const created: LocalRepository = {
      id: this.idGenerator(),
      name: input.name.trim(),
      rootPath,
      description: input.description?.trim() ?? "Local repository",
      status: input.status ?? "active",
      detectedGit: gitMeta.detectedGit,
      ...(gitMeta.currentBranch ? { currentBranch: gitMeta.currentBranch } : {}),
      ...(gitMeta.lastCommitSha ? { lastCommitSha: gitMeta.lastCommitSha } : {}),
      indexedFileCount,
      lastScannedAt: nowIso,
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    };
    return this.options.store.createLocalRepository(created);
  }

  async updateLocalRepository(
    localRepositoryId: string,
    patch: Partial<LocalRepositoryCreateInput>,
    actor: string
  ): Promise<LocalRepository> {
    let resolvedRootPath: string | undefined;
    if (patch.rootPath) {
      resolvedRootPath = path.resolve(patch.rootPath.trim());
      const stats = await stat(resolvedRootPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${resolvedRootPath}`);
      }
    }
    return this.options.store.updateLocalRepository(localRepositoryId, {
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.description ? { description: patch.description.trim() } : {}),
      ...(resolvedRootPath ? { rootPath: resolvedRootPath } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      updatedAt: this.now().toISOString(),
      updatedBy: actor
    });
  }

  async deleteLocalRepository(localRepositoryId: string): Promise<void> {
    await this.options.store.deleteLocalRepository(localRepositoryId);
  }

  async listFiles(localRepositoryId: string, relativePath = "."): Promise<LocalRepoFileEntry[]> {
    const repo = await this.requireRepository(localRepositoryId);
    const targetPath = this.resolveWithinRoot(repo.rootPath, relativePath);
    const entries = await readdir(targetPath, { withFileTypes: true });

    const listed: LocalRepoFileEntry[] = [];
    for (const entry of entries) {
      const fullPath = path.join(targetPath, entry.name);
      const relPath = path.relative(repo.rootPath, fullPath) || ".";
      if (entry.isDirectory()) {
        listed.push({ name: entry.name, relativePath: relPath, kind: "directory" });
        continue;
      }
      const entryStats = await stat(fullPath);
      listed.push({ name: entry.name, relativePath: relPath, kind: "file", sizeBytes: entryStats.size });
    }

    return listed.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  async readFileContent(localRepositoryId: string, relativePath: string): Promise<{ content: string; truncated: boolean }> {
    const repo = await this.requireRepository(localRepositoryId);
    const fullPath = this.resolveWithinRoot(repo.rootPath, relativePath);
    const entryStats = await stat(fullPath);
    if (!entryStats.isFile()) {
      throw new Error(`Not a file: ${relativePath}`);
    }
    const content = await readFile(fullPath, "utf8");
    if (Buffer.byteLength(content, "utf8") <= this.maxReadBytes) {
      return { content, truncated: false };
    }
    const truncatedContent = Buffer.from(content, "utf8").subarray(0, this.maxReadBytes).toString("utf8");
    return { content: truncatedContent, truncated: true };
  }

  async getGitHistory(localRepositoryId: string, limit = 30): Promise<LocalRepoCommitEntry[]> {
    const repo = await this.requireRepository(localRepositoryId);
    if (!repo.detectedGit) {
      return [];
    }
    try {
      const { stdout } = await execFileAsync("git", [
        "-C",
        repo.rootPath,
        "log",
        `-n`,
        `${Math.max(1, Math.min(limit, 200))}`,
        "--date=iso",
        "--pretty=format:%H|%an|%ad|%s"
      ]);
      return stdout
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sha, author, date, ...subjectParts] = line.split("|");
          return {
            sha: sha ?? "",
            author: author ?? "unknown",
            date: date ?? "",
            subject: subjectParts.join("|")
          };
        })
        .filter((entry) => entry.sha.length > 0);
    } catch {
      return [];
    }
  }

  async scanRepository(localRepositoryId: string, actor: string): Promise<LocalRepository> {
    const repo = await this.requireRepository(localRepositoryId);
    const nowIso = this.now().toISOString();
    const gitMeta = await this.inspectGit(repo.rootPath);
    const indexedFileCount = await this.countFiles(repo.rootPath, 50_000);
    return this.options.store.updateLocalRepository(localRepositoryId, {
      detectedGit: gitMeta.detectedGit,
      ...(gitMeta.currentBranch ? { currentBranch: gitMeta.currentBranch } : {}),
      ...(gitMeta.lastCommitSha ? { lastCommitSha: gitMeta.lastCommitSha } : {}),
      indexedFileCount,
      lastScannedAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }

  async scheduleScan(localRepositoryId: string): Promise<LocalRepoJobReference> {
    const repo = await this.requireRepository(localRepositoryId);
    if (!this.options.scheduler) {
      throw new Error("Local repository scheduler is not configured");
    }
    return this.options.scheduler.schedule({
      localRepositoryId,
      operation: "scan",
      command: "sh",
      args: ["-lc", "find . -type f | wc -l"],
      cwd: repo.rootPath,
      requestedAt: this.now().toISOString()
    });
  }

  async getJob(jobId: string): Promise<LocalRepoJobSnapshot | null> {
    if (!this.options.scheduler) {
      return null;
    }
    return this.options.scheduler.getJob(jobId);
  }

  private async requireRepository(localRepositoryId: string): Promise<LocalRepository> {
    const repo = await this.options.store.getLocalRepositoryById(localRepositoryId);
    if (!repo) {
      throw new Error(`Local repository not found: ${localRepositoryId}`);
    }
    return repo;
  }

  private resolveWithinRoot(rootPath: string, relativePath: string): string {
    const candidate = path.resolve(rootPath, relativePath || ".");
    if (candidate === rootPath) {
      return candidate;
    }
    const normalizedRoot = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
    if (!candidate.startsWith(normalizedRoot)) {
      throw new Error("Path escapes repository root");
    }
    return candidate;
  }

  private async inspectGit(rootPath: string): Promise<{
    detectedGit: boolean;
    currentBranch?: string;
    lastCommitSha?: string;
  }> {
    const gitDir = path.join(rootPath, ".git");
    if (!existsSync(gitDir)) {
      return { detectedGit: false };
    }

    let currentBranch: string | undefined;
    let lastCommitSha: string | undefined;

    try {
      const { stdout } = await execFileAsync("git", ["-C", rootPath, "rev-parse", "--abbrev-ref", "HEAD"]);
      currentBranch = stdout.trim() || undefined;
    } catch {
      currentBranch = undefined;
    }

    try {
      const { stdout } = await execFileAsync("git", ["-C", rootPath, "rev-parse", "HEAD"]);
      lastCommitSha = stdout.trim() || undefined;
    } catch {
      lastCommitSha = undefined;
    }

    return {
      detectedGit: true,
      ...(currentBranch ? { currentBranch } : {}),
      ...(lastCommitSha ? { lastCommitSha } : {})
    };
  }

  private async countFiles(rootPath: string, maxFiles: number): Promise<number> {
    const queue = [rootPath];
    let count = 0;

    while (queue.length > 0) {
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
        if (entry.isFile()) {
          count += 1;
          if (count >= maxFiles) {
            return count;
          }
        }
      }
    }

    return count;
  }
}
