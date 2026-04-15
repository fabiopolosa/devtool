import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "../store/app-store";
import { ContextPage } from "../pages/ContextPage";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Context page smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders project context notes with editor and reader", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path.startsWith("/context")) {
          return jsonResponse({
            items: [
              {
                id: "ctx_001",
                tenantId: "tenant_default",
                projectId: "proj-control-plane",
                path: "/projects/proj-control-plane/context/strategy.md",
                title: "Strategy",
                content: "# Strategy\n\nUse project-scoped notes for decisions.",
                tags: ["strategy", "decisions"],
                linkRefs: ["./overview.md"],
                pinned: true,
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

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <ContextPage projectId="proj-control-plane" />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Context" })).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Edit note")).toBeInTheDocument();
    expect(screen.getByText("Reader")).toBeInTheDocument();
    expect(screen.getAllByText("Strategy").length).toBeGreaterThan(0);
  });
});
