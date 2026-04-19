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
              adapterType: "legacy_cli",
              desiredSkills: ["checks"],
              runtimeProfile: {
                runtimeKind: "desktop_cli",
                vendor: "openai_codex",
                host: "desktop_app",
                launchMode: "interactive",
                args: [],
                metadata: {}
              },
              heartbeatPolicy: {
                interval: "5m",
                triggers: ["manual", "on_startup"],
                enabled: true,
                metadata: {}
              },
              runtimeConfig: {
                commandPrefix: "devtools-agent",
                agentProfile: {
                  purpose: "Coordinate feature delivery",
                  workMode: "coordinator",
                  persona: "Calm and focused",
                  language: "en-US",
                  compatibility: ["mcp_runtime", "desktop_cli"],
                  supportedProviders: ["openai_codex"],
                  supportedModes: ["desktop_cli", "interactive"],
                  artifacts: {
                    "agent.md": "# agent",
                    "soul.md": "# soul"
                  }
                }
              },
              capabilities: ["coding"],
              createdAt: "2026-04-14T10:00:00.000Z",
              updatedAt: "2026-04-14T10:00:00.000Z",
              status: "active"
            }
          ]
        });
      }

      if (path === "/agents/agent_001") {
        return jsonResponse({
          item: {
            id: "agent_001",
            name: "codex-builder-primary",
            role: "codex_builder",
            icon: "tool",
            description: "Primary builder",
            adapterType: "legacy_cli",
            desiredSkills: ["checks"],
            runtimeProfile: {
              runtimeKind: "desktop_cli",
              vendor: "openai_codex",
              host: "desktop_app",
              launchMode: "interactive",
              args: [],
              metadata: {}
            },
            heartbeatPolicy: {
              interval: "5m",
              triggers: ["manual", "on_startup"],
              enabled: true,
              metadata: {}
            },
            runtimeConfig: {
              commandPrefix: "devtools-agent",
              agentProfile: {
                purpose: "Coordinate feature delivery",
                workMode: "coordinator",
                persona: "Calm and focused",
                language: "en-US",
                compatibility: ["mcp_runtime", "desktop_cli"],
                supportedProviders: ["openai_codex"],
                supportedModes: ["desktop_cli", "interactive"],
                artifacts: {
                  "agent.md": "# agent",
                  "soul.md": "# soul"
                }
              }
            },
            capabilities: ["coding"],
            createdAt: "2026-04-14T10:00:00.000Z",
            updatedAt: "2026-04-14T10:00:00.000Z",
            status: "active"
          }
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
    window.localStorage.clear();
  });

  it("renders agents list page", async () => {
    installApiFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/agents");
    await router.navigate({ to: "/settings/agents" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Agent Library" })).toBeInTheDocument();
    expect(await screen.findByText(/codex-builder-primary/i)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Tenant library" })).toBeInTheDocument();
    expect(screen.getByText(/Local CLI · OpenAI Codex CLI/i)).toBeInTheDocument();
  });

  it("renders agent create page", async () => {
    installApiFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/agents/new");
    await router.navigate({ to: "/settings/agents/new" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Agent creation wizard")).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Purpose" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Agent name (e.g. codex-builder-primary)")).toBeInTheDocument();
  });

  it("renders agent detail profile section", async () => {
    installApiFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/agents/agent_001");
    await router.navigate({ to: "/settings/agents/$agentId", params: { agentId: "agent_001" } });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Readable profile" })).toBeInTheDocument();
    expect(await screen.findByText(/agent.md artifact/i)).toBeInTheDocument();
    expect(await screen.findByText(/soul.md artifact/i)).toBeInTheDocument();
  });

  it("renders runtime diagnostics page", async () => {
    installApiFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/runtime");
    await router.navigate({ to: "/settings/runtime" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Ruflo & Runtime" })).toBeInTheDocument();
    expect(await screen.findByText("Workflow runtime parameters")).toBeInTheDocument();
  });
});
