import { render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Settings knowledge smoke", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("cp_owner_mode", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path.startsWith("/knowledge/config")) {
          return jsonResponse({
            item: {
              id: "knowledge_cfg_1",
              tenantId: "tenant_default",
              scope: "tenant",
              autoCapture: false,
              captureModes: ["generation_output"],
              requireApproval: false,
              maxNodes: 8,
              relevanceThreshold: 0.2,
              versioning: true,
              requireReview: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              createdBy: "seed",
              updatedAt: "2026-01-01T00:00:00.000Z",
              updatedBy: "seed"
            },
            source: "tenant",
            items: []
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders settings knowledge page and effective policy panels", async () => {
    window.history.pushState({}, "", "/settings/knowledge");
    await router.navigate({ to: "/settings/knowledge" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Knowledge Configuration" })).toBeInTheDocument();
    expect(await screen.findByText("Effective Policy")).toBeInTheDocument();
    expect(await screen.findByText("Capture Settings")).toBeInTheDocument();
    expect(await screen.findByText("Retrieval Settings")).toBeInTheDocument();
  });
});

