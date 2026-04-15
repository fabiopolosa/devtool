import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Runtime telemetry tabs smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders audit and usage tabs with telemetry summaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const path = (() => {
          try {
            return new URL(rawUrl, "http://localhost:5173").pathname;
          } catch {
            return rawUrl;
          }
        })();

        if (path.startsWith("/agents/runtime/workflows")) {
          return jsonResponse({ items: [] });
        }
        if (path.startsWith("/agents")) {
          return jsonResponse({
            items: [
              {
                id: "agent_runtime_1",
                name: "Runtime Runner",
                role: "verifier",
                icon: "⚙",
                description: "Runtime agent",
                adapterType: "paperclip_cli",
                desiredSkills: [],
                runtimeConfig: {},
                capabilities: ["chat_reasoning"],
                createdAt: "2026-04-15T08:00:00.000Z",
                updatedAt: "2026-04-15T08:00:00.000Z",
                status: "active"
              }
            ]
          });
        }
        if (path.startsWith("/mcp/status")) {
          return jsonResponse({ enabled: false, message: "MCP non configurato" });
        }
        if (path.startsWith("/mcp/connections")) {
          return jsonResponse({ items: [] });
        }
        if (path.startsWith("/audit")) {
          return jsonResponse({
            items: [
              {
                id: "audit_1",
                tenantId: "tenant_default",
                projectId: "project_runtime",
                jobId: "job_runtime",
                action: "job.start",
                resourceType: "job",
                resourceId: "job_runtime",
                status: "success",
                occurredAt: "2026-04-15T08:00:00.000Z",
                metadata: {}
              }
            ],
            summary: {
              total: 1,
              success: 1,
              failure: 0,
              byAction: [{ action: "job.start", total: 1, success: 1, failure: 0 }]
            }
          });
        }
        if (path.startsWith("/usage")) {
          return jsonResponse({
            items: [
              {
                id: "usage_1",
                tenantId: "tenant_default",
                projectId: "project_runtime",
                jobId: "job_runtime",
                provider: "openai",
                model: "gpt-5",
                inputTokens: 120,
                outputTokens: 80,
                cost: 0.006,
                metadata: {},
                createdAt: "2026-04-15T08:00:00.000Z",
                createdBy: "runner",
                updatedAt: "2026-04-15T08:00:00.000Z",
                updatedBy: "runner"
              }
            ],
            summary: {
              totalCount: 1,
              totalCost: 0.006,
              totalInputTokens: 120,
              totalOutputTokens: 80,
              byProvider: [
                {
                  key: "openai",
                  count: 1,
                  totalCost: 0.006,
                  totalInputTokens: 120,
                  totalOutputTokens: 80
                }
              ],
              byModel: [
                {
                  key: "gpt-5",
                  count: 1,
                  totalCost: 0.006,
                  totalInputTokens: 120,
                  totalOutputTokens: 80
                }
              ]
            }
          });
        }
        return jsonResponse({ items: [] });
      })
    );

    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/runtime");
    await router.navigate({ to: "/settings/runtime" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Audit / Usage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Audit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getAllByText(/job.start/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Usage" }));
    await waitFor(() => {
      expect(screen.getAllByText(/\$0\.0060/).length).toBeGreaterThan(0);
    });
  });
});
