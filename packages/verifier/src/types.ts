import type { VerificationCommand, VerificationRunRequest } from "@cp/domain";

export type VerificationFailureClass =
  | "timeout"
  | "non_zero_exit"
  | "spawn_failure"
  | "skipped"
  | "unknown";

export interface VerificationStepExecution {
  command: VerificationCommand;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode?: number;
  stdout: string;
  stderr: string;
  status: "pass" | "fail" | "skipped";
  failureClass?: VerificationFailureClass;
  outputRef?: string;
  artifact?: VerificationArtifact;
}

export interface VerificationArtifact {
  artifactId: string;
  uri: string;
  type: "verification_log" | "command_output";
  summary: string;
}

export interface VerificationExecutionPlan extends VerificationRunRequest {
  cwdLabel?: string;
}
