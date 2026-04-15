import { act, fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const installFetchMock = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
      const path = `${url.pathname}${url.search}`;

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
};

describe("Owner mode + settings providers smoke", () => {
  beforeEach(() => {
    window.localStorage.clear();
    installFetchMock();
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
    expect(await screen.findByText("Configured Providers")).toBeInTheDocument();
    expect((await screen.findAllByText("openai")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Default Tenant")).toBeInTheDocument();
  });

  it("shows global Platform nav link with new shell labels", async () => {
    await act(async () => {
      window.history.pushState({}, "", "/");
      await router.navigate({ to: "/" });
    });

    const first = render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Platform" }));
    });
    const defaultLink = document.querySelector('a.nav-link[href="/settings/providers"]');
    expect(defaultLink).not.toBeNull();
    expect(screen.getAllByText("Providers").length).toBeGreaterThan(0);
    first.unmount();

    window.localStorage.setItem("cp_owner_mode", "1");
    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Platform" }));
    });
    const ownerSettingsLink = document.querySelector('a.nav-link[href="/settings/providers"]');
    expect(ownerSettingsLink).not.toBeNull();
    expect(screen.getAllByText("Providers").length).toBeGreaterThan(0);
  });
});
