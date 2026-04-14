import type { VerificationRunRequest, VerifierResult } from "@cp/domain";
import type { VerificationStepExecution } from "./types.js";
import { buildVerificationSummary, normalizeStepResult, summarizeOverallStatus } from "./normalization.js";

export interface VerificationResultBuildInput {
  request: VerificationRunRequest;
  executions: VerificationStepExecution[];
}

export const buildVerifierResult = ({ request, executions }: VerificationResultBuildInput): VerifierResult => {
  const steps = request.commands.map((command, index) => {
    const execution = executions[index];
    if (!execution) {
      return {
        stepType: command.stepType,
        command: command.command,
        status: "skipped" as const
      };
    }
    return normalizeStepResult(request.runId, command, execution, index);
  });

  const artifacts = executions
    .filter((execution): execution is VerificationStepExecution & { artifact: NonNullable<VerificationStepExecution["artifact"]> } => Boolean(execution.artifact))
    .map((execution) => ({
      artifactId: execution.artifact.artifactId,
      uri: execution.artifact.uri,
      type: execution.artifact.type,
      summary: execution.artifact.summary
    }));

  return {
    runId: request.runId,
    taskId: request.taskId,
    overallStatus: summarizeOverallStatus(steps),
    summary: buildVerificationSummary(steps),
    steps,
    artifacts
  };
};
