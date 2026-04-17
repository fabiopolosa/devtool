import { randomUUID } from "node:crypto";
import type { Job } from "@cp/domain";
import {
  claimExecutionJobs,
  completeExecutionJob,
  failExecutionJob,
  heartbeatExecutionWorker,
  registerExecutionWorker
} from "../../services/execution-router-service.js";
import { executeInternalRunnerAction } from "../../services/internal-runner-action-service.js";

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

export interface TestExecutionWorkerHarnessOptions {
  tenantIds?: string[];
  mode?: "local" | "hybrid";
  pollIntervalMs?: number;
  capabilities?: string[];
  actor?: string;
}

export interface TestExecutionWorkerHarness {
  machineIds: Record<string, string>;
  stop: () => Promise<void>;
}

const defaultCapabilities = ["internal_runner", "shell", "codex", "claude", "gemini", "docker"];

const buildInternalRunnerResult = (action: string, result: unknown): Record<string, unknown> => ({
  success: true,
  stage: "internal_runner",
  adapter: "internal_runner",
  logs: [`adapter=internal_runner`, `action=${action}`],
  output: {
    action,
    result,
    output: result
  }
});

const executeClaimedJob = async (input: {
  tenantId: string;
  machineId: string;
  actor: string;
  job: Job;
}): Promise<void> => {
  const payload = asRecord(input.job.payload) ?? {};
  const action = asString(payload.internalAction);
  if (!action) {
    throw new Error(`Claimed job ${input.job.id} is missing payload.internalAction`);
  }

  const result = await executeInternalRunnerAction({
    action,
    payload
  });

  await completeExecutionJob({
    tenantId: input.tenantId,
    jobId: input.job.id,
    machineId: input.machineId,
    actor: input.actor,
    result: buildInternalRunnerResult(action, result)
  });
};

export const startTestExecutionWorkerHarness = async (
  options: TestExecutionWorkerHarnessOptions = {}
): Promise<TestExecutionWorkerHarness> => {
  const tenantIds = options.tenantIds && options.tenantIds.length > 0 ? [...new Set(options.tenantIds)] : ["tenant_default"];
  const mode = options.mode ?? "local";
  const pollIntervalMs = Math.max(20, options.pollIntervalMs ?? 40);
  const capabilities = options.capabilities && options.capabilities.length > 0 ? options.capabilities : defaultCapabilities;
  const actor = options.actor ?? "test_execution_worker";
  const hostSuffix = randomUUID().slice(0, 8);

  const machineIds: Record<string, string> = {};
  for (const tenantId of tenantIds) {
    const machine = await registerExecutionWorker({
      tenantId,
      actor,
      mode,
      capabilities,
      name: `test-worker-${tenantId}`,
      host: `test-worker-${hostSuffix}`
    });
    machineIds[tenantId] = machine.id;
  }

  let active = true;
  const loopPromise = (async () => {
    while (active) {
      let processed = 0;

      for (const tenantId of tenantIds) {
        const machineId = machineIds[tenantId];
        if (!machineId) continue;

        await heartbeatExecutionWorker({
          tenantId,
          machineId,
          actor,
          status: "online",
          capabilities
        });

        const claimed = await claimExecutionJobs({
          tenantId,
          machineId,
          actor,
          mode,
          capabilities,
          limit: 8
        });
        if (claimed.length === 0) continue;

        for (const job of claimed) {
          processed += 1;
          try {
            await executeClaimedJob({
              tenantId,
              machineId,
              actor,
              job
            });
          } catch (error) {
            await failExecutionJob({
              tenantId,
              jobId: job.id,
              machineId,
              actor,
              error: error instanceof Error ? error.message : "Test worker execution failed",
              metadata: {
                stage: "test_execution_worker",
                mode
              }
            });
          }
        }
      }

      if (!active) break;
      if (processed === 0) {
        await sleep(pollIntervalMs);
      }
    }
  })();

  return {
    machineIds,
    stop: async () => {
      active = false;
      await loopPromise;
      await Promise.all(
        tenantIds.map(async (tenantId) => {
          const machineId = machineIds[tenantId];
          if (!machineId) return;
          try {
            await heartbeatExecutionWorker({
              tenantId,
              machineId,
              actor,
              status: "offline",
              capabilities
            });
          } catch {
            // ignore shutdown failures in tests
          }
        })
      );
    }
  };
};
