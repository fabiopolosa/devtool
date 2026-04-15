import { render, screen, within } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const installProvidersFetchMock = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
      const path = `${url.pathname}${url.search}`;

      if (path === "/providers") {
        return jsonResponse({
          items: [
            {
              id: "prov-openai",
              provider: "openai",
              endpoint: "https://api.openai.com/v1",
              authRef: "secret://openai/api-key",
              enabled: true,
              timeoutMs: 30000,
              metadata: {},
              createdAt: "2026-04-14T10:00:00.000Z",
              createdBy: "test",
              updatedAt: "2026-04-14T10:00:00.000Z",
              updatedBy: "test"
            }
          ]
        });
      }

      if (path === "/providers/capabilities") {
        return jsonResponse({
          items: [
            {
              id: "cap-openai-chat",
              providerConfigId: "prov-openai",
              capabilityClass: "chat_reasoning",
              supported: true,
              createdAt: "2026-04-14T10:00:00.000Z",
              createdBy: "test",
              updatedAt: "2026-04-14T10:00:00.000Z",
              updatedBy: "test"
            }
          ]
        });
      }

      if (path === "/providers/models") {
        return jsonResponse({
          items: [
            {
              id: "legacy-openai-gpt-4.1",
              providerConfigId: "prov-openai",
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

      if (path === "/models?refresh=1" || path === "/models") {
        return jsonResponse({
          items: [
            {
              id: "openai:gpt-5.1",
              provider: "openai",
              modelId: "gpt-5.1",
              displayName: "GPT-5.1",
              contextWindow: 256000,
              pricing: { input: 1.25, output: 10 },
              capabilities: ["chat_reasoning"],
              enabled: true,
              source: "live"
            }
          ]
        });
      }

      if (path === "/providers/bindings") {
        return jsonResponse({ items: [] });
      }

      if (path === "/providers/health") {
        return jsonResponse({ items: [] });
      }

      if (path === "/providers/discovery/logs") {
        return jsonResponse({ items: [] });
      }

      return jsonResponse({ items: [] });
    })
  );
};

describe("Providers page smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders live normalized models from /models", async () => {
    installProvidersFetchMock();
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/models");
    await router.navigate({ to: "/settings/models" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Provider Discovery" })).toBeInTheDocument();
    expect(await screen.findByText("GPT-5.1")).toBeInTheDocument();
    const discoverySection = screen.getByRole("heading", { name: "Model discovery" }).closest("section");
    expect(discoverySection).toBeTruthy();
    const scoped = within(discoverySection as HTMLElement);
    expect(scoped.getAllByText("openai").length).toBeGreaterThan(0);
    expect(scoped.getByText("256,000 tokens")).toBeInTheDocument();
  });
});
