import { describe, expect, it } from "vitest";
import type { Job } from "@cp/domain";
import { getRunnerJobOutput } from "../services/job-dispatch-service.js";

const baseJob = (): Job =>
  ({
    id: "job_test",
    tenantId: "tenant_default",
    type: "system",
    title: "test",
    status: "done",
    priority: 0,
    retryCount: 0,
    maxRetries: 0,
    actionRequired: false,
    payload: {},
    dependencies: [],
    dependsOnCount: 0,
    ready: false,
    createdBy: "test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }) as Job;

describe("job dispatch output normalization", () => {
  it("unwraps local internal-runner payloads into canonical runner shape", () => {
    const job: Job = {
      ...baseJob(),
      payload: {
        output: {
          stage: "local_worker",
          machineId: "machine_001",
          result: {
            stage: "internal_runner",
            adapter: "internal_runner",
            logs: ["adapter=internal_runner"],
            output: {
              action: "coding.workflow.create",
              output: {
                id: "wf_001",
                state: "awaiting_plan_approval"
              }
            }
          }
        }
      }
    };

    const output = getRunnerJobOutput<{ result?: { id: string } }>(job);
    expect(output?.result?.id).toBe("wf_001");
  });

  it("returns non-local output without alteration", () => {
    const job: Job = {
      ...baseJob(),
      payload: {
        output: {
          stage: "internal_runner",
          action: "chat.process_message",
          result: { text: "ok" }
        }
      }
    };

    const output = getRunnerJobOutput<{ stage?: string; result?: { text?: string } }>(job);
    expect(output?.stage).toBe("internal_runner");
    expect(output?.result?.text).toBe("ok");
  });
});
