import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Web smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders command center shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ items: [] }))
    );

    render(
      <AppStoreProvider>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("link", { name: "DevTools Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tenant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tenant view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Platform owner view" })).toBeInTheDocument();
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    expect(screen.getByText("Launcher")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /\+ New Project/i })).toHaveAttribute("href", "/projects/new");
    expect(screen.getByRole("button", { name: "New Project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /agent chat/i })).toBeInTheDocument();
  });

  it("routes a new project from launcher to setup", async () => {
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
                description: "Fresh project",
                status: "active",
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
                defaultHost: "local_worker",
                defaultExecutionMode: "queued",
                heartbeatPolicy: {
                  enabled: true,
                  interval: "manual",
                  triggers: ["manual"],
                  metadata: {}
                },
                agentSelectionPolicy: {},
                metadata: {}
              }
            }
          });
        }

        if (path === "/workspaces?projectId=proj-control-plane") {
          return jsonResponse({ items: [] });
        }

        return jsonResponse({ items: [] });
      })
    );

    window.history.pushState({}, "", "/projects");
    await router.navigate({ to: "/projects" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    const launcherProject = await screen.findByRole("button", { name: /Control Plane/i });
    fireEvent.click(launcherProject);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/projects/proj-control-plane/setup");
    });
  });
});
