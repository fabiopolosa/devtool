import type { TaskRunStatus } from "@cp/domain";

const allowedTransitions: Record<TaskRunStatus, TaskRunStatus[]> = {
  queued: ["running", "canceled", "failed"],
  running: ["waiting", "completed", "failed", "canceled"],
  waiting: ["running", "failed", "canceled", "completed"],
  failed: ["queued", "canceled"],
  completed: ["canceled"],
  canceled: []
};

export const canTransitionTaskRunStatus = (from: TaskRunStatus, to: TaskRunStatus): boolean =>
  allowedTransitions[from].includes(to);

export const transitionTaskRunStatus = (from: TaskRunStatus, to: TaskRunStatus): TaskRunStatus => {
  if (!canTransitionTaskRunStatus(from, to)) {
    throw new Error(`Invalid task run transition: ${from} -> ${to}`);
  }

  return to;
};

export const getAllowedTaskRunTransitions = (status: TaskRunStatus): TaskRunStatus[] => [...allowedTransitions[status]];
