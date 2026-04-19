import { render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Project detail smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the project home with grouped sections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path === "/projects") {
          return jsonResponse({
            items: [
              {
                id: "proj-control-plane",
                tenantId: "tenant_default",
                key: "CTRL",
                name: "Control Plane",
                description: "A project home that should feel like a workspace, not a vertical report.",
                status: "active",
                createdAt: "2026-04-18T10:00:00.000Z",
                createdBy: "test",
                updatedAt: "2026-04-18T10:00:00.000Z",
                updatedBy: "test"
              }
            ]
          });
        }

        if (path === "/projects/proj-control-plane/jobs") {
          return jsonResponse({
            items: [
              {
                id: "job_001",
                tenantId: "tenant_default",
                type: "task",
                title: "Ship project home cleanup",
                status: "running",
                priority: 80,
                retryCount: 0,
                maxRetries: 2,
                dependsOnCount: 0,
                actionRequired: false,
                ready: false,
                createdAt: "2026-04-18T10:00:00.000Z",
                createdBy: "test",
                updatedAt: "2026-04-18T10:00:00.000Z",
                updatedBy: "test"
              }
            ]
          });
        }

        if (path === "/projects/proj-control-plane/runtime") {
          return jsonResponse({
            item: {
              runtimeProfile: {
                primaryAgentId: "agent_001",
                workspaceId: "workspace_001",
                defaultHost: "local_worker",
                defaultExecutionMode: "queued",
                heartbeatPolicy: {
                  interval: "5m",
                  triggers: ["manual"],
                  enabled: true,
                  metadata: {}
                },
                agentSelectionPolicy: {},
                metadata: {}
              }
            }
          });
        }

        if (path === "/projects/proj-control-plane/runtime/heartbeat/status") {
          return jsonResponse({
            item: {
              projectId: "proj-control-plane",
              projectName: "Control Plane",
              runtimeProfile: {
                primaryAgentId: "agent_001",
                workspaceId: "workspace_001",
                defaultHost: "local_worker",
                defaultExecutionMode: "queued",
                heartbeatPolicy: {
                  interval: "5m",
                  triggers: ["manual"],
                  enabled: true,
                  metadata: {}
                },
                agentSelectionPolicy: {},
                metadata: {}
              },
              lastJobIds: ["job_001"],
              overallStatus: "done",
              due: false,
              completedCount: 1,
              failedCount: 0,
              runningCount: 0,
              queuedCount: 0
            }
          });
        }

        if (path === "/workspaces?projectId=proj-control-plane") {
          return jsonResponse({
            items: [
              {
                id: "workspace_001",
                projectId: "proj-control-plane",
                mode: "local",
                localPath: "/workspace-root/control-plane",
                runtimeStatus: "running",
                runtimeDetails: {
                  pathValidation: {
                    status: "valid",
                    message: "Folder is ready"
                  }
                }
              }
            ]
          });
        }

        if (path === "/projects/proj-control-plane/local-host") {
          return jsonResponse({
            item: {
              attached: true,
              machineAttached: true,
              status: "attached",
              machineName: "desktop-01",
              workspaceAttached: true,
              folderAttached: true,
              localPath: "/workspace-root/control-plane",
              previewAvailable: true,
              previewStatus: "available",
              previewUrl: "http://localhost:5173",
              previewPort: 5173
            }
          });
        }

        if (path === "/projects/proj-control-plane/app-targets") {
          return jsonResponse({
            items: [
              {
                id: "target_001",
                name: "Main app target",
                runCommand: "pnpm dev",
                testCommand: "pnpm test",
                devCommand: "pnpm dev",
                previewUrl: "http://localhost:5173",
                previewPort: 5173,
                enabled: true
              }
            ]
          });
        }

        if (path === "/workspaces/browser/roots") {
          return jsonResponse({ allowedRoots: [] });
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

    expect(await screen.findByText("Project Home")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Control Plane" })).toBeInTheDocument();
    expect(screen.getAllByText("Current posture").length).toBeGreaterThan(0);
    expect(screen.getByText("Project jobs")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
    expect(screen.getByText("Local wrapper")).toBeInTheDocument();
    expect(screen.getByText("Local machine")).toBeInTheDocument();
  });
});
