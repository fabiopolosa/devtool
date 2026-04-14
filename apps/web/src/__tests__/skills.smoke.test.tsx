import { render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

describe("Skills page smoke", () => {
  it("renders skills page route", async () => {
    window.history.pushState({}, "", "/skills");
    await router.navigate({ to: "/skills" });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Skills")).toBeInTheDocument();
    expect(
      screen.getByText("Skills management is available only when authentication is enabled.")
    ).toBeInTheDocument();
  });
});
