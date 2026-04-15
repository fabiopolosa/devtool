import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router/router";
import { AppStoreProvider } from "../store/app-store";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

describe("Schemas graph smoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the project schemas graph with node selection and section switching", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path.startsWith("/schema-docs")) {
          return jsonResponse({
            items: [
              {
                id: "schema_doc_001",
                title: "Control-plane schema",
                description: "schema",
                databaseName: "devtool",
                dialect: "postgresql",
                tables: [
                  {
                    tableName: "projects",
                    schemaName: "public",
                    columns: [
                      { name: "id", dataType: "text", nullable: false },
                      { name: "name", dataType: "text", nullable: false }
                    ],
                    primaryKeyColumns: ["id"]
                  },
                  {
                    tableName: "tasks",
                    schemaName: "public",
                    columns: [
                      { name: "id", dataType: "text", nullable: false },
                      { name: "project_id", dataType: "text", nullable: false }
                    ],
                    primaryKeyColumns: ["id"]
                  }
                ],
                conventions: [{ key: "Naming", value: "snake_case" }],
                stackNotes: ["Fastify + Drizzle"],
                lastIntrospectedAt: "2026-04-14T10:00:00.000Z",
                createdAt: "2026-04-14T10:00:00.000Z",
                createdBy: "test",
                updatedAt: "2026-04-14T10:00:00.000Z",
                updatedBy: "test"
              }
            ]
          });
        }

        if (path === "/agents") {
          return jsonResponse({
            items: [
              {
                id: "agent_001",
                name: "Builder",
                role: "builder",
                icon: "B",
                description: "Builds projects",
                adapterType: "codex",
                desiredSkills: [],
                reportTo: "manager",
                runtimeConfig: {},
                capabilities: ["build"],
                status: "active",
                createdAt: "2026-04-14T10:00:00.000Z",
                updatedAt: "2026-04-14T10:00:00.000Z"
              }
            ]
          });
        }

        if (path.startsWith("/jobs")) {
          return jsonResponse({
            items: [
              {
                id: "job_001",
                tenantId: "tenant_default",
                projectId: "proj-control-plane",
                type: "generation",
                title: "Generate schema graph",
                status: "ready",
                actionRequired: false,
                actionType: "input",
                resourceType: "brainstorm",
                resourceId: "bs_001",
                createdBy: "you",
                priority: 50,
                retryCount: 0,
                maxRetries: 3,
                dependencies: [],
                dependsOnCount: 0,
                ready: true,
                payload: {},
                createdAt: "2026-04-14T10:00:00.000Z",
                updatedAt: "2026-04-14T10:00:00.000Z"
              }
            ]
          });
        }

        return jsonResponse({ items: [] });
      })
    );

    window.history.pushState({}, "", "/project/proj-control-plane/schemas");
    await router.navigate({
      to: "/project/$projectId/schemas",
      params: { projectId: "proj-control-plane" }
    });

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <RouterProvider router={router} />
      </AppStoreProvider>
    );

    expect(await screen.findByRole("heading", { name: "Database" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "ER Diagram" })).toBeInTheDocument();
    expect(await screen.findByText("public.projects")).toBeInTheDocument();

    await screen.findByText("public.tasks");
    const apiTab = screen.getByRole("button", { name: /API Contracts/i });
    fireEvent.click(apiTab);
    expect(await screen.findByText("GET /jobs")).toBeInTheDocument();
  });
});
