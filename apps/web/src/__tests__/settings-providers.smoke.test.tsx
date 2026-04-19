import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const installFetchMock = (): { calledPaths: string[] } => {
  const calledPaths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
      const path = `${url.pathname}${url.search}`;
      const method =
        init?.method ??
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
      calledPaths.push(path);

      if (path === "/providers/config" && method === "POST") {
        return jsonResponse({
          success: true,
          item: {
            id: "cfg_created",
            tenantId: "tenant_default",
            provider: "openai",
            providerId: "openai",
            enabled: true,
            timeoutMs: 30000,
            authRef: "secret://openai/api-key",
            apiKey: "***"
          }
        });
      }

      if (path === "/providers/config") {
        return jsonResponse({
          items: [
            {
              id: "cfg_openai",
              tenantId: "tenant_default",
              provider: "openai",
              providerId: "openai",
              enabled: true,
              timeoutMs: 30000,
              authRef: "secret://openai/api-key",
              apiKey: "***"
            }
          ]
        });
      }

      if (path === "/providers/defaults" && method === "PATCH") {
        return jsonResponse({ success: true, item: {} });
      }

      if (path === "/providers/defaults") {
        return jsonResponse({ item: {} });
      }

      if (path === "/tenants") {
        return jsonResponse({
          items: [{ id: "tenant_default", name: "Default Tenant", createdAt: "2026-01-01T00:00:00.000Z" }]
        });
      }

      if (path.startsWith("/projects/") && path.endsWith("/jobs")) {
        return jsonResponse({ items: [] });
      }

      if (path.startsWith("/jobs/") && path.endsWith("/runtime")) {
        return jsonResponse({ item: { job: null, dependencies: [], logs: [] } }, 404);
      }

      return jsonResponse({ items: [] });
    })
  );
  return { calledPaths };
};

describe("Role-based settings providers smoke", () => {
  let calledPaths: string[] = [];

  beforeEach(() => {
    window.localStorage.clear();
    ({ calledPaths } = installFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders /settings/providers with provider list and tenants", async () => {
    window.localStorage.setItem("cp_owner_mode", "1");
    await act(async () => {
      window.history.pushState({}, "", "/settings/providers");
      await router.navigate({ to: "/settings/providers" });
    });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Owner Provider Settings" })).toBeInTheDocument();
    expect(await screen.findByText("Provider Catalog")).toBeInTheDocument();
    expect(await screen.findByText("Provider Configuration")).toBeInTheDocument();
    expect(await screen.findByText("Status & Defaults")).toBeInTheDocument();
    expect((await screen.findAllByText("openai")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Default Tenant")).toBeInTheDocument();
  });

  it("shows top-level domain nav and owner switch", async () => {
    await act(async () => {
      window.history.pushState({}, "", "/");
      await router.navigate({ to: "/" });
    });

    const first = render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tenant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tenant view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Platform owner view" })).toBeInTheDocument();
    first.unmount();

    window.localStorage.setItem("cp_owner_mode", "1");
    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Platform owner view" }));
    });
    expect(router.state.location.pathname).toBe("/platform/secrets");
  });

  it("handles provider create as sync control action without job polling", async () => {
    window.localStorage.setItem("cp_owner_mode", "1");
    await act(async () => {
      window.history.pushState({}, "", "/settings/providers");
      await router.navigate({ to: "/settings/providers" });
    });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Owner Provider Settings" })).toBeInTheDocument();
    expect((await screen.findAllByText("openai")).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.queryByText("Loading provider configs…")).toBeNull();
    });

    fireEvent.click(screen.getByText("Create provider config"));

    const createButton = screen.getByRole("button", { name: "Create provider" });
    expect(createButton).not.toBeDisabled();
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(calledPaths.filter((path) => path === "/providers/config").length).toBeGreaterThan(1);
    });
    expect(calledPaths.some((path) => path.startsWith("/jobs/"))).toBe(false);
  });

  it("derives system access from role without manual toggle", async () => {
    window.history.pushState({}, "", "/");

    const view = render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(screen.getByText("System Access: OWNER")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable owner" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disable owner" })).toBeNull();
    expect(calledPaths.some((path) => path.startsWith("/jobs/"))).toBe(false);
    view.unmount();
  });
});
