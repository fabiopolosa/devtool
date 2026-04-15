import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "../store/app-store";
import { SettingsPromptsPage } from "../pages/SettingsPromptsPage";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Settings prompts smoke", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path.startsWith("/prompts")) {
          return jsonResponse({
            items: [
              {
                id: "prompt_001",
                type: "planner",
                scope: "tenant",
                target: "planner",
                version: "v1",
                content: "Prompt registry content",
                status: "active",
                tenantId: "tenant_default",
                createdAt: "2026-01-01T00:00:00.000Z",
                createdBy: "test",
                updatedAt: "2026-01-01T00:00:00.000Z",
                updatedBy: "test"
              }
            ]
          });
        }

        return jsonResponse({ items: [] });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders the prompt registry workspace", async () => {
    render(
      <AppStoreProvider authEnabledOverride={false}>
        <SettingsPromptsPage />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Prompt Registry" })).toBeInTheDocument();
    expect(await screen.findByText("Prompt registry content")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Prompt prompt_001" })).toBeInTheDocument();
  });
});
