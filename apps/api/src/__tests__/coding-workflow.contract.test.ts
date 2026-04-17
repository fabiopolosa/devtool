import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { CodingWorkflow } from "@cp/domain";
import {
  startTestExecutionWorkerHarness,
  type TestExecutionWorkerHarness
} from "./helpers/execution-worker-harness.js";

describe("Coding workflow API contract", () => {
  let app: FastifyInstance;
  let workerHarness: TestExecutionWorkerHarness;
  let headers: Record<string, string>;

  beforeAll(async () => {
    process.env.API_STORE_MODE = "in_memory";
    process.env.AUTH_ENABLED = "1";

    const { buildApp } = await import("../app.js");
    app = await buildApp();
    workerHarness = await startTestExecutionWorkerHarness();

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@control-plane.local", password: "admin123!" }
    });
    expect(login.statusCode).toBe(200);
    const token = (login.json() as { item: { token: string } }).item.token;
    headers = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant_default"
    };
  });

  afterAll(async () => {
    if (workerHarness) {
      await workerHarness.stop();
    }
    if (app) {
      await app.close();
    }
    delete process.env.AUTH_ENABLED;
  });

  const waitForJob = async (jobId: string): Promise<void> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15_000) {
      const response = await app.inject({
        method: "GET",
        url: `/jobs/${jobId}`,
        headers
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        item?: {
          status?: string;
          payload?: Record<string, unknown>;
        };
      };
      const status = body.item?.status;
      if (status === "done" || status === "waiting_user") {
        return;
      }
      if (status === "error") {
        const payload = body.item?.payload;
        const lastError =
          payload && typeof payload.lastError === "object" && payload.lastError !== null
            ? (payload.lastError as Record<string, unknown>)
            : undefined;
        const message =
          typeof lastError?.message === "string" ? lastError.message : `Job ${jobId} failed`;
        throw new Error(message);
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`Timed out waiting for job ${jobId}`);
  };

  const createWorkflow = async (
    request: string,
    title = "Coding request"
  ): Promise<CodingWorkflow> => {
    const response = await app.inject({
      method: "POST",
      url: "/projects/proj_001/coding-workflows",
      headers,
      payload: { title, request, mode: "local" }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { jobId?: string; status?: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.status).toBe("pending");
    await waitForJob(body.jobId!);

    const detailResponse = await app.inject({
      method: "GET",
      url: "/projects/proj_001/coding-workflows",
      headers
    });
    expect(detailResponse.statusCode).toBe(200);
    const listBody = detailResponse.json() as { items?: CodingWorkflow[] };
    const created =
      (listBody.items ?? []).find((item) => item.title === title && item.request === request) ??
      (listBody.items ?? []).find((item) => item.request === request);
    expect(created).toBeDefined();
    expect(created!.projectId).toBe("proj_001");
    expect(created!.state).toBe("awaiting_plan_approval");
    return created!;
  };

  it("creates project-scoped workflows and advances through plan approval gates", async () => {
    const requestText = `Implement a project-scoped workflow ${randomUUID()}`;
    const created = await createWorkflow(
      `${requestText} that requires plan approval, patch approval, and review.`
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
      payload: { note: "Clarify task boundaries", mode: "local" }
    });
    expect(revisionResponse.statusCode).toBe(200);
    const revisionBody = revisionResponse.json() as { jobId?: string; status?: string };
    expect(typeof revisionBody.jobId).toBe("string");
    await waitForJob(revisionBody.jobId!);

    const postRevisionDetail = await app.inject({
      method: "GET",
      url: `/projects/proj_001/coding-workflows/${created.id}`,
      headers
    });
    const revisionWorkflow = (postRevisionDetail.json() as { item: CodingWorkflow }).item;
    expect(revisionWorkflow.state).toBe("planning");
    expect(revisionWorkflow.planDecision).toBe("revision_requested");
    expect(revisionWorkflow.actionRequired).toBe(true);

    const approvePlanResponse = await app.inject({
      method: "POST",
      url: `/projects/proj_001/coding-workflows/${created.id}/plan/approve`,
      headers,
      payload: { mode: "local" }
    });
    expect(approvePlanResponse.statusCode).toBe(200);
    const approvePlanBody = approvePlanResponse.json() as { jobId?: string; status?: string };
    expect(typeof approvePlanBody.jobId).toBe("string");
    await waitForJob(approvePlanBody.jobId!);

    const postPlanDetail = await app.inject({
      method: "GET",
      url: `/projects/proj_001/coding-workflows/${created.id}`,
      headers
    });
    const planWorkflow = (postPlanDetail.json() as { item: CodingWorkflow }).item;
    expect(planWorkflow.state).toBe("awaiting_patch_approval");
    expect(planWorkflow.planDecision).toBe("approved");
    expect(planWorkflow.patchDecision).toBe("pending");
    expect(planWorkflow.plan.patchProposal).toBeDefined();
    expect(planWorkflow.generatedTaskIds).toHaveLength(3);

    const patchRevisionResponse = await app.inject({
      method: "POST",
      url: `/projects/proj_001/coding-workflows/${created.id}/patch/request-revision`,
      headers,
      payload: { note: "Tighten patch proposal", mode: "local" }
    });
    expect(patchRevisionResponse.statusCode).toBe(200);
    const patchRevisionBody = patchRevisionResponse.json() as { jobId?: string; status?: string };
    expect(typeof patchRevisionBody.jobId).toBe("string");
    await waitForJob(patchRevisionBody.jobId!);

    const postPatchRevisionDetail = await app.inject({
      method: "GET",
      url: `/projects/proj_001/coding-workflows/${created.id}`,
      headers
    });
    const patchRevisionWorkflow = (postPatchRevisionDetail.json() as { item: CodingWorkflow }).item;
    expect(patchRevisionWorkflow.state).toBe("awaiting_patch_approval");
    expect(patchRevisionWorkflow.patchDecision).toBe("revision_requested");

    const approvePatchResponse = await app.inject({
      method: "POST",
      url: `/projects/proj_001/coding-workflows/${created.id}/patch/approve`,
      headers,
      payload: { mode: "local" }
    });
    expect(approvePatchResponse.statusCode).toBe(200);
    const approvePatchBody = approvePatchResponse.json() as { jobId?: string; status?: string };
    expect(typeof approvePatchBody.jobId).toBe("string");
    await waitForJob(approvePatchBody.jobId!);

    const postPatchApproveDetail = await app.inject({
      method: "GET",
      url: `/projects/proj_001/coding-workflows/${created.id}`,
      headers
    });
    const approvePatchWorkflow = (postPatchApproveDetail.json() as { item: CodingWorkflow }).item;
    expect(approvePatchWorkflow.state).toBe("completed");
    expect(approvePatchWorkflow.patchDecision).toBe("approved");
    expect(approvePatchWorkflow.reviewSummary).toContain("Execution completed");
    expect(approvePatchWorkflow.actionRequired).toBe(false);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/projects/proj_001/coding-workflows/${created.id}`,
      headers
    });
    expect(detailResponse.statusCode).toBe(200);
    const detailBody = detailResponse.json() as { item: CodingWorkflow };
    expect(detailBody.item.id).toBe(created.id);
    expect(detailBody.item.generatedTaskIds).toEqual(approvePatchWorkflow.generatedTaskIds);
    expect(detailBody.item.timeline.some((entry) => entry.type === "workflow_completed")).toBe(true);
  });

  it("supports plan rejection and patch rejection HITL actions", async () => {
    const rejectedPlan = await createWorkflow("Create a coding request that should be rejected by plan review.");

    const planRejectResponse = await app.inject({
      method: "POST",
      url: `/projects/proj_001/coding-workflows/${rejectedPlan.id}/plan/reject`,
      headers,
      payload: { note: "Does not fit current scope", mode: "local" }
    });
    expect(planRejectResponse.statusCode).toBe(200);
    const planRejectBody = planRejectResponse.json() as { jobId?: string; status?: string };
    expect(typeof planRejectBody.jobId).toBe("string");
    await waitForJob(planRejectBody.jobId!);
    const rejectedDetail = await app.inject({
      method: "GET",
      url: `/projects/proj_001/coding-workflows/${rejectedPlan.id}`,
      headers
    });
    const rejectedWorkflow = (rejectedDetail.json() as { item: CodingWorkflow }).item;
    expect(rejectedWorkflow.state).toBe("plan_rejected");
    expect(rejectedWorkflow.planDecision).toBe("rejected");
    expect(rejectedWorkflow.actionRequired).toBe(false);

    const patchTarget = await createWorkflow("Approve the plan but reject the patch proposal.");

    const approvePlanResponse = await app.inject({
      method: "POST",
      url: `/projects/proj_001/coding-workflows/${patchTarget.id}/plan/approve`,
      headers,
      payload: { mode: "local" }
    });
    expect(approvePlanResponse.statusCode).toBe(200);
    const approvePlanBody = approvePlanResponse.json() as { jobId?: string; status?: string };
    expect(typeof approvePlanBody.jobId).toBe("string");
    await waitForJob(approvePlanBody.jobId!);

    const patchRejectResponse = await app.inject({
      method: "POST",
      url: `/projects/proj_001/coding-workflows/${patchTarget.id}/patch/reject`,
      headers,
      payload: { note: "Patch needs a rewrite", mode: "local" }
    });
    expect(patchRejectResponse.statusCode).toBe(200);
    const patchRejectBody = patchRejectResponse.json() as { jobId?: string; status?: string };
    expect(typeof patchRejectBody.jobId).toBe("string");
    await waitForJob(patchRejectBody.jobId!);
    const patchRejectDetail = await app.inject({
      method: "GET",
      url: `/projects/proj_001/coding-workflows/${patchTarget.id}`,
      headers
    });
    const patchRejectWorkflow = (patchRejectDetail.json() as { item: CodingWorkflow }).item;
    expect(patchRejectWorkflow.state).toBe("rejected");
    expect(patchRejectWorkflow.patchDecision).toBe("rejected");
    expect(patchRejectWorkflow.actionRequired).toBe(false);
  });
});
