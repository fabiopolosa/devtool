import path from "node:path";
import type { Task } from "@cp/domain";
import {
  InMemoryRunEventLogger,
  InMemoryWorkflowStore,
  RufloOrchestrationService,
  WorkflowLoader,
  resolveTaskExecutionRouting
} from "../index.js";

describe("Ruflo workflow dry-run", () => {
  it("loads workflow definitions from configs", async () => {
    const baseDir = path.resolve(process.cwd(), "../../configs/workflows");
    const loader = new WorkflowLoader({ baseDir });

    const workflows = await loader.loadAll();
    expect(workflows.length).toBeGreaterThan(0);
    expect(workflows.some((workflow) => workflow.id === "task_execute")).toBe(true);
  });

  it("executes start->transition orchestration record deterministically", async () => {
    const baseDir = path.resolve(process.cwd(), "../../configs/workflows");
    const loader = new WorkflowLoader({ baseDir });
    const workflows = await loader.loadAll();

    const workflowStore = new InMemoryWorkflowStore();
    for (const workflow of workflows) {
      await workflowStore.upsert(workflow);
    }

    const eventLogger = new InMemoryRunEventLogger();
    const service = new RufloOrchestrationService({
      workflowStore,
      eventLogger
    });

    const run = await service.startRun({
      runId: "run_test_001",
      taskId: "task_test_001",
      workflowId: "task_execute",
      budget: { maxRetries: 1 }
    });

    expect(run.status).toBe("running");
    expect(run.events.length).toBe(2);

    await service.transitionRunStatus(run, "waiting_for_approval");
    expect(run.status).toBe("waiting_for_approval");

    await service.transitionRunStatus(run, "running");
    await service.transitionRunStatus(run, "completed");
    expect(run.status).toBe("completed");

    const storedEvents = await eventLogger.list(run.runId);
    expect(storedEvents.length).toBeGreaterThanOrEqual(4);
    expect(storedEvents.at(-1)?.eventType).toBe("run_completed");
  });

  it("enforces task lifecycle transitions", async () => {
    const workflowStore = new InMemoryWorkflowStore();
    await workflowStore.upsert({
      id: "task_execute",
      version: "1",
      entrypoint: "start",
      steps: [{ id: "start", type: "transition", next: [], metadata: {} }],
      transitions: [],
      stopConditions: []
    });

    const service = new RufloOrchestrationService({
      workflowStore,
      eventLogger: new InMemoryRunEventLogger()
    });

    const now = new Date().toISOString();
    const task: Task = {
      id: "task_lifecycle_001",
      tenantId: "tenant_default",
      projectId: "proj_001",
      title: "Lifecycle test",
      type: "feature",
      state: "approved",
      goal: "Validate allowed transitions",
      scopeInclude: ["*"],
      scopeExclude: [],
      constraints: [],
      targetRepositoryIds: ["repo_001"],
      successCriteria: ["transition succeeds"],
      verificationPlan: ["lint", "test", "build"],
      dependencyTaskIds: [],
      riskNotes: [],
      budget: { maxRetries: 1 },
      approvalsRequired: true,
      createdAt: now,
      createdBy: "test",
      updatedAt: now,
      updatedBy: "test"
    };

    await service.transitionTask(task, "queued");
    await service.transitionTask(task, "running");
    await service.transitionTask(task, "verification_failed");
    await service.transitionTask(task, "waiting_for_debug");
    await service.transitionTask(task, "running");
    await service.transitionTask(task, "completed");

    expect(task.state).toBe("completed");
  });

  it("rejects invalid task transitions", async () => {
    const workflowStore = new InMemoryWorkflowStore();
    await workflowStore.upsert({
      id: "task_execute",
      version: "1",
      entrypoint: "start",
      steps: [{ id: "start", type: "transition", next: [], metadata: {} }],
      transitions: [],
      stopConditions: []
    });

    const service = new RufloOrchestrationService({
      workflowStore,
      eventLogger: new InMemoryRunEventLogger()
    });

    const now = new Date().toISOString();
    const task: Task = {
      id: "task_invalid_001",
      tenantId: "tenant_default",
      projectId: "proj_001",
      title: "Invalid lifecycle test",
      type: "feature",
      state: "draft",
      goal: "Ensure invalid transitions throw",
      scopeInclude: ["*"],
      scopeExclude: [],
      constraints: [],
      targetRepositoryIds: ["repo_001"],
      successCriteria: ["error thrown"],
      verificationPlan: ["lint", "test", "build"],
      dependencyTaskIds: [],
      riskNotes: [],
      budget: { maxRetries: 1 },
      approvalsRequired: false,
      createdAt: now,
      createdBy: "test",
      updatedAt: now,
      updatedBy: "test"
    };

    await expect(service.transitionTask(task, "running")).rejects.toThrow(/Invalid task transition/);
  });

  it("prefers explicit task agent assignment when agentId is present", async () => {
    const decision = resolveTaskExecutionRouting({
      taskSpec: {
        agentId: "agent_001",
        proposedRouting: {
          primaryRole: "codex_builder",
          supportingRoles: [],
          capabilityNeeds: ["coding"]
        }
      },
      availableAgents: [
        {
          id: "agent_001",
          name: "builder-primary",
          role: "codex_builder",
          status: "active",
          runtimeConfig: { commandPrefix: "devtools-agent" },
          desiredSkills: ["checks"]
        }
      ]
    });

    expect(decision.source).toBe("task_agent_override");
    expect(decision.selectedAgentId).toBe("agent_001");
    expect(decision.selectedRole).toBe("codex_builder");
    expect(decision.desiredSkills).toContain("checks");
  });

  it("falls back to proposed routing when explicit agent is missing", async () => {
    const decision = resolveTaskExecutionRouting({
      taskSpec: {
        agentId: "agent_missing",
        proposedRouting: {
          primaryRole: "claude_debugger",
          supportingRoles: [],
          capabilityNeeds: ["chat_reasoning", "coding"]
        }
      },
      availableAgents: []
    });

    expect(decision.source).toBe("proposed_routing");
    expect(decision.selectedRole).toBe("claude_debugger");
    expect(decision.selectedAgentId).toBeUndefined();
  });
});
