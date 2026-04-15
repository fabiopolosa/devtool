import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodingWorkflowPage } from "../pages/CodingWorkflowPage";
import { AppStoreProvider } from "../store/app-store";

vi.mock("../pages/_utils", () => ({
  usePathParam: () => "proj_001"
}));

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Coding workflow smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the project-scoped workflow page and loads workflow data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();

        if (url.includes("/projects/proj_001/coding-workflows") && method === "GET") {
          return jsonResponse({
            items: [
              {
                id: "cw_001",
                tenantId: "tenant_default",
                projectId: "proj_001",
                title: "Refine deployment workflow",
                request: "Review deployment flow with HITL approvals.",
                state: "awaiting_plan_approval",
                planDecision: "pending",
                patchDecision: "pending",
                plan: {
                  summary: "Review deployment flow",
                  rationale: "Keep the change scoped and approval-gated.",
                  tasks: [
                    {
                      id: "cw_task_001",
                      title: "Inspect deployment surface",
                      description: "Audit the current deployment path.",
                      files: ["apps/api/src"],
                      commands: ["pnpm lint"],
                      status: "draft"
                    }
                  ],
                  acceptanceCriteria: ["Plan approved"],
                  risks: ["Deployment touches multiple modules"]
                },
                generatedTaskIds: [],
                actionRequired: true,
                timeline: [
                  {
                    id: "cw_timeline_001",
                    type: "plan_generated",
                    message: "Plan generated and awaiting review",
                    createdAt: "2026-04-14T12:00:00.000Z",
                    actor: "planner"
                  }
                ],
                createdAt: "2026-04-14T12:00:00.000Z",
                createdBy: "planner",
                updatedAt: "2026-04-14T12:00:00.000Z",
                updatedBy: "planner"
              }
            ]
          });
        }

        return jsonResponse({ message: "Not found" }, 404);
      })
    );

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <CodingWorkflowPage projectId="proj_001" />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Coding Workflow")).toBeInTheDocument();
    expect(screen.getByText("Development with HITL gates")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /refine deployment workflow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve patch/i })).toBeInTheDocument();
    expect(screen.getAllByText("awaiting_plan_approval").length).toBeGreaterThanOrEqual(1);
  });
});
