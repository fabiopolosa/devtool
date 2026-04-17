import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Jobs operations rail smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("renders launcher + operations rail with live queue stats", async () => {
    vi.resetModules();
    const [{ RouterProvider }, { router }, { AppStoreProvider }] = await Promise.all([
      import("@tanstack/react-router"),
      import("../router/router"),
      import("../store/app-store")
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const path = (() => {
          try {
            return new URL(rawUrl, "http://localhost:5173").pathname;
          } catch {
            return rawUrl;
          }
        })();

        if (path === "/projects") {
          return jsonResponse({
            items: [
              {
                id: "proj-control-plane",
                tenantId: "tenant_default",
                key: "control-plane",
                name: "Control Plane",
                description: "Test project",
                status: "active",
                policySetId: "policy-main",
                createdAt: "2026-04-15T08:00:00.000Z",
                createdBy: "system",
                updatedAt: "2026-04-15T08:00:01.000Z",
                updatedBy: "system"
              }
            ]
          });
        }

        if (/^\/projects\/[^/]+\/jobs/.test(path)) {
          return jsonResponse({
            items: [
              {
                id: "job_runtime_001",
                tenantId: "tenant_default",
                projectId: "proj-control-plane",
                type: "generation",
                title: "Generate landing hero copy",
                status: "running",
                priority: 8,
                retryCount: 1,
                maxRetries: 3,
                actionRequired: false,
                dependencies: ["job_dep_001"],
                dependsOnCount: 1,
                ready: false,
                createdBy: "system",
                createdAt: "2026-04-15T08:00:00.000Z",
                updatedAt: "2026-04-15T08:00:01.000Z"
              }
            ]
          });
        }

        return jsonResponse({ items: [] });
      })
    );

    window.history.pushState({}, "", "/project/proj-control-plane");
    await router.navigate({ to: "/project/$projectId", params: { projectId: "proj-control-plane" } });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Operations")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ruflo" })).toBeInTheDocument();
    expect(screen.getByText("Live Queue")).toBeInTheDocument();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  });
});
