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

describe("Settings workers smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders workers settings page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;
        if (path === "/machines") {
          return jsonResponse({
            items: [
              {
                id: "machine_local_1",
                name: "Local Worker",
                host: "localhost",
                status: "online",
                services: ["shell", "internal_runner"],
                agents: ["local-worker"],
                lastHeartbeatAt: new Date().toISOString(),
                metadata: { execution: { mode: "local" } }
              }
            ]
          });
        }
        return jsonResponse({ items: [] });
      })
    );

    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/workers");
    await router.navigate({ to: "/settings/workers" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Workers" })).toBeInTheDocument();
    expect(await screen.findByText(/machine_local_1/)).toBeInTheDocument();
  });
});
