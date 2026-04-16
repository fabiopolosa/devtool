import { createInterface } from "node:readline/promises";
import { cpus, hostname, platform, totalmem } from "node:os";

export type LocalWorkerMode = "local" | "hybrid";
export type LocalWorkerAdapterId = "internal_runner" | "codex" | "claude" | "gemini" | "shell" | "docker";

export interface WorkerApiClient {
  post<T>(path: string, body?: unknown): Promise<T>;
}

export interface LocalWorkerDeps {
  runCommandFn: (
    command: string,
    args: string[],
    options?: { cwd?: string; allowNonZeroExit?: boolean }
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  sleepFn: (ms: number) => Promise<void>;
  out?: (line: string) => void;
  err?: (line: string) => void;
  confirmExecution?: (command: string) => Promise<boolean>;
}

export interface StartLocalWorkerInput {
  client: WorkerApiClient;
  deps: LocalWorkerDeps;
  mode: LocalWorkerMode;
  intervalMs?: number;
  once?: boolean;
  limit?: number;
  machineName?: string;
  machineHost?: string;
  explicitCapabilities?: string[];
  allowlist?: string[];
  requireConfirmation?: boolean;
  preferredLlm?: "codex" | "claude" | "gemini";
  fallbackProvider?: string;
}

export interface LocalWorkerRunSummary {
  machineId: string;
  mode: LocalWorkerMode;
  processed: number;
  failures: number;
  iterations: number;
  capabilities: string[];
}

interface WorkerExecutionJob {
  id: string;
  type: string;
  title: string;
  status: string;
  priority: number;
  actionRequired: boolean;
  updatedAt: string;
  payload?: Record<string, unknown>;
}

interface LocalWorkerMachine {
  id: string;
  name: string;
  host: string;
  services?: string[];
}

interface AdapterExecutionContext {
  client: WorkerApiClient;
  deps: LocalWorkerDeps;
  job: WorkerExecutionJob;
  payload: Record<string, unknown>;
  allowlist: string[];
  requireConfirmation: boolean;
}

interface AdapterExecutionOutput {
  result: {
    success: boolean;
    stage: "local_adapter" | "internal_runner";
    adapter: LocalWorkerAdapterId;
    logs: string[];
    output: Record<string, unknown>;
    patch?: string;
  };
  usage: {
    provider: "local";
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    metadata: Record<string, unknown>;
  };
}

interface LocalWorkerAdapter {
  id: LocalWorkerAdapterId;
  execute(input: AdapterExecutionContext): Promise<AdapterExecutionOutput>;
}

const localWorkerAdapterIds: LocalWorkerAdapterId[] = ["internal_runner", "codex", "claude", "gemini", "shell", "docker"];

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const toAdapterId = (value: unknown): LocalWorkerAdapterId | undefined => {
  const normalized = asString(value)?.toLowerCase();
  if (!normalized) return undefined;
  return localWorkerAdapterIds.includes(normalized as LocalWorkerAdapterId)
    ? (normalized as LocalWorkerAdapterId)
    : undefined;
};

const normalizeList = (items: string[]): string[] =>
  [...new Set(items.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0))];

const commandAllowed = (command: string, allowlist: string[]): boolean => {
  if (allowlist.length === 0) return true;
  const normalized = command.trim().toLowerCase();
  return allowlist.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
};

const resolveShellExecutable = (): string => {
  const fromEnv = process.env.SHELL?.trim();
  if (fromEnv) return fromEnv;
  return platform() === "win32" ? "cmd" : "zsh";
};

const extractPatch = (payload: Record<string, unknown>): string | undefined => {
  const localExecution = asRecord(payload.localExecution) ?? {};
  return asString(localExecution.patch) ?? asString(payload.patch);
};

const confirmExecution = async (input: {
  deps: LocalWorkerDeps;
  command: string;
  requireConfirmation: boolean;
}): Promise<boolean> => {
  if (!input.requireConfirmation) return true;
  if (input.deps.confirmExecution) return await input.deps.confirmExecution(input.command);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = await rl.question(`Confirm local execution: ${input.command} [y/N] `);
    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
};

const executeShellCommand = async (input: {
  deps: LocalWorkerDeps;
  command: string;
  cwd?: string;
  allowlist: string[];
  requireConfirmation: boolean;
}): Promise<{ stdout: string; stderr: string; exitCode: number; command: string }> => {
  const commandText = input.command.trim();
  if (!commandText) throw new Error("Missing command for local adapter execution");
  if (!commandAllowed(commandText, input.allowlist)) {
    throw new Error(`Command blocked by allowlist: ${commandText}`);
  }

  const confirmed = await confirmExecution({
    deps: input.deps,
    command: commandText,
    requireConfirmation: input.requireConfirmation
  });
  if (!confirmed) throw new Error(`Command not confirmed: ${commandText}`);

  const shell = resolveShellExecutable();
  const args =
    platform() === "win32"
      ? ["/c", commandText]
      : ["-lc", commandText];
  const result = await input.deps.runCommandFn(shell, args, {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    allowNonZeroExit: true
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Command failed with exit code ${result.exitCode}`);
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    command: commandText
  };
};

const executeCliAdapter = async (input: {
  deps: LocalWorkerDeps;
  binary: "codex" | "claude" | "gemini";
  requestText: string;
  cwd?: string;
}): Promise<{ stdout: string; stderr: string; exitCode: number; command: string }> => {
  if (!input.requestText.trim()) {
    throw new Error(`Missing request text for ${input.binary} adapter`);
  }

  const args =
    input.binary === "codex"
      ? ["exec", input.requestText]
      : input.binary === "claude"
        ? ["-p", input.requestText]
        : ["--prompt", input.requestText];

  const result = await input.deps.runCommandFn(input.binary, args, {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    allowNonZeroExit: true
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `${input.binary} exited with ${result.exitCode}`);
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    command: `${input.binary} ${args.join(" ")}`
  };
};

class InternalRunnerAdapter implements LocalWorkerAdapter {
  readonly id: LocalWorkerAdapterId = "internal_runner";

  async execute(input: AdapterExecutionContext): Promise<AdapterExecutionOutput> {
    const action = asString(input.payload.internalAction);
    if (!action) {
      throw new Error(`Job ${input.job.id} missing internalAction for internal_runner adapter`);
    }
    const response = await input.client.post<{ item?: unknown }>("/execution/internal-action", {
      action,
      payload: input.payload
    });
    const patch = extractPatch(input.payload);
    return {
      result: {
        success: true,
        stage: "internal_runner",
        adapter: this.id,
        logs: [`adapter=${this.id}`, `action=${action}`],
        output: {
          action,
          ...(response.item !== undefined ? { result: response.item, output: response.item } : {})
        },
        ...(patch ? { patch } : {})
      },
      usage: {
        provider: "local",
        model: this.id,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        metadata: {
          localUsage: true,
          adapter: this.id
        }
      }
    };
  }
}

abstract class CliPromptAdapter implements LocalWorkerAdapter {
  abstract readonly id: LocalWorkerAdapterId;
  abstract readonly binary: "codex" | "claude" | "gemini";

  async execute(input: AdapterExecutionContext): Promise<AdapterExecutionOutput> {
    const localExecution = asRecord(input.payload.localExecution) ?? {};
    const requestText = asString(input.payload.request) ?? asString(input.payload.prompt) ?? input.job.title;
    const cwd = asString(localExecution.cwd);
    const executed = await executeCliAdapter({
      deps: input.deps,
      binary: this.binary,
      requestText,
      ...(cwd ? { cwd } : {})
    });
    const patch = extractPatch(input.payload);
    return {
      result: {
        success: true,
        stage: "local_adapter",
        adapter: this.id,
        logs: [`adapter=${this.id}`, `command=${executed.command}`],
        output: {
          command: executed.command,
          stdout: executed.stdout,
          stderr: executed.stderr,
          exitCode: executed.exitCode
        },
        ...(patch ? { patch } : {})
      },
      usage: {
        provider: "local",
        model: this.id,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        metadata: {
          localUsage: true,
          adapter: this.id
        }
      }
    };
  }
}

class CodexAdapter extends CliPromptAdapter {
  readonly id: LocalWorkerAdapterId = "codex";
  readonly binary = "codex" as const;
}

class ClaudeAdapter extends CliPromptAdapter {
  readonly id: LocalWorkerAdapterId = "claude";
  readonly binary = "claude" as const;
}

class GeminiAdapter extends CliPromptAdapter {
  readonly id: LocalWorkerAdapterId = "gemini";
  readonly binary = "gemini" as const;
}

class ShellAdapter implements LocalWorkerAdapter {
  readonly id: LocalWorkerAdapterId = "shell";

  async execute(input: AdapterExecutionContext): Promise<AdapterExecutionOutput> {
    const localExecution = asRecord(input.payload.localExecution) ?? {};
    const command = asString(localExecution.command) ?? asString(input.payload.command);
    if (!command) {
      throw new Error(`Job ${input.job.id} missing command for shell adapter`);
    }
    const cwd = asString(localExecution.cwd);
    const executed = await executeShellCommand({
      deps: input.deps,
      command,
      ...(cwd ? { cwd } : {}),
      allowlist: input.allowlist,
      requireConfirmation: input.requireConfirmation
    });
    const patch = extractPatch(input.payload);
    return {
      result: {
        success: true,
        stage: "local_adapter",
        adapter: this.id,
        logs: [`adapter=${this.id}`, `command=${executed.command}`],
        output: {
          command: executed.command,
          stdout: executed.stdout,
          stderr: executed.stderr,
          exitCode: executed.exitCode
        },
        ...(patch ? { patch } : {})
      },
      usage: {
        provider: "local",
        model: this.id,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        metadata: {
          localUsage: true,
          adapter: this.id,
          command: executed.command
        }
      }
    };
  }
}

class DockerAdapter implements LocalWorkerAdapter {
  readonly id: LocalWorkerAdapterId = "docker";

  async execute(input: AdapterExecutionContext): Promise<AdapterExecutionOutput> {
    const localExecution = asRecord(input.payload.localExecution) ?? {};
    const command = asString(localExecution.command) ?? asString(input.payload.command) ?? "docker ps";
    const cwd = asString(localExecution.cwd);
    const executed = await executeShellCommand({
      deps: input.deps,
      command,
      ...(cwd ? { cwd } : {}),
      allowlist: input.allowlist,
      requireConfirmation: input.requireConfirmation
    });
    const patch = extractPatch(input.payload);
    return {
      result: {
        success: true,
        stage: "local_adapter",
        adapter: this.id,
        logs: [`adapter=${this.id}`, `command=${executed.command}`],
        output: {
          command: executed.command,
          stdout: executed.stdout,
          stderr: executed.stderr,
          exitCode: executed.exitCode
        },
        ...(patch ? { patch } : {})
      },
      usage: {
        provider: "local",
        model: this.id,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        metadata: {
          localUsage: true,
          adapter: this.id,
          command: executed.command
        }
      }
    };
  }
}

const adapters: Record<LocalWorkerAdapterId, LocalWorkerAdapter> = {
  internal_runner: new InternalRunnerAdapter(),
  codex: new CodexAdapter(),
  claude: new ClaudeAdapter(),
  gemini: new GeminiAdapter(),
  shell: new ShellAdapter(),
  docker: new DockerAdapter()
};

const resolveAdapter = (payload: Record<string, unknown>): LocalWorkerAdapter => {
  const execution = asRecord(payload.execution) ?? {};
  const adapterId =
    toAdapterId(execution.adapter) ??
    toAdapterId(payload.adapter) ??
    (typeof payload.internalAction === "string" ? "internal_runner" : "shell");
  return adapters[adapterId];
};

const commandExists = async (deps: LocalWorkerDeps, command: string): Promise<boolean> => {
  const result = await deps.runCommandFn("which", [command], { allowNonZeroExit: true });
  return result.exitCode === 0;
};

export const detectLocalWorkerCapabilities = async (deps: LocalWorkerDeps): Promise<string[]> => {
  const capabilities = new Set<string>(["shell", "internal_runner"]);
  if (await commandExists(deps, "codex")) capabilities.add("codex");
  if (await commandExists(deps, "claude")) capabilities.add("claude");
  if (await commandExists(deps, "gemini")) capabilities.add("gemini");
  if (await commandExists(deps, "docker")) capabilities.add("docker");
  return [...capabilities].sort((left, right) => left.localeCompare(right));
};

const executeJobLocally = async (input: {
  client: WorkerApiClient;
  deps: LocalWorkerDeps;
  job: WorkerExecutionJob;
  allowlist: string[];
  requireConfirmation: boolean;
}): Promise<AdapterExecutionOutput> => {
  const payload = asRecord(input.job.payload) ?? {};
  const adapter = resolveAdapter(payload);
  return await adapter.execute({
    client: input.client,
    deps: input.deps,
    job: input.job,
    payload,
    allowlist: input.allowlist,
    requireConfirmation: input.requireConfirmation
  });
};

export const startLocalWorker = async (input: StartLocalWorkerInput): Promise<LocalWorkerRunSummary> => {
  if (input.mode === "local" || input.mode === "hybrid") {
    // valid modes
  } else {
    throw new Error("Local worker supports only local or hybrid mode");
  }

  const intervalMs = Math.max(250, Math.trunc(input.intervalMs ?? 1500));
  const once = input.once ?? false;
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 5)));
  const detectedCapabilities = await detectLocalWorkerCapabilities(input.deps);
  const capabilities = normalizeList([...(input.explicitCapabilities ?? []), ...detectedCapabilities]);
  const allowlist = normalizeList(input.allowlist ?? []);
  const requireConfirmation = input.requireConfirmation ?? true;
  const output = input.deps.out ?? (() => undefined);
  const errorOutput = input.deps.err ?? (() => undefined);

  const workerName = asString(input.machineName) ?? `${hostname()}-local-worker`;
  const workerHost = asString(input.machineHost) ?? hostname();

  const register = await input.client.post<{ item: LocalWorkerMachine }>("/execution/workers/register", {
    name: workerName,
    host: workerHost,
    mode: input.mode,
    capabilities,
    metadata: {
      platform: platform(),
      cpuCores: cpus().length,
      ramGb: Math.round(totalmem() / 1024 / 1024 / 1024),
      ...(input.preferredLlm ? { preferredLlm: input.preferredLlm } : {}),
      ...(input.fallbackProvider ? { fallbackProvider: input.fallbackProvider } : {})
    }
  });

  const machineId = register.item.id;
  let processed = 0;
  let failures = 0;
  let iterations = 0;

  while (true) {
    await input.client.post<{ item: LocalWorkerMachine }>(`/execution/workers/${machineId}/heartbeat`, {
      status: "online",
      capabilities
    });

    const claim = await input.client.post<{ items?: WorkerExecutionJob[] }>("/execution/jobs/claim", {
      machineId,
      mode: input.mode,
      capabilities,
      limit
    });
    const jobs = claim.items ?? [];
    if (jobs.length === 0) {
      output(`worker idle: mode=${input.mode} machine=${machineId}`);
      iterations += 1;
      if (once) break;
      await input.deps.sleepFn(intervalMs);
      continue;
    }

    for (const job of jobs) {
      try {
        const execution = await executeJobLocally({
          client: input.client,
          deps: input.deps,
          job,
          allowlist,
          requireConfirmation
        });
        await input.client.post(`/execution/jobs/${job.id}/complete`, {
          machineId,
          result: execution.result,
          usage: execution.usage
        });
        processed += 1;
        output(`worker completed job ${job.id}`);
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : "local worker execution failed";
        await input.client.post(`/execution/jobs/${job.id}/fail`, {
          machineId,
          error: message,
          metadata: {
            stage: "local_worker",
            mode: input.mode
          }
        });
        errorOutput(`worker failed job ${job.id}: ${message}`);
      }
    }

    iterations += 1;
    if (once) break;
    await input.deps.sleepFn(intervalMs);
  }

  return {
    machineId,
    mode: input.mode,
    processed,
    failures,
    iterations,
    capabilities
  };
};
