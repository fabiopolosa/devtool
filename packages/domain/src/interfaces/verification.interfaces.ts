import type { ID } from "../entities.js";
import type { VerifierResult } from "../schemas/verifier-result.schema.js";

export interface VerificationCommand {
  stepType: "lint" | "test" | "build" | "smoke" | "visual" | "performance";
  command: string;
  cwd: string;
  timeoutMs?: number;
}

export interface VerificationRunRequest {
  runId: ID;
  taskId: ID;
  commands: VerificationCommand[];
}

export interface VerificationRunner {
  run(request: VerificationRunRequest): Promise<VerifierResult>;
}
