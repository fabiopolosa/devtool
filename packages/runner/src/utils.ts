import type { Job } from "@cp/domain";

export const nowIso = (): string => new Date().toISOString();

export const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const toText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || value.name;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

export const toNumberOr = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
};

export const mergePayload = (
  currentPayload: Record<string, unknown> | undefined,
  patchPayload: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!currentPayload && !patchPayload) return undefined;
  return {
    ...(currentPayload ?? {}),
    ...(patchPayload ?? {})
  };
};

export const dependenciesCompleted = (job: Job, byId: Map<string, Job>): boolean =>
  (job.dependencies ?? []).every((dependencyId) => byId.get(dependencyId)?.status === "done");

export const sortByPriorityAndCreatedAt = (jobs: Job[]): Job[] =>
  [...jobs].sort((left, right) => {
    if (left.priority !== right.priority) return right.priority - left.priority;
    return left.createdAt.localeCompare(right.createdAt);
  });
