import type { VerificationCommand, VerificationRunRequest, VerifierResult } from "@cp/domain";

export type OptionalHookType = "smoke" | "visual" | "performance";

export interface OptionalHookConfig {
  enabled: boolean;
  commands: string[];
  cwd?: string;
  timeoutMs?: number;
  required?: boolean;
}

export interface VerificationPipelineConfig {
  runId: string;
  taskId: string;
  cwd: string;
  includeBaseCommands?: boolean;
  lintCommand?: string;
  testCommand?: string;
  buildCommand?: string;
  hooks?: Partial<Record<OptionalHookType, OptionalHookConfig>>;
}

export interface VerificationStepPlan {
  stepType: VerificationCommand["stepType"];
  command: string;
  cwd: string;
  timeoutMs?: number;
  required: boolean;
  source: "base" | "optional_hook";
}

export interface VerificationPipelinePlan {
  request: VerificationRunRequest;
  steps: VerificationStepPlan[];
}

export interface VerificationGateEvaluation {
  gateStatus: "pass" | "fail";
  requiredFailures: string[];
  optionalFailures: string[];
}

const defaultBaseCommands = {
  lint: "pnpm lint",
  test: "pnpm test",
  build: "pnpm build"
};

export const buildVerificationPipelinePlan = (config: VerificationPipelineConfig): VerificationPipelinePlan => {
  const steps: VerificationStepPlan[] = [];
  const includeBaseCommands = config.includeBaseCommands ?? true;

  if (includeBaseCommands) {
    steps.push(
      {
        stepType: "lint",
        command: config.lintCommand ?? defaultBaseCommands.lint,
        cwd: config.cwd,
        required: true,
        source: "base"
      },
      {
        stepType: "test",
        command: config.testCommand ?? defaultBaseCommands.test,
        cwd: config.cwd,
        required: true,
        source: "base"
      },
      {
        stepType: "build",
        command: config.buildCommand ?? defaultBaseCommands.build,
        cwd: config.cwd,
        required: true,
        source: "base"
      }
    );
  }

  const optionalStepTypes: OptionalHookType[] = ["smoke", "visual", "performance"];
  for (const stepType of optionalStepTypes) {
    const hook = config.hooks?.[stepType];
    if (!hook?.enabled) {
      continue;
    }

    for (const command of hook.commands) {
      steps.push({
        stepType,
        command,
        cwd: hook.cwd ?? config.cwd,
        ...(hook.timeoutMs !== undefined ? { timeoutMs: hook.timeoutMs } : {}),
        required: hook.required ?? false,
        source: "optional_hook"
      });
    }
  }

  return {
    request: {
      runId: config.runId,
      taskId: config.taskId,
      commands: steps.map((step) => ({
        stepType: step.stepType,
        command: step.command,
        cwd: step.cwd,
        ...(step.timeoutMs !== undefined ? { timeoutMs: step.timeoutMs } : {})
      }))
    },
    steps
  };
};

export const evaluateVerificationGate = (
  plan: VerificationPipelinePlan,
  result: VerifierResult
): VerificationGateEvaluation => {
  const requiredFailures: string[] = [];
  const optionalFailures: string[] = [];

  for (let index = 0; index < result.steps.length; index += 1) {
    const stepResult = result.steps[index];
    const stepPlan = plan.steps[index];
    if (!stepResult || !stepPlan || stepResult.status !== "fail") {
      continue;
    }

    const label = `${stepPlan.stepType}:${stepPlan.command}`;
    if (stepPlan.required) {
      requiredFailures.push(label);
    } else {
      optionalFailures.push(label);
    }
  }

  return {
    gateStatus: requiredFailures.length > 0 ? "fail" : "pass",
    requiredFailures,
    optionalFailures
  };
};
