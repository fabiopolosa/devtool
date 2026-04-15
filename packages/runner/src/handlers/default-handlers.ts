import type { Job } from "@cp/domain";
import type { JobExecutionResult } from "../types.js";
import { asRecord, nowIso } from "../utils.js";

export const defaultIngestionHandler = async (job: Job): Promise<JobExecutionResult> => {
  const payload = asRecord(job.payload);
  const input = asRecord(payload?.input);
  return {
    nextStatus: "done",
    payloadPatch: {
      output: {
        stage: "ingestion",
        at: nowIso(),
        accepted: true,
        input
      }
    }
  };
};

export const defaultProcessingHandler = async (job: Job): Promise<JobExecutionResult> => {
  const payload = asRecord(job.payload);
  return {
    nextStatus: "done",
    payloadPatch: {
      output: {
        stage: "processing",
        at: nowIso(),
        summary: `Processed job ${job.id}`,
        input: payload?.input ?? null
      }
    }
  };
};

export const defaultDeploymentHandler = async (job: Job): Promise<JobExecutionResult> => ({
  nextStatus: "done",
  payloadPatch: {
    output: {
      stage: "deployment",
      at: nowIso(),
      target: job.resourceId ?? "unknown"
    }
  }
});
