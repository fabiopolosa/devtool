import { act, fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const installModelsFetchMock = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
      const path = `${url.pathname}${url.search}`;

      if (path === "/providers/config") {
        return jsonResponse({
          items: [
            {
              id: "cfg_openai",
              tenantId: "tenant_default",
              provider: "openai",
              providerId: "openai",
              enabled: true,
              timeoutMs: 30000,
              authRef: "secret://openai/api-key",
              apiKey: "***"
            }
          ]
        });
      }

      if (path === "/models?refresh=1" || path === "/models") {
        return jsonResponse({
          source: "live",
          items: [
            {
              id: "openai:gpt-5.1",
              provider: "openai",
              modelId: "gpt-5.1",
              displayName: "GPT-5.1",
              contextWindow: 256000,
              pricing: { input: 1.25, output: 10 },
              capabilities: ["chat_reasoning", "coding"],
              enabled: true,
              source: "live"
            }
          ]
        });
      }

      if (path === "/providers/models?includeDisabled=1") {
        return jsonResponse({
          items: [
            {
              id: "legacy-openai-gpt-4.1",
              providerConfigId: "cfg_openai",
              modelId: "gpt-4.1",
              capabilityClass: "coding",
              contextWindow: 128000,
              maxOutputTokens: 16384,
              pricingMeta: { input: 1.25, output: 6.5 },
              enabled: true,
              createdAt: "2026-04-14T10:00:00.000Z",
              createdBy: "test",
              updatedAt: "2026-04-14T10:00:00.000Z",
              updatedBy: "test"
            }
          ]
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
};

describe("Models page smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders models policy under /settings/models and persists local policy edits", async () => {
    installModelsFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/models");
    await router.navigate({ to: "/settings/models" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Models Policy" })).toBeInTheDocument();
    expect(await screen.findByText("GPT-5.1")).toBeInTheDocument();
    expect((await screen.findAllByText("chat_reasoning")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("e.g. Fast reasoner"), {
      target: { value: "Primary GPT" }
    });
    expect(await screen.findByText("Primary GPT")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "premium" }));
    fireEvent.click(screen.getByRole("button", { name: "Enabled" }));
    expect(await screen.findByRole("button", { name: "Disabled" })).toBeInTheDocument();

    const persisted = window.localStorage.getItem("cp.models.policy.v1");
    expect(persisted).toContain("Primary GPT");
    expect(persisted).toContain("premium");
  });

  it("supports tenant alias route for models policy", async () => {
    installModelsFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    await act(async () => {
      window.history.pushState({}, "", "/tenant/models");
      await router.navigate({ to: "/tenant/models" });
    });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Models Policy" })).toBeInTheDocument();
    expect(await screen.findByText("openai")).toBeInTheDocument();
  });
});
