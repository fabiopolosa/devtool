import { render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

describe("Skills page smoke", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders skills page route", async () => {
    window.localStorage.setItem("cp_owner_mode", "1");
    window.history.pushState({}, "", "/settings/skills");
    await router.navigate({ to: "/settings/skills" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(
      await screen.findByText("Skills management is available only when authentication is enabled.")
    ).toBeInTheDocument();
  });
});
