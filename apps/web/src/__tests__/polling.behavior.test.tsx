import { useEffect, useRef, useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useAppStore } from "../store/app-store";
import { DashboardPage } from "../pages/DashboardPage";
import { ProjectsPage } from "../pages/ProjectsPage";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

function ConcurrentFetchProbe() {
  const {
    authActions: { apiFetchJson }
  } = useAppStore();
  const [status, setStatus] = useState("idle");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    let cancelled = false;

    void (async () => {
      setStatus("loading");
      await Promise.all([
        apiFetchJson<{ items?: unknown[] }>("/agents"),
        apiFetchJson<{ items?: unknown[] }>("/agents")
      ]);
      if (!cancelled) {
        setStatus("done");
      }
    })().catch(() => {
      if (!cancelled) {
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [apiFetchJson]);

  return <div>{status}</div>;
}

describe("Polling behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("deduplicates concurrent GET JSON requests through the app store", async () => {
    let agentCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path === "/projects") {
          return jsonResponse({ items: [] });
        }

        if (path === "/agents") {
          agentCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return jsonResponse({ items: [] });
        }

        return jsonResponse({ items: [] });
      })
    );

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <ConcurrentFetchProbe />
      </AppStoreProvider>
    );

    expect(await screen.findByText("done")).toBeInTheDocument();
    expect(agentCalls).toBe(1);
  });

  it("refreshes the dashboard on a relaxed 12 second cadence", async () => {
    vi.useFakeTimers();
    let dashboardJobsCalls = 0;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path === "/jobs") {
          dashboardJobsCalls += 1;
          return jsonResponse({ items: [] });
        }

        if (path === "/models") {
          return jsonResponse({ source: "mock" });
        }

        return jsonResponse({ items: [] });
      })
    );

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <DashboardPage />
      </AppStoreProvider>
    );

    expect(screen.getByText("Situation Awareness")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const initialCalls = dashboardJobsCalls;
    expect(initialCalls).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(dashboardJobsCalls).toBe(initialCalls);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(dashboardJobsCalls).toBe(initialCalls + 1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(dashboardJobsCalls).toBe(initialCalls + 2);
  });

  it("does not refetch /projects on every store update", async () => {
    let projectCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = raw.includes("://") ? new URL(raw) : new URL(raw, "http://localhost");
        const path = `${url.pathname}${url.search}`;

        if (path === "/projects") {
          projectCalls += 1;
          return jsonResponse({
            items: [
              {
                id: "proj_001",
                tenantId: "tenant_default",
                key: "ALPHA",
                name: "Alpha",
                description: "Primary workspace",
                status: "active",
                createdAt: "2026-01-01T00:00:00.000Z",
                createdBy: "tester",
                updatedAt: "2026-01-01T00:00:00.000Z",
                updatedBy: "tester"
              }
            ]
          });
        }

        return jsonResponse({ items: [] });
      })
    );

    render(
      <AppStoreProvider authEnabledOverride={false}>
        <ProjectsPage />
      </AppStoreProvider>
    );

    expect(await screen.findByText("Alpha")).toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(projectCalls).toBe(1);
  });
});
