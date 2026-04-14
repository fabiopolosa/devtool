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

const installFetchMock = (): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
      const path = `${url.pathname}${url.search}`;

      if (path.startsWith("/subprompts")) {
        return jsonResponse({
          items: [
            {
              id: "stack_postgres",
              title: "PostgreSQL stack",
              category: "stack",
              summary: "Use PostgreSQL + Prisma",
              prompt: "Prefer PostgreSQL + Prisma for medium projects.",
              tags: ["postgres", "prisma"],
              sourcePath: "configs/subprompts/stack-postgres-prisma.json",
              enabled: true
            }
          ]
        });
      }

      if (path === "/mcp/status") {
        return jsonResponse({
          enabled: false,
          message: "MCP non configurato"
        });
      }

      if (path === "/mcp/connections") {
        return jsonResponse({ items: [] });
      }

      if (path === "/mcp/runs") {
        return jsonResponse({ items: [] });
      }

      return jsonResponse({ items: [] });
    })
  );
};

describe("Brainstorming and MCP pages smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders brainstorming page", async () => {
    installFetchMock();
    window.history.pushState({}, "", "/brainstorming");
    await router.navigate({ to: "/brainstorming" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Brainstorming" })).toBeInTheDocument();
    expect(screen.getByText("Session Input")).toBeInTheDocument();
  });

  it("renders MCP page guard when auth is disabled", async () => {
    installFetchMock();
    window.history.pushState({}, "", "/mcp");
    await router.navigate({ to: "/mcp" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "MCP" })).toBeInTheDocument();
    expect(screen.getByText(/available when authentication is enabled/i)).toBeInTheDocument();
  });
});
