import type { VerificationCommand, VerifierResult, VerifierStepResult } from "@cp/domain";
import type { VerificationArtifact, VerificationFailureClass, VerificationStepExecution } from "./types.js";

export const classifyFailure = (execution: VerificationStepExecution): VerificationFailureClass | undefined => {
  if (execution.status === "skipped") {
    return "skipped";
  }

  if (execution.failureClass) {
    return execution.failureClass;
  }

  const stderr = execution.stderr.toLowerCase();
  if (stderr.includes("timed out") || stderr.includes("timeout")) {
    return "timeout";
  }

  if (execution.exitCode !== undefined && execution.exitCode !== 0) {
    return "non_zero_exit";
  }

  if (execution.exitCode === undefined && stderr.length > 0) {
    return "spawn_failure";
  }

  return undefined;
};

export const buildVerificationArtifact = (
  requestId: string,
  execution: VerificationStepExecution,
  index: number
): VerificationArtifact => ({
  artifactId: `artifact_${requestId}_${index}`,
  uri: execution.outputRef ?? `file://${execution.artifact?.uri ?? ""}`,
  type: execution.artifact?.type ?? "verification_log",
  summary: `${execution.command.stepType} step output (${execution.status})`
});

export const normalizeStepResult = (
  requestId: string,
  command: VerificationCommand,
  execution: VerificationStepExecution,
  index: number
): VerifierStepResult => {
  const artifact = buildVerificationArtifact(requestId, execution, index);
  return {
    stepType: command.stepType,
    command: command.command,
    status: execution.status,
    ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    durationMs: execution.durationMs,
    ...(artifact.uri ? { outputRef: artifact.uri } : {})
  };
};

export const summarizeOverallStatus = (steps: VerifierStepResult[]): VerifierResult["overallStatus"] => {
  if (steps.length === 0) {
    return "skipped";
  }

  const anyFail = steps.some((step) => step.status === "fail");
  const allSkipped = steps.every((step) => step.status === "skipped");
  if (allSkipped) {
    return "skipped";
  }
  if (anyFail) {
    return steps.some((step) => step.status === "pass") ? "partial" : "fail";
  }
  return "pass";
};

export const buildVerificationSummary = (steps: VerifierStepResult[]): string => {
  const passed = steps.filter((step) => step.status === "pass").length;
  const failed = steps.filter((step) => step.status === "fail").length;
  const skipped = steps.filter((step) => step.status === "skipped").length;
  return `Verification completed: ${passed} passed, ${failed} failed, ${skipped} skipped.`;
};
