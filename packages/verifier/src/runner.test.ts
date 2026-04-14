import { DefaultVerificationRunner } from "./runner.js";
import type { CommandExecutor } from "./executor.js";

const createExecutor = (): CommandExecutor => ({
  async execute(request) {
    const now = new Date().toISOString();
    const fail = request.command.includes("pnpm test");
    return {
      status: fail ? "fail" : "pass",
      exitCode: fail ? 1 : 0,
      timedOut: false,
      stdout: fail ? "failing test output" : "ok",
      stderr: fail ? "AssertionError" : "",
      startedAt: now,
      endedAt: now,
      durationMs: 10,
      outputUri: `/tmp/${request.command.replace(/\s+/g, "_")}.log`
    };
  }
});

describe("verification runner", () => {
  it("normalizes step results and generates artifact refs", async () => {
    const runner = new DefaultVerificationRunner({ executor: createExecutor() });
    const result = await runner.run({
      runId: "run_001",
      taskId: "task_001",
      commands: [
        { stepType: "lint", command: "pnpm lint", cwd: "/tmp" },
        { stepType: "test", command: "pnpm test", cwd: "/tmp" },
        { stepType: "build", command: "pnpm build", cwd: "/tmp" }
      ]
    });

    expect(result.runId).toBe("run_001");
    expect(result.steps).toHaveLength(3);
    expect(result.overallStatus).toBe("partial");
    expect(result.steps[1]?.status).toBe("fail");
    expect(result.artifacts.length).toBe(3);
    expect(result.summary.toLowerCase()).toContain("verification completed");
  });
});
