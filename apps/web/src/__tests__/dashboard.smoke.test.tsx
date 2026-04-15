import { render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Web smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders command center shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ items: [] }))
    );

    render(
      <AppStoreProvider>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("link", { name: "DevTools Home" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Activity" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Platform" })).toBeInTheDocument();
    expect(screen.getByText("Launcher")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /agent chat/i })).toBeInTheDocument();
  });
});
