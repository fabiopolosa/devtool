import { describe, expect, it } from "vitest";
import { startLocalWorker, type WorkerApiClient } from "./index.js";

describe("@cp/worker-local", () => {
  it("executes internal runner jobs through the direct internal runner endpoint", async () => {
    const calls: Array<{ path: string; body?: unknown }> = [];
    const client: WorkerApiClient = {
      post: async <T>(path: string, body?: unknown): Promise<T> => {
        calls.push({ path, body });

        if (path === "/execution/workers/register") {
          return { item: { id: "machine-1" } } as T;
        }
        if (path === "/execution/workers/machine-1/heartbeat") {
          return { item: { id: "machine-1" } } as T;
        }
        if (path === "/execution/jobs/claim") {
          return {
            items: [
              {
                id: "job-1",
                type: "system",
                title: "Internal runner job",
                status: "idle",
                priority: 1,
                actionRequired: false,
                updatedAt: "2026-04-17T00:00:00.000Z",
                payload: {
                  internalAction: "agent.runtime.heartbeat",
                  agentId: "agent_001",
                  reason: "unit-test"
                }
              }
            ]
          } as T;
        }
        if (path === "/internal/runner/execute") {
          return {
            item: {
              success: true,
              action: "agent.runtime.heartbeat",
              result: { jobId: "job-1", state: "queued" }
            }
          } as T;
        }
        if (path === "/execution/jobs/job-1/complete") {
          return { item: { ok: true } } as T;
        }

        throw new Error(`Unexpected path: ${path}`);
      }
    };

    const summary = await startLocalWorker({
      client,
      deps: {
        runCommandFn: async (command) => {
          if (command === "which") {
            return { exitCode: 1, stdout: "", stderr: "" };
          }
          throw new Error(`Unexpected command: ${command}`);
        },
        sleepFn: async () => undefined,
        out: () => undefined,
        err: () => undefined
      },
      mode: "local",
      once: true,
      limit: 1,
      requireConfirmation: false
    });

    expect(summary.processed).toBe(1);
    expect(summary.failures).toBe(0);
    expect(calls.some((call) => call.path === "/internal/runner/execute")).toBe(true);
    expect(calls.some((call) => call.path === "/execution/internal-action")).toBe(false);
  });
});
