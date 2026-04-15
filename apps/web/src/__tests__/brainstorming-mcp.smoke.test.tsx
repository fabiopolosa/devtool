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

      if (path.startsWith("/brainstorm/plan/")) {
        return jsonResponse({
          item: {
            id: "plan_001",
            sessionId: "session_001",
            title: "Brainstorm Plan",
            executiveSummary: "Summary",
            createdAt: "2026-01-01T00:00:00.000Z",
            createdBy: "test",
            updatedAt: "2026-01-01T00:00:00.000Z",
            updatedBy: "test",
            plan: {
              recommendedStack: {
                database: "PostgreSQL",
                backend: "Fastify",
                frontend: "React",
                llmProviders: ["openai"],
                vectorStore: "pgvector"
              },
              architecture: {
                repositoryStrategy: "monorepo",
                packageLayout: ["apps/api", "apps/web"],
                rationale: "Single control-plane repository"
              },
              suggestedAgents: [],
              suggestedSkills: [],
              providerBindings: [],
              roadmap: [],
              assumptions: [],
              risks: [],
              composedPrompt: "Composed prompt",
              selectedSubprompts: []
            }
          }
        });
      }

      if (path.startsWith("/brainstorm/")) {
        return jsonResponse({
          item: {
            session: {
              id: "session_001",
              status: "planned",
              projectIntent: "Intent",
              selectedSubpromptIds: [],
              questions: [],
              answers: {},
              createdAt: "2026-01-01T00:00:00.000Z",
              createdBy: "test",
              updatedAt: "2026-01-01T00:00:00.000Z",
              updatedBy: "test"
            },
            plans: []
          }
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

  it("renders brainstorm plan page by id", async () => {
    installFetchMock();
    window.history.pushState({}, "", "/brainstorm/plan_001");
    await router.navigate({ to: "/brainstorm/$id", params: { id: "plan_001" } });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Brainstorm Plan" })).toBeInTheDocument();
    expect(screen.getByText("Recommended stack")).toBeInTheDocument();
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
