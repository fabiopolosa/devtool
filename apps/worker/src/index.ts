import { spawn } from "node:child_process";
import { Job, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@cp/config";
import type { AgentRuntimeJobData } from "@cp/agents";
import type { LocalRepoJobData } from "@cp/local-repos";

const env = loadEnv();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const orchestrationQueueName = "orchestration-runs";
const autoresearchQueueName = "autoresearch-runs";
const agentRuntimeQueueName = "agent-runtime-jobs";
const localRepoQueueName = "local-repo-jobs";

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

const shutdown = async () => {
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
  await connection.quit();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[worker] started");
