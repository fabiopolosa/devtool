import type { Job } from "@cp/domain";
import type { SchedulerOptions } from "./types.js";
import { dependenciesCompleted, nowIso, sortByPriorityAndCreatedAt } from "./utils.js";

export const getExecutableJobs = (jobs: Job[]): Job[] =>
  sortByPriorityAndCreatedAt(jobs.filter((job) => job.status === "idle" && job.ready));

export class JobScheduler {
  private readonly tenantId: string;
  private readonly store: SchedulerOptions["store"];
  private readonly logger: SchedulerOptions["logger"];
  private readonly maxConcurrent: number;
  private readonly jobTimeoutMs: number;

  constructor(options: SchedulerOptions) {
    this.tenantId = options.tenantId;
    this.store = options.store;
    this.logger = options.logger;
    this.maxConcurrent = Math.max(1, options.maxConcurrent);
    this.jobTimeoutMs = Math.max(10_000, options.jobTimeoutMs);
  }

  async recoverTimedOutRunningJobs(): Promise<number> {
    if (this.store.recoverTimedOutRunningJobs) {
      const recovered = await this.store.recoverTimedOutRunningJobs(this.tenantId, this.jobTimeoutMs);
      if (recovered > 0) {
        this.logger.warn("recovered timed out jobs", {
          tenantId: this.tenantId,
          recovered,
          timeoutMs: this.jobTimeoutMs
        });
      }
      return recovered;
    }

    const jobs = await this.store.listJobs(this.tenantId);
    const now = Date.now();
    let recovered = 0;

    for (const job of jobs) {
      if (job.status !== "running" || !job.startedAt) continue;
      const elapsed = now - Date.parse(job.startedAt);
      if (!Number.isFinite(elapsed) || elapsed <= this.jobTimeoutMs) continue;
      await this.store.updateJob(job.id, this.tenantId, {
        status: "idle",
        ready: true,
        actionRequired: false,
        updatedAt: nowIso()
      });
      recovered += 1;
    }

    return recovered;
  }

  async reconcileReadiness(): Promise<void> {
    const jobs = await this.store.listJobs(this.tenantId);
    const byId = new Map(jobs.map((job) => [job.id, job]));

    for (const job of jobs) {
      const expectedDependsOnCount = job.dependencies.length;
      const expectedReady = job.status === "idle" && dependenciesCompleted(job, byId);
      if (job.dependsOnCount !== expectedDependsOnCount || job.ready !== expectedReady) {
        await this.store.updateJob(job.id, this.tenantId, {
          dependsOnCount: expectedDependsOnCount,
          ready: expectedReady,
          updatedAt: nowIso()
        });
      }
    }
  }

  async claimNextBatch(inFlightCount: number): Promise<Job[]> {
    const availableSlots = Math.max(0, this.maxConcurrent - inFlightCount);
    if (availableSlots === 0) return [];

    if (this.store.claimExecutableJobs) {
      const claimed = await this.store.claimExecutableJobs(this.tenantId, availableSlots);
      return sortByPriorityAndCreatedAt(claimed);
    }

    // Fallback path for stores that do not support atomic claim.
    const jobs = await this.store.listJobs(this.tenantId);
    const selected = getExecutableJobs(jobs).slice(0, availableSlots);
    const claimed: Job[] = [];

    for (const job of selected) {
      const current = await this.store.getJob(job.id, this.tenantId);
      if (!current || current.status !== "idle" || !current.ready) continue;
      const locked = await this.store.updateJob(job.id, this.tenantId, {
        status: "running",
        ready: false,
        actionRequired: false,
        ...(current.startedAt ? {} : { startedAt: nowIso() }),
        updatedAt: nowIso()
      });
      claimed.push(locked);
    }

    return claimed;
  }
}
