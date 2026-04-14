import type { VerificationRunner, VerificationRunRequest } from "@cp/domain";
import { verifierResultSchema } from "@cp/domain";
import { buildVerifierResult } from "./result-builder.js";
import type { CommandExecutor } from "./executor.js";
import { NodeCommandExecutor } from "./executor.js";
import type { VerificationStepExecution } from "./types.js";
import { classifyFailure } from "./normalization.js";

export interface VerificationRunnerOptions {
  executor?: CommandExecutor;
}

const toStepExecution = (
  request: VerificationRunRequest,
  index: number,
  raw: Awaited<ReturnType<CommandExecutor["execute"]>>
): VerificationStepExecution => {
  const command = request.commands[index]!;
  const failureClass = raw.status === "pass" ? undefined : raw.timedOut ? "timeout" : raw.exitCode !== undefined ? "non_zero_exit" : "spawn_failure";
  const normalized: VerificationStepExecution = {
    command,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    durationMs: raw.durationMs,
    stdout: raw.stdout,
    stderr: raw.stderr,
    status: raw.status,
    ...(raw.exitCode !== undefined ? { exitCode: raw.exitCode } : {}),
    ...(() => {
      const classified =
        failureClass ??
        classifyFailure({
          command,
          startedAt: raw.startedAt,
          endedAt: raw.endedAt,
          durationMs: raw.durationMs,
          ...(raw.exitCode !== undefined ? { exitCode: raw.exitCode } : {}),
          stdout: raw.stdout,
          stderr: raw.stderr,
          status: raw.status
        });
      return classified ? { failureClass: classified } : {};
    })(),
    ...(raw.outputUri ? { outputRef: raw.outputUri } : {}),
    ...(raw.outputUri
      ? {
          artifact: {
            artifactId: `${request.runId}-${index}`,
            uri: raw.outputUri,
            type: "verification_log",
            summary: `${command.stepType} output log`
          }
        }
      : {})
  };
  return normalized;
};

export class DefaultVerificationRunner implements VerificationRunner {
  private readonly executor: CommandExecutor;

  constructor(options: VerificationRunnerOptions = {}) {
    this.executor = options.executor ?? new NodeCommandExecutor();
  }

  async run(request: VerificationRunRequest) {
    const executions: VerificationStepExecution[] = [];

    for (let index = 0; index < request.commands.length; index += 1) {
      const command = request.commands[index]!;
      const raw = await this.executor.execute({
        command: command.command,
        cwd: command.cwd,
        ...(command.timeoutMs !== undefined ? { timeoutMs: command.timeoutMs } : {})
      });
      executions.push(toStepExecution(request, index, raw));
    }

    const result = buildVerifierResult({ request, executions });
    return verifierResultSchema.parse(result);
  }
}

export const createVerificationRunner = (options?: VerificationRunnerOptions): VerificationRunner => new DefaultVerificationRunner(options);
