import type { TaskState } from "@cp/domain";

const allowedTransitions: Record<TaskState, TaskState[]> = {
  draft: ["proposed", "archived", "canceled"],
  proposed: ["approved", "archived", "canceled"],
  approved: ["queued", "waiting_for_approval", "archived", "canceled"],
  queued: ["running", "waiting_for_approval", "canceled"],
  running: ["waiting_for_research", "waiting_for_debug", "verification_failed", "completed", "canceled"],
  waiting_for_research: ["running", "waiting_for_approval", "canceled"],
  waiting_for_debug: ["running", "verification_failed", "canceled"],
  waiting_for_approval: ["approved", "queued", "canceled"],
  verification_failed: ["waiting_for_debug", "running", "archived", "canceled"],
  completed: ["archived"],
  archived: [],
  canceled: []
};

export const canTransitionTaskState = (from: TaskState, to: TaskState): boolean => allowedTransitions[from].includes(to);

export const transitionTaskState = (from: TaskState, to: TaskState): TaskState => {
  if (!canTransitionTaskState(from, to)) {
    throw new Error(`Invalid task state transition: ${from} -> ${to}`);
  }

  return to;
};

export const getAllowedTaskTransitions = (state: TaskState): TaskState[] => [...allowedTransitions[state]];
