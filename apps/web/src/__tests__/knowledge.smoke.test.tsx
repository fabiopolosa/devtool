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

describe("Knowledge page smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders project knowledge workspace with seeded items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path.startsWith("/knowledge")) {
          return jsonResponse({
            items: [
              {
                id: "k_1",
                scope: "project",
                tenantId: "tenant_default",
                projectId: "proj-control-plane",
                path: "/projects/proj-control-plane/notes/runtime.md",
                content: "# Runtime\n\nDeterministic retries enabled.",
                createdAt: "2026-01-01T00:00:00.000Z",
                createdBy: "seed",
                updatedAt: "2026-01-01T00:00:00.000Z",
                updatedBy: "seed"
              }
            ]
          });
        }

        return jsonResponse({ items: [] });
      })
    );

    window.history.pushState({}, "", "/project/proj-control-plane/knowledge");
    await router.navigate({
      to: "/project/$projectId/knowledge",
      params: { projectId: "proj-control-plane" }
    });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Knowledge" })).toBeInTheDocument();
    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("Edit node")).toBeInTheDocument();
  });
});
