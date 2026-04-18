import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const installApiFetchMock = () => {
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
              key: "proj-control-plane",
              name: "Apollo",
              description: "Onboarding target",
              status: "active",
              createdAt: "2026-04-14T10:00:00.000Z",
              createdBy: "test",
              updatedAt: "2026-04-14T10:00:00.000Z",
              updatedBy: "test"
            }
          ]
        });
      }

      if (path === "/projects/proj-control-plane") {
        return jsonResponse({
          item: {
            id: "proj-control-plane",
            key: "proj-control-plane",
            name: "Apollo",
            description: "Onboarding target",
            status: "active",
            createdAt: "2026-04-14T10:00:00.000Z",
            createdBy: "test",
            updatedAt: "2026-04-14T10:00:00.000Z",
            updatedBy: "test"
          }
        });
      }

      if (path === "/projects/proj-control-plane/runtime") {
        return jsonResponse({
          item: {
            id: "proj-control-plane",
            key: "proj-control-plane",
            name: "Apollo",
            description: "Onboarding target",
            status: "active",
            runtimeProfile: {
              primaryAgentId: "agent_001",
              workspaceId: "workspace_001",
              defaultHost: "local_worker",
              defaultExecutionMode: "queued",
              heartbeatPolicy: {
                interval: "5m",
                triggers: ["manual", "on_startup"],
                enabled: true,
                metadata: {}
              },
              agentSelectionPolicy: {},
              metadata: {}
            },
            createdAt: "2026-04-14T10:00:00.000Z",
            createdBy: "test",
            updatedAt: "2026-04-14T10:00:00.000Z",
            updatedBy: "test"
          }
        });
      }

      if (path === "/projects/proj-control-plane/runtime/heartbeat/status") {
        return jsonResponse({
          item: {
            projectId: "proj-control-plane",
            projectName: "Apollo",
            runtimeProfile: {
              primaryAgentId: "agent_001",
              workspaceId: "workspace_001",
              defaultHost: "local_worker",
              defaultExecutionMode: "queued",
              heartbeatPolicy: {
                interval: "5m",
                triggers: ["manual", "on_startup"],
                enabled: true,
                metadata: {}
              },
              agentSelectionPolicy: {},
              metadata: {}
            },
            lastJobIds: [],
            overallStatus: "idle",
            due: false,
            completedCount: 0,
            failedCount: 0,
            runningCount: 0,
            queuedCount: 0
          }
        });
      }

      if (path === "/agents") {
        return jsonResponse({
          items: [
            {
              id: "agent_001",
              name: "codex-builder-primary",
              role: "codex_builder",
              icon: "tool",
              description: "Primary builder",
              adapterType: "legacy_cli",
              runtimeProfile: {
                runtimeKind: "desktop_cli",
                vendor: "openai_codex",
                host: "desktop_app",
                launchMode: "interactive",
                args: [],
                metadata: {}
              },
              heartbeatPolicy: {
                interval: "5m",
                triggers: ["manual", "on_startup"],
                enabled: true,
                metadata: {}
              },
              desiredSkills: ["checks"],
              runtimeConfig: { commandPrefix: "devtools-agent" },
              capabilities: ["coding"],
              createdAt: "2026-04-14T10:00:00.000Z",
              updatedAt: "2026-04-14T10:00:00.000Z",
              status: "active"
            }
          ]
        });
      }

      if (path === "/workspaces?projectId=proj-control-plane") {
        return jsonResponse({
          items: [
            {
              id: "workspace_001",
              projectId: "proj-control-plane",
              mode: "local",
              localPath: "/workspace-root",
              runtimeStatus: "running",
              runtimeDetails: {},
              createdAt: "2026-04-14T10:00:00.000Z",
              createdBy: "test",
              updatedAt: "2026-04-14T10:00:00.000Z",
              updatedBy: "test"
            }
          ]
        });
      }

      if (path === "/workspaces/browser/roots") {
        return jsonResponse({
          allowedRoots: [
            {
              path: "/workspace-root",
              name: "workspace-root",
              exists: true,
              isDirectory: true,
              readable: true,
              writable: true,
              executable: true
            }
          ]
        });
      }

      if (path === "/workspaces/browser?path=%2Fworkspace-root") {
        return jsonResponse({
          path: "/workspace-root",
          resolvedPath: "/workspace-root",
          root: "/workspace-root",
          currentRoot: "/workspace-root",
          currentName: "workspace-root",
          allowedRoots: [
            {
              path: "/workspace-root",
              name: "workspace-root",
              exists: true,
              isDirectory: true,
              readable: true,
              writable: true,
              executable: true
            }
          ],
          entries: [
            {
              name: "packages",
              path: "/workspace-root/packages",
              kind: "directory",
              isDirectory: true,
              isFile: false,
              isSymlink: false
            }
          ]
        });
      }

      if (path === "/workspaces/browser?path=%2Fworkspace-root%2Fpackages") {
        return jsonResponse({
          path: "/workspace-root/packages",
          resolvedPath: "/workspace-root/packages",
          root: "/workspace-root",
          currentRoot: "/workspace-root",
          currentName: "packages",
          parentPath: "/workspace-root",
          allowedRoots: [
            {
              path: "/workspace-root",
              name: "workspace-root",
              exists: true,
              isDirectory: true,
              readable: true,
              writable: true,
              executable: true
            }
          ],
          entries: []
        });
      }

      return jsonResponse({ items: [] });
    })
  );
};

describe("Project onboarding smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders onboarding and folder browser flow", async () => {
    installApiFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/project/proj-control-plane/onboarding");
    await router.navigate({ to: "/project/$projectId/onboarding", params: { projectId: "proj-control-plane" } });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Project basics")).toBeInTheDocument();
    expect(screen.getByText("primary agent")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /workspace picker/i }));
    expect(await screen.findByText("Browse workspace folders")).toBeInTheDocument();
    expect(await screen.findByText("workspace-root")).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: /packages/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /packages/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use this folder" }));
  });
});
