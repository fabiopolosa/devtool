import type { Job } from "@cp/domain";

export const usePathParam = (segmentFromEnd = 1): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const pathname = window.location.pathname;
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - segmentFromEnd];
};

export type AsyncJobStatus = "pending" | "running" | "waiting_user" | "done" | "error";

export const toAsyncJobStatus = (job: Pick<Job, "status">): AsyncJobStatus => {
  if (job.status === "idle") return "pending";
  if (job.status === "running") return "running";
  if (job.status === "waiting_user") return "waiting_user";
  if (job.status === "done") return "done";
  return "error";
};

export const isAsyncJobTerminal = (status: AsyncJobStatus): boolean =>
  status === "done" || status === "error" || status === "waiting_user";

export const asyncJobTone = (status: AsyncJobStatus): "default" | "accent" | "warn" | "good" | "bad" => {
  if (status === "pending" || status === "running") return "accent";
  if (status === "waiting_user") return "warn";
  if (status === "done") return "good";
  return "bad";
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const readJobErrorMessage = (job: Pick<Job, "payload">): string | undefined => {
  const payload = asRecord(job.payload);
  const lastError = asRecord(payload?.lastError);
  const message = lastError?.message;
  return typeof message === "string" && message.trim().length > 0 ? message.trim() : undefined;
};

export type JobRuntimeLogLine = {
  timestamp: string;
  event: "start" | "retry" | "error" | "completed" | "status";
  message: string;
};

export const localWorkerPickupTimeoutMs = 5_000;
export const localWorkerPickupSuggestion =
  "No worker picked up this job. Start a worker (`devtools worker start`) or switch execution mode.";

export const shouldFailFastNoWorker = (
  job: Pick<Job, "status" | "createdAt" | "startedAt">,
  runtimeLogs: readonly JobRuntimeLogLine[],
  nowMs = Date.now(),
  thresholdMs = localWorkerPickupTimeoutMs
): boolean => {
  if (toAsyncJobStatus(job) !== "pending") return false;
  if (typeof job.startedAt === "string" && job.startedAt.trim().length > 0) return false;
  if (runtimeLogs.length > 0) return false;
  const createdAtMs = Date.parse(job.createdAt);
  if (!Number.isFinite(createdAtMs)) return false;
  return nowMs - createdAtMs >= thresholdMs;
};
