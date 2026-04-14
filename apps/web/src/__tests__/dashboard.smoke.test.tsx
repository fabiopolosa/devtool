import { render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

describe("Web smoke", () => {
  it("renders command center shell", async () => {
    render(
      <AppStoreProvider>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Command Center")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
  });
});
