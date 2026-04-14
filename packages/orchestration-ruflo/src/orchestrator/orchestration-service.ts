import { taskStates, type Task } from "@cp/domain";
import { canTransitionTaskState, transitionTaskState } from "../state-machine/task-state-machine.js";
import type { BudgetEnforcementHook, EscalationHook } from "../ports/policy-hooks.js";
import type { RunEventLogger } from "../ports/event-logger.js";
import type { WorkflowStore } from "../ports/workflow-store.js";
import type { BudgetLimits, OrchestrationRunEvent, OrchestrationRunRecord } from "../types/run.js";
import { createOrchestrationEvent } from "./orchestration-events.js";

export interface OrchestrationServiceDependencies {
  workflowStore: WorkflowStore;
  eventLogger: RunEventLogger;
  budgetHook?: BudgetEnforcementHook;
  escalationHook?: EscalationHook;
}

export interface RunStartInput {
  runId: string;
  taskId: string;
  workflowId: string;
  budget: BudgetLimits;
  actor?: string;
}

export interface RunStepEventInput {
  runId: string;
  taskId: string;
  stepId: string;
  actor: string;
  message: string;
  eventType: "step_started" | "step_completed" | "verification_requested" | "verification_completed";
  status: OrchestrationRunRecord["status"];
  artifact?: OrchestrationRunEvent["artifact"];
  budgetSnapshot?: BudgetLimits;
  metadata?: Record<string, unknown>;
}

type RunStatus = OrchestrationRunRecord["status"];

const runTransitions: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "failed", "canceled", "waiting_for_approval", "blocked"],
  running: ["waiting_for_research", "waiting_for_debug", "waiting_for_approval", "failed", "completed", "canceled", "blocked"],
  waiting_for_research: ["running", "failed", "canceled", "blocked"],
  waiting_for_debug: ["running", "failed", "canceled", "blocked"],
  waiting_for_approval: ["running", "failed", "canceled", "blocked"],
  blocked: ["running", "failed", "canceled"],
  failed: ["queued", "canceled"],
  completed: ["canceled"],
  canceled: []
};

const canTransitionRunStatus = (from: RunStatus, to: RunStatus): boolean => runTransitions[from].includes(to);

export class RufloOrchestrationService {
  constructor(private readonly deps: OrchestrationServiceDependencies) {}

  async startRun(input: RunStartInput): Promise<OrchestrationRunRecord> {
    const workflow = await this.deps.workflowStore.get(input.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${input.workflowId}`);
    }

    const run: OrchestrationRunRecord = {
      runId: input.runId,
      taskId: input.taskId,
      workflowId: input.workflowId,
      status: "queued",
      budget: input.budget,
      events: []
    };

    await this.append(run, createOrchestrationEvent({
      runId: input.runId,
      taskId: input.taskId,
      actor: input.actor ?? "orchestrator",
      message: `Run created for workflow ${workflow.id}`,
      eventType: "run_created",
      status: "queued",
      budgetSnapshot: input.budget
    }));

    run.status = "running";
    await this.append(run, createOrchestrationEvent({
      runId: input.runId,
      taskId: input.taskId,
      actor: input.actor ?? "orchestrator",
      message: `Run started for workflow ${workflow.id}`,
      eventType: "run_started",
      status: "running",
      budgetSnapshot: input.budget
    }));

    return run;
  }

  async enforceBudget(run: OrchestrationRunRecord): Promise<OrchestrationRunRecord> {
    if (!this.deps.budgetHook) {
      return run;
    }

    const decision = await this.deps.budgetHook.evaluate(run);
    if (decision.allowed) {
      await this.append(run, createOrchestrationEvent({
        runId: run.runId,
        taskId: run.taskId,
        actor: "budget-enforcer",
        message: decision.reason,
        eventType: "budget_checked",
        status: run.status,
        budgetSnapshot: decision.nextBudget ?? run.budget
      }));
      return run;
    }

    const nextStatus = decision.requiredApproval ? "waiting_for_approval" : "blocked";
    run.status = nextStatus;
    await this.append(run, createOrchestrationEvent({
      runId: run.runId,
      taskId: run.taskId,
      actor: "budget-enforcer",
      message: decision.reason,
      eventType: "budget_exceeded",
      status: nextStatus,
      budgetSnapshot: decision.nextBudget ?? run.budget
    }));

    return run;
  }

  async escalate(run: OrchestrationRunRecord, reasonCode: string): Promise<OrchestrationRunRecord> {
    if (!this.deps.escalationHook) {
      run.status = "blocked";
      await this.append(run, createOrchestrationEvent({
        runId: run.runId,
        taskId: run.taskId,
        actor: "orchestrator",
        message: `Escalation without hook: ${reasonCode}`,
        eventType: "escalated",
        status: "blocked",
        metadata: { reasonCode }
      }));
      return run;
    }

    const decision = await this.deps.escalationHook.evaluate(run, reasonCode);
    run.status = decision.stopRun ? "failed" : run.status;
    await this.append(run, createOrchestrationEvent({
      runId: run.runId,
      taskId: run.taskId,
      actor: "orchestrator",
      message: `Escalation decision: ${decision.reasonCode}`,
      eventType: "escalated",
      status: run.status,
      metadata: { reasonCode, targetRole: decision.targetRole, stopRun: decision.stopRun }
    }));

    return run;
  }

  async transitionRunStatus(run: OrchestrationRunRecord, nextStatus: OrchestrationRunRecord["status"]): Promise<OrchestrationRunRecord> {
    if (!canTransitionRunStatus(run.status, nextStatus)) {
      throw new Error(`Invalid orchestration run transition: ${run.status} -> ${nextStatus}`);
    }

    run.status = nextStatus;
    const eventType =
      nextStatus === "completed"
        ? "run_completed"
        : nextStatus === "failed"
          ? "run_failed"
          : nextStatus === "running"
            ? "run_started"
            : "step_completed";

    await this.append(run, createOrchestrationEvent({
      runId: run.runId,
      taskId: run.taskId,
      actor: "orchestrator",
      message: `Run transitioned to ${nextStatus}`,
      eventType,
      status: run.status
    }));

    return run;
  }

  async transitionTask(task: Task, nextState: typeof taskStates[number]): Promise<Task> {
    if (!canTransitionTaskState(task.state, nextState)) {
      throw new Error(`Invalid task transition: ${task.state} -> ${nextState}`);
    }

    task.state = transitionTaskState(task.state, nextState);
    return task;
  }

  async recordStep(input: RunStepEventInput): Promise<OrchestrationRunEvent> {
    const event = createOrchestrationEvent({
      runId: input.runId,
      taskId: input.taskId,
      actor: input.actor,
      message: input.message,
      eventType: input.eventType,
      status: input.status,
      stepId: input.stepId,
      ...(input.artifact ? { artifact: input.artifact } : {}),
      ...(input.budgetSnapshot ? { budgetSnapshot: input.budgetSnapshot } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    });

    await this.deps.eventLogger.append(event);
    return event;
  }

  async loadWorkflow(id: string) {
    return this.deps.workflowStore.get(id);
  }

  async listWorkflows() {
    return this.deps.workflowStore.list();
  }

  private async append(run: OrchestrationRunRecord, event: OrchestrationRunEvent): Promise<void> {
    run.events = [...run.events, event];
    await this.deps.eventLogger.append(event);
  }
}
