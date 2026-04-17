import { useEffect, useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useAppStore } from "../store/app-store";

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
});
