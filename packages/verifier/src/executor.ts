import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface CommandExecutionRequest {
  command: string;
  cwd: string;
  timeoutMs?: number;
}

export interface CommandExecutionResult {
  status: "pass" | "fail";
  exitCode?: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  outputUri?: string;
}

export interface CommandExecutor {
  execute(request: CommandExecutionRequest): Promise<CommandExecutionResult>;
}

const nowIso = () => new Date().toISOString();

const truncate = (value: string, max = 20000) => (value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value);

export class NodeCommandExecutor implements CommandExecutor {
  async execute(request: CommandExecutionRequest): Promise<CommandExecutionResult> {
    const startedAt = nowIso();
    const started = Date.now();
    const stdoutParts: string[] = [];
    const stderrParts: string[] = [];
    const timeoutMs = request.timeoutMs ?? 120000;

    const tempDir = await mkdtemp(path.join(tmpdir(), "cp-verifier-"));
    const outputUri = path.join(tempDir, `${randomUUID()}.log`);

    return await new Promise<CommandExecutionResult>((resolve) => {
      const child = spawn(request.command, {
        cwd: request.cwd,
        shell: true,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: process.env.NODE_ENV ?? "test"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1500).unref();
      }, timeoutMs);
      timer.unref();

      child.stdout?.on("data", (chunk) => stdoutParts.push(chunk.toString("utf8")));
      child.stderr?.on("data", (chunk) => stderrParts.push(chunk.toString("utf8")));

      child.on("error", async (error) => {
        clearTimeout(timer);
        const endedAt = nowIso();
        const durationMs = Date.now() - started;
        const stdout = truncate(stdoutParts.join(""));
        const stderr = truncate(`${stderrParts.join("")}${stderrParts.length ? "\n" : ""}${String(error)}`);
        await writeFile(outputUri, JSON.stringify({ command: request.command, cwd: request.cwd, error: String(error), stdout, stderr }, null, 2), "utf8");
        resolve({
          status: "fail",
          timedOut: false,
          stdout,
          stderr,
          startedAt,
          endedAt,
          durationMs,
          ...(outputUri ? { outputUri } : {})
        });
      });

      child.on("close", async (exitCode, signal) => {
        clearTimeout(timer);
        const endedAt = nowIso();
        const durationMs = Date.now() - started;
        const stdout = truncate(stdoutParts.join(""));
        const stderr = truncate(stderrParts.join(""));
        const timedOut = signal === "SIGTERM" || signal === "SIGKILL";
        const status = exitCode === 0 && !timedOut ? "pass" : "fail";

        await writeFile(
          outputUri,
          JSON.stringify({ command: request.command, cwd: request.cwd, exitCode, signal, timedOut, stdout, stderr }, null, 2),
          "utf8"
        );

        resolve({
          status,
          ...(typeof exitCode === "number" ? { exitCode } : {}),
          timedOut,
          stdout,
          stderr,
          startedAt,
          endedAt,
          durationMs,
          ...(outputUri ? { outputUri } : {})
        });
      });
    });
  }
}
