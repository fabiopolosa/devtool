import { buildVerificationPipelinePlan, evaluateVerificationGate } from "./pipeline.js";
import { buildDashboardHookConfig } from "./tooling.js";

describe("verifier pipeline", () => {
  it("builds required and optional hook steps", () => {
    const plan = buildVerificationPipelinePlan({
      runId: "run_001",
      taskId: "task_001",
      cwd: "/Users/andromeda/devtool",
      hooks: {
        smoke: {
          enabled: true,
          commands: ["pnpm test:smoke"],
          required: false
        },
        visual: {
          enabled: true,
          commands: ["pnpm verify:visual"],
          required: false
        }
      }
    });

    expect(plan.steps.map((step) => step.stepType)).toEqual(["lint", "test", "build", "smoke", "visual"]);
    expect(plan.steps.filter((step) => step.required).length).toBe(3);
  });

  it("evaluates gate by separating required and optional failures", () => {
    const plan = buildVerificationPipelinePlan({
      runId: "run_002",
      taskId: "task_002",
      cwd: "/tmp",
      hooks: {
        performance: {
          enabled: true,
          commands: ["pnpm verify:performance"],
          required: false
        }
      }
    });

    const evaluation = evaluateVerificationGate(plan, {
      runId: "run_002",
      taskId: "task_002",
      overallStatus: "partial",
      summary: "mixed",
      steps: [
        { stepType: "lint", command: "pnpm lint", status: "pass" },
        { stepType: "test", command: "pnpm test", status: "fail" },
        { stepType: "build", command: "pnpm build", status: "pass" },
        { stepType: "performance", command: "pnpm verify:performance", status: "fail" }
      ],
      artifacts: []
    });

    expect(evaluation.gateStatus).toBe("fail");
    expect(evaluation.requiredFailures).toHaveLength(1);
    expect(evaluation.optionalFailures).toHaveLength(1);
  });

  it("builds dashboard hook commands for smoke/visual/performance", () => {
    const hooks = buildDashboardHookConfig({ cwd: "/Users/andromeda/devtool", visualRequired: true });

    expect(hooks.smoke?.commands[0]).toBe("pnpm verify:smoke");
    expect(hooks.visual?.commands[0]).toBe("pnpm verify:visual");
    expect(hooks.visual?.required).toBe(true);
    expect(hooks.performance?.commands[0]).toBe("pnpm verify:performance");
  });
});
