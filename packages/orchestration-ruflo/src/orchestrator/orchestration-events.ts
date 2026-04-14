import type { OrchestrationRunEvent, OrchestrationRunStatus } from "../types/run.js";

export interface EventFactoryInput {
  runId: string;
  taskId: string;
  actor: string;
  message: string;
  eventType: OrchestrationRunEvent["eventType"];
  status: OrchestrationRunStatus;
  stepId?: string;
  artifact?: OrchestrationRunEvent["artifact"];
  budgetSnapshot?: OrchestrationRunEvent["budgetSnapshot"];
  metadata?: Record<string, unknown>;
}

export const createOrchestrationEvent = (input: EventFactoryInput): OrchestrationRunEvent => ({
  id: crypto.randomUUID(),
  runId: input.runId,
  taskId: input.taskId,
  eventType: input.eventType,
  status: input.status,
  actor: input.actor,
  message: input.message,
  ...(input.stepId ? { stepId: input.stepId } : {}),
  ...(input.artifact ? { artifact: input.artifact } : {}),
  ...(input.budgetSnapshot ? { budgetSnapshot: input.budgetSnapshot } : {}),
  createdAt: new Date().toISOString(),
  metadata: input.metadata ?? {}
});
