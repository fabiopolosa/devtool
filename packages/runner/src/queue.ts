import { Queue, Worker, type QueueOptions, type WorkerOptions } from "bullmq";
import type { JobExecutionQueue, JobQueuePayload } from "./types.js";

export interface BullMqRunnerQueueOptions {
  queueName: string;
  connection: QueueOptions["connection"];
}

const bullMqSafeToken = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

export const toBullMqSafeQueueName = (value: string): string =>
  value.includes(":") ? value.split(":").map(bullMqSafeToken).join("__") : value;

export const toBullMqSafeJobId = (payload: JobQueuePayload): string =>
  [payload.tenantId, payload.jobId].map(bullMqSafeToken).join("__");

export class BullMqJobExecutionQueue implements JobExecutionQueue {
  private readonly queue: Queue<JobQueuePayload>;
  private worker: Worker<JobQueuePayload> | null = null;

  constructor(options: BullMqRunnerQueueOptions) {
    this.queue = new Queue<JobQueuePayload>(toBullMqSafeQueueName(options.queueName), {
      connection: options.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 50
      }
    });
    this.connection = options.connection;
  }

  private readonly connection: WorkerOptions["connection"];

  async enqueue(payload: JobQueuePayload): Promise<void> {
    await this.queue.add("execute-job", payload, {
      jobId: toBullMqSafeJobId(payload)
    });
  }

  async startWorker(
    handler: (payload: JobQueuePayload) => Promise<void>,
    concurrency: number
  ): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker<JobQueuePayload>(
      this.queue.name,
      async (job) => {
        await handler(job.data);
      },
      {
        concurrency: Math.max(1, concurrency),
        connection: this.connection
      }
    );
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }
}
