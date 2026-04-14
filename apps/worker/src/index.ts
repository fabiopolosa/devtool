import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@cp/config";

const env = loadEnv();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const orchestrationQueueName = "orchestration-runs";
const autoresearchQueueName = "autoresearch-runs";

export const orchestrationQueue = new Queue(orchestrationQueueName, { connection });
export const autoresearchQueue = new Queue(autoresearchQueueName, { connection });

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

const shutdown = async () => {
  await Promise.all([orchestrationWorker.close(), autoresearchWorker.close()]);
  await Promise.all([orchestrationQueue.close(), autoresearchQueue.close()]);
  await connection.quit();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[worker] started");
