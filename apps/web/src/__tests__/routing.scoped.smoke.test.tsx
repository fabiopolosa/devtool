import { render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Scoped routing smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("supports project scoped approvals route", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [] })));
    window.history.pushState({}, "", "/project/proj-control-plane/approvals");
    await router.navigate({
      to: "/project/$projectId/approvals",
      params: { projectId: "proj-control-plane" }
    });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/project/proj-control-plane/approvals");
    });
  });

  it("supports platform scoped providers configuration route", async () => {
    window.localStorage.setItem("cp_owner_mode", "1");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [] })));
    window.history.pushState({}, "", "/settings/providers");
    await router.navigate({ to: "/settings/providers" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings/providers");
    });
  });

  it("supports project scoped brainstorming route", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [] })));
    window.history.pushState({}, "", "/project/proj-control-plane/brainstorming");
    await router.navigate({
      to: "/project/$projectId/brainstorming",
      params: { projectId: "proj-control-plane" }
    });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/project/proj-control-plane/brainstorming");
    });
  });
});
