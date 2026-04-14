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

const installApiFetchMock = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
      const path = `${url.pathname}${url.search}`;

      if (path === "/agents") {
        return jsonResponse({
          items: [
            {
              id: "agent_001",
              name: "codex-builder-primary",
              role: "codex_builder",
              icon: "tool",
              description: "Primary builder",
              adapterType: "paperclip_cli",
              desiredSkills: ["checks"],
              runtimeConfig: { commandPrefix: "paperclipai" },
              capabilities: ["coding"],
              createdAt: "2026-04-14T10:00:00.000Z",
              updatedAt: "2026-04-14T10:00:00.000Z",
              status: "active"
            }
          ]
        });
      }

      if (path === "/skills/installed") {
        return jsonResponse({
          items: [
            {
              id: "skill_001",
              name: "checks",
              description: "Checks skill",
              repositoryUrl: "https://github.com/example/skills-checks",
              version: "1.0.0",
              installed: true,
              categories: ["quality"],
              instructions: "Run checks",
              createdAt: "2026-04-14T10:00:00.000Z",
              createdBy: "test",
              updatedAt: "2026-04-14T10:00:00.000Z",
              updatedBy: "test"
            }
          ]
        });
      }

      if (path === "/agents/runtime/workflows") {
        return jsonResponse({
          items: [
            {
              id: "task_execute",
              version: "v1",
              maxRetries: 2,
              maxInputTokens: 32000,
              maxOutputTokens: 8000,
              maxCostUsd: 5,
              escalationRule: "on_failure_repeat"
            }
          ]
        });
      }

      return jsonResponse({ items: [] });
    })
  );
};

describe("Agents pages smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders agents list page", async () => {
    installApiFetchMock();
    window.history.pushState({}, "", "/agents");
    await router.navigate({ to: "/agents" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Agents" })).toBeInTheDocument();
    expect(await screen.findByText(/codex-builder-primary/i)).toBeInTheDocument();
  });

  it("renders agent create page", async () => {
    installApiFetchMock();
    window.history.pushState({}, "", "/agents/new");
    await router.navigate({ to: "/agents/new" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Create Agent")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Agent name (e.g. codex-builder-primary)")).toBeInTheDocument();
  });

  it("renders runtime diagnostics page", async () => {
    installApiFetchMock();
    window.history.pushState({}, "", "/runtime");
    await router.navigate({ to: "/runtime" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Ruflo & Runtime" })).toBeInTheDocument();
    expect(await screen.findByText("Workflow runtime parameters")).toBeInTheDocument();
  });
});
