import { spawn } from "node:child_process";
import { Queue, Worker, Job, type QueueOptions } from "bullmq";
import { Redis } from "ioredis";
import { DEFAULT_TENANT_ID } from "@cp/db";
import { loadEnv } from "@cp/config";
import type { AgentRuntimeJobData } from "@cp/agents";
import type { LocalRepoJobData } from "@cp/local-repos";
import { BullMqJobExecutionQueue, DagRunner, InMemoryProviderRateLimiter } from "@cp/runner";
import { DagWorkerJobStore } from "./dag-job-store.js";

const env = loadEnv();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const orchestrationQueueName = "orchestration-runs";
const autoresearchQueueName = "autoresearch-runs";
const agentRuntimeQueueName = "agent-runtime-jobs";
const localRepoQueueName = "local-repo-jobs";
const dagQueuePrefix = "dag-job-execution";

const queueConnection: QueueOptions["connection"] = connection;

export const orchestrationQueue = new Queue(orchestrationQueueName, { connection });
export const autoresearchQueue = new Queue(autoresearchQueueName, { connection });
export const agentRuntimeQueue = new Queue<AgentRuntimeJobData>(agentRuntimeQueueName, { connection });
export const localRepoQueue = new Queue<LocalRepoJobData>(localRepoQueueName, { connection });

const orchestrationWorker = new Worker(
  orchestrationQueueName,
  async (job) => {
    // Placeholder for Ruflo orchestration runtime integration.
    console.log("[worker] orchestration job received", job.id, job.name);
  },
  { connection }
);

const autoresearchWorker = new Worker(
  autoresearchQueueName,
  async (job) => {
    // Placeholder for AutoResearch runner integration.
    console.log("[worker] autoresearch job received", job.id, job.name);
  },
  { connection }
);

const runAgentRuntimeCommand = async (
  job: Job<AgentRuntimeJobData>,
  data: AgentRuntimeJobData
): Promise<void> => {
  const startedAt = Date.now();
  await job.log(`[start] ${data.command} ${data.args.join(" ")}`);
  await job.updateProgress(10);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(data.command, data.args, {
      cwd: data.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, data.timeoutMs);

    const writeLines = async (prefix: string, chunk: Buffer) => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        await job.log(`${prefix}${line}`);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      void writeLines("", chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      void writeLines("[stderr] ", chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Agent runtime command timed out after ${data.timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Agent runtime command failed with code ${code ?? "unknown"} signal ${signal ?? "none"}`));
        return;
      }
      resolve();
    });
  });

  const elapsed = Date.now() - startedAt;
  await job.log(`[done] completed in ${elapsed}ms`);
  await job.updateProgress(100);
};

const runLocalRepoCommand = async (
  job: Job<LocalRepoJobData>,
  data: LocalRepoJobData
): Promise<void> => {
  const startedAt = Date.now();
  await job.log(`[start] ${data.command} ${data.args.join(" ")}`);
  await job.updateProgress(10);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(data.command, data.args, {
      cwd: data.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, 60000);

    const writeLines = async (prefix: string, chunk: Buffer) => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        await job.log(`${prefix}${line}`);
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      void writeLines("", chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      void writeLines("[stderr] ", chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Local repo command failed with code ${code ?? "unknown"} signal ${signal ?? "none"}`));
        return;
      }
      resolve();
    });
  });

  const elapsed = Date.now() - startedAt;
  await job.log(`[done] completed in ${elapsed}ms`);
  await job.updateProgress(100);
};

const agentRuntimeWorker = new Worker<AgentRuntimeJobData>(
  agentRuntimeQueueName,
  async (job) => {
    await runAgentRuntimeCommand(job, job.data);
  },
  { connection }
);

const localRepoWorker = new Worker<LocalRepoJobData>(
  localRepoQueueName,
  async (job) => {
    await runLocalRepoCommand(job, job.data);
  },
  { connection }
);

const jobStore = new DagWorkerJobStore();
const providerRateLimiter = new InMemoryProviderRateLimiter({
  resolveLimits: async (tenantId, provider) => jobStore.getProviderRateLimits(tenantId, provider)
});
const dagRunners = new Map<string, DagRunner>();
let tenantRefreshTimer: NodeJS.Timeout | null = null;

const startTenantRunner = async (tenantId: string): Promise<void> => {
  if (dagRunners.has(tenantId)) return;
  const queue = new BullMqJobExecutionQueue({
    queueName: `${dagQueuePrefix}:${tenantId}`,
    connection: queueConnection
  });
  const runner = new DagRunner({
    tenantId,
    store: jobStore,
    queue,
    maxConcurrent: 5,
    pollIntervalMs: 1000,
    jobTimeoutMs: 10 * 60_000,
    rateLimiter: providerRateLimiter
  });
  await runner.start();
  dagRunners.set(tenantId, runner);
  console.log("[worker] dag runner started", { tenantId });
};

const ensureTenantRunners = async (): Promise<void> => {
  const tenants = await jobStore.listTenants();
  const tenantIds = new Set<string>([DEFAULT_TENANT_ID, ...tenants.map((tenant) => tenant.id)]);
  for (const tenantId of tenantIds) {
    await startTenantRunner(tenantId);
  }
};

const startDagRunners = async (): Promise<void> => {
  await ensureTenantRunners();
  tenantRefreshTimer = setInterval(() => {
    void ensureTenantRunners().catch((error) => {
      console.error("[worker] tenant runner refresh failed", error);
    });
  }, 30_000);
};

const stopDagRunners = async (): Promise<void> => {
  if (tenantRefreshTimer) {
    clearInterval(tenantRefreshTimer);
    tenantRefreshTimer = null;
  }

  for (const [tenantId, runner] of dagRunners.entries()) {
    await runner.stop();
    dagRunners.delete(tenantId);
  }
};

const shutdown = async () => {
  await stopDagRunners();
  await Promise.all([
    orchestrationWorker.close(),
    autoresearchWorker.close(),
    agentRuntimeWorker.close(),
    localRepoWorker.close()
  ]);
  await Promise.all([
    orchestrationQueue.close(),
    autoresearchQueue.close(),
    agentRuntimeQueue.close(),
    localRepoQueue.close()
  ]);
  await jobStore.close();
  await connection.quit();
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

void startDagRunners()
  .then(() => {
    console.log("[worker] started");
  })
  .catch((error) => {
    console.error("[worker] startup failed", error);
    process.exitCode = 1;
  });
