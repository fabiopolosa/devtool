import { Queue, Worker, type QueueOptions, type WorkerOptions } from "bullmq";
import type { JobExecutionQueue, JobQueuePayload } from "./types.js";

export interface BullMqRunnerQueueOptions {
  queueName: string;
  connection: QueueOptions["connection"];
}

export class BullMqJobExecutionQueue implements JobExecutionQueue {
  private readonly queue: Queue<JobQueuePayload>;
  private worker: Worker<JobQueuePayload> | null = null;

  constructor(options: BullMqRunnerQueueOptions) {
    this.queue = new Queue<JobQueuePayload>(options.queueName, {
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
      jobId: `${payload.tenantId}:${payload.jobId}`
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
