import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodingWorkflow, Job, Task } from "@cp/domain";
import { codingWorkflowRoutes } from "../routes/coding-workflow.js";

const codingWorkflows = new Map<string, CodingWorkflow>();
const tasks = new Map<string, Task>();
const jobs = new Map<string, Job>();

vi.mock("../services/api-store.js", () => ({
  apiStore: {
    listCodingWorkflows: async (filters?: { projectId?: string; state?: CodingWorkflow["state"] }) =>
      [...codingWorkflows.values()].filter((item) => {
        if (filters?.projectId && item.projectId !== filters.projectId) return false;
        if (filters?.state && item.state !== filters.state) return false;
        return true;
      }),
    getCodingWorkflow: async (workflowId: string) => codingWorkflows.get(workflowId) ?? null,
    createCodingWorkflow: async (workflow: CodingWorkflow) => {
      codingWorkflows.set(workflow.id, workflow);
      return workflow;
    },
    updateCodingWorkflow: async (workflowId: string, patch: Partial<CodingWorkflow>) => {
      const existing = codingWorkflows.get(workflowId);
      if (!existing) {
        throw new Error(`Record not found: coding_workflows/${workflowId}`);
      }
      const updated = { ...existing, ...patch } as CodingWorkflow;
      codingWorkflows.set(workflowId, updated);
      return updated;
    },
    getTask: async (taskId: string) => tasks.get(taskId) ?? null,
    listTasks: async (projectId?: string) =>
      [...tasks.values()].filter((item) => (projectId ? item.projectId === projectId : true)),
    createTask: async (task: Task) => {
      tasks.set(task.id, task);
      return task;
    },
    updateTask: async (taskId: string, patch: Partial<Task>) => {
      const existing = tasks.get(taskId);
      if (!existing) {
        throw new Error(`Record not found: tasks/${taskId}`);
      }
      const updated = { ...existing, ...patch } as Task;
      tasks.set(taskId, updated);
      return updated;
    },
    listJobs: async () => [...jobs.values()],
    getJob: async (jobId: string) => jobs.get(jobId) ?? null,
    createJob: async (job: Job) => {
      jobs.set(job.id, job);
      return job;
    },
    updateJob: async (jobId: string, patch: Partial<Job>) => {
      const existing = jobs.get(jobId);
      if (!existing) {
        throw new Error(`Record not found: jobs/${jobId}`);
      }
      const updated = { ...existing, ...patch } as Job;
      jobs.set(jobId, updated);
      return updated;
    },
    getBrainstormSession: async () => null,
    getBrainstormPlan: async () => null,
    listBrainstormSessions: async () => [],
    listBrainstormPlans: async () => []
  }
}));

vi.mock("../tenant/rbac.js", () => ({
  requireTenantPermission: () => true
}));

describe("Coding workflow API contract", () => {
  beforeEach(() => {
    codingWorkflows.clear();
    tasks.clear();
    jobs.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const buildApp = async () => {
    const app = Fastify({ logger: false });
    app.addHook("preHandler", async (request) => {
      request.tenantId = "tenant_default";
      request.authPrincipal = { userId: "user_test" } as never;
    });
    await app.register(codingWorkflowRoutes);
    return app;
  };

  const headers = { "x-tenant-id": "tenant_default" };

  const createWorkflow = async (app: Awaited<ReturnType<typeof buildApp>>, request: string, title = "Coding request") => {
    const response = await app.inject({
      method: "POST",
      url: "/projects/proj_001/coding-workflows",
      headers,
      payload: { title, request }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { item: CodingWorkflow };
    expect(body.item.projectId).toBe("proj_001");
    expect(body.item.state).toBe("awaiting_plan_approval");
    return body.item;
  };

  it("creates project-scoped workflows and advances through plan approval gates", async () => {
    const app = await buildApp();
    try {
      const created = await createWorkflow(
        app,
        "Implement a project-scoped workflow that requires plan approval, patch approval, and review."
      );

      const listResponse = await app.inject({
        method: "GET",
        url: "/projects/proj_001/coding-workflows",
        headers
      });
      expect(listResponse.statusCode).toBe(200);
      const listBody = listResponse.json() as { items: CodingWorkflow[] };
      expect(listBody.items.some((item) => item.id === created.id)).toBe(true);

      const revisionResponse = await app.inject({
        method: "POST",
        url: `/projects/proj_001/coding-workflows/${created.id}/plan/request-revision`,
        headers,
        payload: { note: "Clarify task boundaries" }
      });
      expect(revisionResponse.statusCode).toBe(200);
      const revisionBody = revisionResponse.json() as { item: CodingWorkflow };
      expect(revisionBody.item.state).toBe("planning");
      expect(revisionBody.item.planDecision).toBe("revision_requested");
      expect(revisionBody.item.actionRequired).toBe(true);

      const approvePlanResponse = await app.inject({
        method: "POST",
        url: `/projects/proj_001/coding-workflows/${created.id}/plan/approve`,
        headers
      });
      expect(approvePlanResponse.statusCode).toBe(200);
      const approvePlanBody = approvePlanResponse.json() as { item: CodingWorkflow; generatedTasks?: Array<{ id: string }> };
      expect(approvePlanBody.item.state).toBe("awaiting_patch_approval");
      expect(approvePlanBody.item.planDecision).toBe("approved");
      expect(approvePlanBody.item.patchDecision).toBe("pending");
      expect(approvePlanBody.item.plan.patchProposal).toBeDefined();
      expect(approvePlanBody.item.generatedTaskIds).toHaveLength(3);
      expect(approvePlanBody.generatedTasks?.map((task) => task.id)).toEqual(approvePlanBody.item.generatedTaskIds);

      const patchRevisionResponse = await app.inject({
        method: "POST",
        url: `/projects/proj_001/coding-workflows/${created.id}/patch/request-revision`,
        headers,
        payload: { note: "Tighten patch proposal" }
      });
      expect(patchRevisionResponse.statusCode).toBe(200);
      const patchRevisionBody = patchRevisionResponse.json() as { item: CodingWorkflow };
      expect(patchRevisionBody.item.state).toBe("awaiting_patch_approval");
      expect(patchRevisionBody.item.patchDecision).toBe("revision_requested");

      const approvePatchResponse = await app.inject({
        method: "POST",
        url: `/projects/proj_001/coding-workflows/${created.id}/patch/approve`,
        headers
      });
      expect(approvePatchResponse.statusCode).toBe(200);
      const approvePatchBody = approvePatchResponse.json() as { item: CodingWorkflow };
      expect(approvePatchBody.item.state).toBe("completed");
      expect(approvePatchBody.item.patchDecision).toBe("approved");
      expect(approvePatchBody.item.reviewSummary).toContain("Execution completed");
      expect(approvePatchBody.item.actionRequired).toBe(false);

      const detailResponse = await app.inject({
        method: "GET",
        url: `/projects/proj_001/coding-workflows/${created.id}`,
        headers
      });
      expect(detailResponse.statusCode).toBe(200);
      const detailBody = detailResponse.json() as { item: CodingWorkflow };
      expect(detailBody.item.id).toBe(created.id);
      expect(detailBody.item.generatedTaskIds).toEqual(approvePatchBody.item.generatedTaskIds);
      expect(detailBody.item.timeline.some((entry) => entry.type === "workflow_completed")).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("supports plan rejection and patch rejection HITL actions", async () => {
    const app = await buildApp();
    try {
      const rejectedPlan = await createWorkflow(app, "Create a coding request that should be rejected by plan review.");

      const planRejectResponse = await app.inject({
        method: "POST",
        url: `/projects/proj_001/coding-workflows/${rejectedPlan.id}/plan/reject`,
        headers,
        payload: { note: "Does not fit current scope" }
      });
      expect(planRejectResponse.statusCode).toBe(200);
      const planRejectBody = planRejectResponse.json() as { item: CodingWorkflow };
      expect(planRejectBody.item.state).toBe("plan_rejected");
      expect(planRejectBody.item.planDecision).toBe("rejected");
      expect(planRejectBody.item.actionRequired).toBe(false);

      const patchTarget = await createWorkflow(app, "Approve the plan but reject the patch proposal.");

      const approvePlanResponse = await app.inject({
        method: "POST",
        url: `/projects/proj_001/coding-workflows/${patchTarget.id}/plan/approve`,
        headers
      });
      expect(approvePlanResponse.statusCode).toBe(200);

      const patchRejectResponse = await app.inject({
        method: "POST",
        url: `/projects/proj_001/coding-workflows/${patchTarget.id}/patch/reject`,
        headers,
        payload: { note: "Patch needs a rewrite" }
      });
      expect(patchRejectResponse.statusCode).toBe(200);
      const patchRejectBody = patchRejectResponse.json() as { item: CodingWorkflow };
      expect(patchRejectBody.item.state).toBe("rejected");
      expect(patchRejectBody.item.patchDecision).toBe("rejected");
      expect(patchRejectBody.item.actionRequired).toBe(false);
    } finally {
      await app.close();
    }
  });
});
