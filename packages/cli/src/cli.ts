import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { startLocalWorker } from "@cp/worker-local";

type FlagValue = string | boolean;

export interface CliDeps {
  fetchFn: typeof fetch;
  env: NodeJS.ProcessEnv;
  readFileFn: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFileFn: (path: string, data: string, encoding: BufferEncoding) => Promise<void>;
  mkdirFn: (path: string, options: { recursive: true }) => Promise<void>;
  runCommandFn: (
    command: string,
    args: string[],
    options?: { cwd?: string; allowNonZeroExit?: boolean }
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  homeDirFn: () => string;
  sleepFn: (ms: number) => Promise<void>;
  openExternalFn: (url: string) => Promise<void>;
  out: (line: string) => void;
  err: (line: string) => void;
}

type ExecutionMode = "remote" | "local" | "hybrid";

interface ExecutionProfileConfig {
  defaultMode?: ExecutionMode;
  preferredLlm?: "codex" | "claude" | "gemini";
  fallbackProvider?: string;
  commandAllowlist?: string[];
  requireCommandConfirmation?: boolean;
  updatedAt?: string;
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, FlagValue>;
}

interface ApiClientOptions {
  baseUrl: string;
  tenantId?: string;
  token?: string;
  apiKey?: string;
}

interface CliConfig {
  currentProjectId?: string;
  currentProjectName?: string;
  tenantId?: string;
  apiBaseUrl?: string;
  updatedAt?: string;
}

interface ProjectItem {
  id: string;
  key: string;
  name: string;
  status: string;
}

interface WorkspaceItem {
  id: string;
  tenantId: string;
  projectId: string;
  mode: "local" | "remote";
  localPath?: string;
  runtimeStatus: string;
  runtimeDetails?: Record<string, unknown>;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  lastDeployedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProviderConfigItem {
  id: string;
  provider?: string;
  providerId?: string;
  enabled: boolean;
  validationStatus?: string;
  validationError?: string;
  lastValidatedAt?: string;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface JobItem {
  id: string;
  type: string;
  title: string;
  status: string;
  priority: number;
  actionRequired: boolean;
  updatedAt: string;
  projectId?: string;
}

interface JobRuntimeSnapshot {
  item?: {
    logs?: Array<{ timestamp: string; event: string; message: string }>;
  };
}

interface MachineSummary {
  id: string;
  name?: string;
  host?: string;
  status?: string;
  agents?: string[];
  services?: string[];
  lastHeartbeatAt?: string;
  metadata?: Record<string, unknown>;
}

interface CodingWorkflowItem {
  id: string;
  state: string;
  title: string;
  request?: string;
  updatedAt?: string;
  actionRequired?: boolean;
  reviewSummary?: string;
  plan?: {
    summary?: string;
  };
  generatedTaskIds?: string[];
}

interface AsyncJobHandle {
  jobId?: string;
  status?: string;
  item?: CodingWorkflowItem;
  message?: string;
}

interface CommandResult {
  lines: string[];
  json: unknown;
  quietLine?: string;
  openUrl?: string;
  openByDefault?: boolean;
}

interface ExecutionModeResolution {
  mode: ExecutionMode;
  source: "flag" | "auto_local_worker" | "profile" | "fallback";
  reason: string;
  machineId?: string;
}

interface ParsedProviderKeys {
  openai?: string;
  openrouter?: string;
  sourcePath?: string;
}

interface ProviderBootstrapResult {
  provider: string;
  providerConfigId?: string;
  status: "ok" | "error" | "skipped";
  latencyMs?: number;
  models: string[];
  error?: string;
}

interface DefaultAgentSpec {
  name: string;
  role: string;
  icon: string;
  description: string;
  capabilities: string[];
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const helpText = `
Usage:
  devtools init [<name>] [--provider <provider>]

  devtools project create <name> [--description <text>] [--key <project-key>]
  devtools project list
  devtools project use <id|name|key>
  devtools workspace attach <path> [--project <project-id>] [--mode <local|remote>]
  devtools workspace start [--project <project-id>] [--mode <local|remote|hybrid>]
  devtools workspace stop [--project <project-id>] [--mode <local|remote|hybrid>]
  devtools workspace deploy [--project <project-id>] [--mode <local|remote|hybrid>]
  devtools workspace restart [--project <project-id>] [--mode <local|remote|hybrid>]

  devtools providers test <provider|provider-config-id>

  devtools coding run --request <text> [--project <project-id>] [--title <text>] [--no-auto-approve]
  devtools worker status
  devtools worker start [--mode <local|hybrid>] [--interval <ms>] [--once]
  devtools worker stop [<machine-id>]

  devtools jobs list [--status <status>] [--project <project-id>] [--all]
  devtools logs tail [--job <job-id>] [--project <project-id>] [--interval <ms>] [--once]

  devtools context open [--project <project-id>]
  devtools agents list
  devtools agents create <name> --role <role> [--description <text>] [--capabilities a,b]
  devtools agents edit <id> [--name <name>] [--role <role>] [--description <text>] [--capabilities a,b]

Global options:
  --base-url <url>    API base URL (default: DEVTOOLS_API_BASE_URL or http://localhost:4000)
  --web-url <url>     Web UI base URL (default: DEVTOOLS_WEB_BASE_URL or derived from --base-url)
  --api-file <path>   Provider keys file for init bootstrap (default: ./documents/api.txt or ~/Documents/api.txt)
  --openai-key <key>  OpenAI API key override for init provider bootstrap
  --openrouter-key <key> OpenRouter API key override for init provider bootstrap
  --tenant <id>       Tenant id header (default: DEVTOOLS_TENANT_ID or tenant_default)
  --token <token>     Bearer token (default: DEVTOOLS_TOKEN, DEVTOOLS_LOCAL_TOKEN, ~/.devtools/token)
  --api-key <key>     API key sent as x-api-key (default: DEVTOOLS_API_KEY)
  --mode <mode>       Execution mode: remote | local | hybrid
  --json              Emit machine-readable output
  --quiet             Minimal human output
  --open              Open browser on resulting project/workspace page when applicable
  --yes               Auto-confirm local command execution
  --debug             Show debug payloads
  --help              Show this message
`.trim();

const openExternalDefault = async (url: string): Promise<void> => {
  const platform = process.platform;
  const invocation =
    platform === "darwin"
      ? { command: "open", args: [url] }
      : platform === "win32"
        ? { command: "cmd", args: ["/c", "start", "", url] }
        : { command: "xdg-open", args: [url] };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: "ignore",
      detached: true
    });
    child.on("error", reject);
    child.unref();
    resolve();
  });
};

const runCommandDefault = async (
  command: string,
  args: string[],
  options?: { cwd?: string; allowNonZeroExit?: boolean }
): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...(options?.cwd ? { cwd: options.cwd } : {}),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const exitCode = typeof code === "number" ? code : 1;
      if (exitCode !== 0 && !options?.allowNonZeroExit) {
        reject(new Error(`Command failed (${command} ${args.join(" ")}): ${stderr.trim() || `exit ${exitCode}`}`));
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });

const defaultDeps = (): CliDeps => ({
  fetchFn: fetch,
  env: process.env,
  readFileFn: readFile,
  writeFileFn: async (path: string, data: string, encoding: BufferEncoding) => {
    await writeFile(path, data, { encoding });
  },
  mkdirFn: async (path: string, options: { recursive: true }) => {
    await mkdir(path, options);
  },
  runCommandFn: runCommandDefault,
  homeDirFn: homedir,
  sleepFn: async (ms: number) => {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },
  openExternalFn: openExternalDefault,
  out: (line: string) => {
    process.stdout.write(`${line}\n`);
  },
  err: (line: string) => {
    process.stderr.write(`${line}\n`);
  }
});

const parseArgs = (argv: string[]): ParsedArgs => {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    if (token === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--no-")) {
      flags[token.slice("--no-".length)] = false;
      continue;
    }

    const [rawKey, rawValue] = token.slice(2).split("=", 2);
    const key = (rawKey ?? "").trim();
    if (!key) continue;

    if (rawValue !== undefined) {
      flags[key] = rawValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
      continue;
    }

    flags[key] = true;
  }

  return { positional, flags };
};

const asStringFlag = (flags: Record<string, FlagValue>, key: string): string | undefined => {
  const value = flags[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asBooleanFlag = (flags: Record<string, FlagValue>, key: string, fallback: boolean): boolean => {
  const value = flags[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  }
  return fallback;
};

const asIntegerFlag = (flags: Record<string, FlagValue>, key: string): number | undefined => {
  const value = asStringFlag(flags, key);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toExecutionMode = (value: string | undefined): ExecutionMode | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "remote" || normalized === "local" || normalized === "hybrid") {
    return normalized;
  }
  return undefined;
};

const toBaseUrl = (input: string | undefined): string => {
  const candidate = (input ?? "").trim();
  if (!candidate) return "http://localhost:4000";
  return candidate.replace(/\/$/, "");
};

const deriveWebBaseUrl = (apiBaseUrl: string, explicit: string | undefined): string => {
  const direct = (explicit ?? "").trim();
  if (direct) return toBaseUrl(direct);

  try {
    const parsed = new URL(apiBaseUrl);
    if (parsed.port === "4000") {
      parsed.port = "5173";
    }
    return parsed.origin.replace(/\/$/, "");
  } catch {
    return "http://localhost:5173";
  }
};

const parseJsonBody = async (response: Response): Promise<unknown> => {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return await response.text();
  }

  try {
    return await response.json();
  } catch {
    return {};
  }
};

const messageFromBody = (body: unknown, fallback: string): string => {
  if (!body || typeof body !== "object") return fallback;
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" && message.trim().length > 0 ? message : fallback;
};

const renderTable = (headers: string[], rows: string[][]): string => {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length))
  );

  const formatRow = (columns: string[]): string =>
    columns
      .map((value, index) => value.padEnd(widths[index] ?? value.length))
      .join("  ")
      .trimEnd();

  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  return [formatRow(headers), separator, ...rows.map((row) => formatRow(row))].join("\n");
};

const debugDump = (deps: CliDeps, enabled: boolean, label: string, payload: unknown): void => {
  if (!enabled) return;
  deps.out(`[debug] ${label}`);
  deps.out(JSON.stringify(payload, null, 2));
};

const resolveAuth = async (
  flags: Record<string, FlagValue>,
  deps: CliDeps
): Promise<{ token?: string; apiKey?: string }> => {
  const explicitToken = asStringFlag(flags, "token");
  if (explicitToken) return { token: explicitToken };

  const envToken = deps.env.DEVTOOLS_TOKEN?.trim() || deps.env.DEVTOOLS_LOCAL_TOKEN?.trim();
  if (envToken) return { token: envToken };

  const localTokenPath = join(deps.homeDirFn(), ".devtools", "token");
  try {
    const fileToken = (await deps.readFileFn(localTokenPath, "utf8")).trim();
    if (fileToken.length > 0) {
      return { token: fileToken };
    }
  } catch {
    // ignore missing local token file
  }

  const explicitApiKey = asStringFlag(flags, "api-key");
  if (explicitApiKey) return { apiKey: explicitApiKey };

  const envApiKey = deps.env.DEVTOOLS_API_KEY?.trim();
  if (envApiKey) return { apiKey: envApiKey };

  return {};
};

const createApiClient = (deps: CliDeps, options: ApiClientOptions) => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const headers = new Headers();
    headers.set("accept", "application/json");
    if (options.tenantId) {
      headers.set("x-tenant-id", options.tenantId);
    }
    if (options.token) {
      headers.set("authorization", `Bearer ${options.token}`);
    } else if (options.apiKey) {
      headers.set("x-api-key", options.apiKey);
    }

    const requestHeaders = new Headers(headers);
    if (body !== undefined) {
      requestHeaders.set("content-type", "application/json");
    }

    const response = await deps.fetchFn(`${options.baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });

    const parsedBody = await parseJsonBody(response);
    if (!response.ok) {
      throw new ApiError(
        messageFromBody(parsedBody, `Request failed (${response.status})`),
        response.status,
        parsedBody
      );
    }

    return parsedBody as T;
  };

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body)
  };
};

const cliConfigPath = (homeDir: string): string => join(homeDir, ".devtools", "cli.json");
const executionConfigPath = (homeDir: string): string => join(homeDir, ".devtools", "config");

const readCliConfig = async (deps: CliDeps): Promise<CliConfig> => {
  const path = cliConfigPath(deps.homeDirFn());
  try {
    const raw = await deps.readFileFn(path, "utf8");
    const parsed = JSON.parse(raw) as CliConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeExecutionConfig = (value: unknown): ExecutionProfileConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const defaultMode = toExecutionMode(typeof raw.defaultMode === "string" ? raw.defaultMode : undefined);
  const preferredLlmRaw = typeof raw.preferredLlm === "string" ? raw.preferredLlm.trim().toLowerCase() : "";
  const preferredLlm =
    preferredLlmRaw === "codex" || preferredLlmRaw === "claude" || preferredLlmRaw === "gemini"
      ? (preferredLlmRaw as "codex" | "claude" | "gemini")
      : undefined;
  const fallbackProvider = typeof raw.fallbackProvider === "string" ? raw.fallbackProvider.trim() : undefined;
  const commandAllowlist = Array.isArray(raw.commandAllowlist)
    ? raw.commandAllowlist
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    : undefined;
  const requireCommandConfirmation =
    typeof raw.requireCommandConfirmation === "boolean" ? raw.requireCommandConfirmation : undefined;
  return {
    ...(defaultMode ? { defaultMode } : {}),
    ...(preferredLlm ? { preferredLlm } : {}),
    ...(fallbackProvider ? { fallbackProvider } : {}),
    ...(commandAllowlist && commandAllowlist.length > 0 ? { commandAllowlist } : {}),
    ...(typeof requireCommandConfirmation === "boolean" ? { requireCommandConfirmation } : {}),
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {})
  };
};

const readExecutionConfig = async (deps: CliDeps): Promise<ExecutionProfileConfig> => {
  const path = executionConfigPath(deps.homeDirFn());
  try {
    const raw = await deps.readFileFn(path, "utf8");
    return normalizeExecutionConfig(JSON.parse(raw));
  } catch {
    return {};
  }
};

const writeCliConfig = async (deps: CliDeps, next: CliConfig): Promise<void> => {
  const home = deps.homeDirFn();
  const dir = join(home, ".devtools");
  const path = cliConfigPath(home);
  await deps.mkdirFn(dir, { recursive: true });
  await deps.writeFileFn(path, JSON.stringify(next, null, 2), "utf8");
};

const writeExecutionConfig = async (deps: CliDeps, next: ExecutionProfileConfig): Promise<void> => {
  const home = deps.homeDirFn();
  const dir = join(home, ".devtools");
  const path = executionConfigPath(home);
  await deps.mkdirFn(dir, { recursive: true });
  await deps.writeFileFn(path, JSON.stringify(next, null, 2), "utf8");
};

const workerHeartbeatFresh = (timestamp: string | undefined): boolean => {
  if (!timestamp) return true;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= 45_000;
};

const machineExecutionMode = (machine: MachineSummary): ExecutionMode | undefined => {
  const execution = machine.metadata && typeof machine.metadata === "object"
    ? (machine.metadata.execution as Record<string, unknown> | undefined)
    : undefined;
  const mode = typeof execution?.mode === "string" ? execution.mode.trim().toLowerCase() : undefined;
  if (mode === "local" || mode === "hybrid" || mode === "remote") {
    return mode;
  }
  if (machine.agents?.includes("local-worker")) return "local";
  if (machine.agents?.includes("remote-worker")) return "remote";
  const services = (machine.services ?? []).map((entry) => entry.toLowerCase());
  if (services.includes("shell")) return "local";
  if (services.includes("internal_runner")) return "remote";
  return undefined;
};

const machineSupportsLocalExecution = (machine: MachineSummary): boolean => {
  const mode = machineExecutionMode(machine);
  return mode === "local" || mode === "hybrid";
};

const machineSupportsRemoteExecution = (machine: MachineSummary): boolean => {
  const mode = machineExecutionMode(machine);
  return mode === "remote" || mode === "hybrid";
};

const machineIsActive = (machine: MachineSummary): boolean => {
  const status = (machine.status ?? "").trim().toLowerCase();
  if (status !== "online" && status !== "degraded") return false;
  return workerHeartbeatFresh(machine.lastHeartbeatAt);
};

const isExecutionWorker = (machine: MachineSummary): boolean =>
  machineSupportsLocalExecution(machine) || machineSupportsRemoteExecution(machine);

const detectExecutionWorkers = async (
  client: ReturnType<typeof createApiClient>
): Promise<{ local?: MachineSummary; remote?: MachineSummary }> => {
  try {
    const response = await client.get<{ items?: MachineSummary[] }>("/machines");
    const machines = response.items ?? [];
    const local = machines.find((machine) => machineIsActive(machine) && machineSupportsLocalExecution(machine));
    const remote = machines.find((machine) => machineIsActive(machine) && machineSupportsRemoteExecution(machine));
    return {
      ...(local ? { local } : {}),
      ...(remote ? { remote } : {})
    };
  } catch {
    return {};
  }
};

const detectActiveLocalWorker = async (
  client: ReturnType<typeof createApiClient>
): Promise<{ available: boolean; machineId?: string }> => {
  const workers = await detectExecutionWorkers(client);
  return workers.local ? { available: true, machineId: workers.local.id } : { available: false };
};

const resolveExecutionModeWithDetection = async (input: {
  flags: Record<string, FlagValue>;
  profile: ExecutionProfileConfig;
  fallback: ExecutionMode;
  client: ReturnType<typeof createApiClient>;
}): Promise<ExecutionModeResolution> => {
  const fromFlag = toExecutionMode(asStringFlag(input.flags, "mode"));
  if (fromFlag) {
    return {
      mode: fromFlag,
      source: "flag",
      reason: `requested by --mode (${fromFlag})`
    };
  }

  const workers = await detectExecutionWorkers(input.client);
  if (workers.local) {
    return {
      mode: "local",
      source: "auto_local_worker",
      reason: `active local worker${workers.local.id ? ` ${workers.local.id}` : ""} detected`,
      ...(workers.local.id ? { machineId: workers.local.id } : {})
    };
  }

  if (workers.remote) {
    return {
      mode: "remote",
      source: "profile",
      reason: `active remote worker${workers.remote.id ? ` ${workers.remote.id}` : ""} detected`,
      ...(workers.remote.id ? { machineId: workers.remote.id } : {})
    };
  }

  throw new Error(
    "No execution worker is available. Start 'devtools worker start --mode local' or bring the remote worker online."
  );
};

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const normalizeAllowlist = (items: string[]): string[] =>
  [...new Set(items.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];

const resolveProviderConfig = (
  configs: ProviderConfigItem[],
  input: string
): ProviderConfigItem => {
  const normalized = input.trim().toLowerCase();
  const byId = configs.find((config) => config.id.toLowerCase() === normalized);
  if (byId) return byId;

  const byProvider = configs.filter((config) => {
    const provider = (config.providerId ?? config.provider ?? "").toLowerCase();
    return provider === normalized;
  });

  if (byProvider.length === 0) {
    throw new Error(`Provider '${input}' not found.`);
  }

  if (byProvider.length > 1) {
    const ids = byProvider.map((config) => config.id).join(", ");
    throw new Error(`Provider '${input}' is ambiguous. Use a provider config id instead: ${ids}`);
  }

  return byProvider[0]!;
};

const providerTemplateAuthRef = (providerId: string): string => {
  const normalized = providerId.trim().toLowerCase();
  if (normalized === "openai") return "env://OPENAI_API_KEY";
  if (normalized === "openrouter") return "env://OPENROUTER_API_KEY";
  if (normalized === "anthropic") return "env://ANTHROPIC_API_KEY";
  if (normalized === "gemini") return "env://GEMINI_API_KEY";
  return `secret://${normalized}/api-key`;
};

const cleanSecretToken = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^['"`]/, "").replace(/['"`;,]+$/, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseProviderKeysFromText = (raw: string): ParsedProviderKeys => {
  const lines = raw.split(/\r?\n/);
  let openai: string | undefined;
  let openrouter: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const assignment = trimmed.match(/^([A-Za-z0-9_.-]+)\s*[:=]\s*(.+)$/);
    if (!assignment) continue;
    const key = assignment[1]!.trim().toLowerCase();
    const value = cleanSecretToken(assignment[2]);
    if (!value) continue;

    if (key === "openai_api_key" || key === "openai" || key === "openai.api_key") {
      openai = openai ?? value;
    }
    if (key === "openrouter_api_key" || key === "openrouter" || key === "openrouter.api_key") {
      openrouter = openrouter ?? value;
    }
  }

  if (!openrouter) {
    const match = raw.match(/sk-or-v1-[A-Za-z0-9]{20,}/);
    openrouter = cleanSecretToken(match?.[0]);
  }

  if (!openai) {
    const match = raw.match(/\bsk-(?!or-v1-)(?:proj-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{20,})\b/);
    openai = cleanSecretToken(match?.[0]);
  }

  return {
    ...(openai ? { openai } : {}),
    ...(openrouter ? { openrouter } : {})
  };
};

const resolveProviderKeyCandidates = (deps: CliDeps, flags: Record<string, FlagValue>): string[] => {
  const fromFlag = asStringFlag(flags, "api-file");
  const fromEnv = deps.env.DEVTOOLS_PROVIDER_KEYS_FILE?.trim();
  const fromWorkspace = join(process.cwd(), "documents", "api.txt");
  const fromHomeDocs = join(deps.homeDirFn(), "Documents", "api.txt");
  return [...new Set([fromFlag, fromEnv, fromWorkspace, fromHomeDocs].filter((value): value is string => Boolean(value)))];
};

const resolveProviderKeys = async (
  deps: CliDeps,
  flags: Record<string, FlagValue>
): Promise<ParsedProviderKeys> => {
  const explicitOpenAI = cleanSecretToken(asStringFlag(flags, "openai-key"));
  const explicitOpenRouter = cleanSecretToken(asStringFlag(flags, "openrouter-key"));
  const envOpenAI = cleanSecretToken(deps.env.OPENAI_API_KEY);
  const envOpenRouter = cleanSecretToken(deps.env.OPENROUTER_API_KEY);

  let openai = explicitOpenAI;
  let openrouter = explicitOpenRouter;
  let sourcePath: string | undefined;

  for (const candidate of resolveProviderKeyCandidates(deps, flags)) {
    if (openai && openrouter) break;
    try {
      const raw = await deps.readFileFn(candidate, "utf8");
      const parsed = parseProviderKeysFromText(raw);
      if (!openai && parsed.openai) {
        openai = parsed.openai;
      }
      if (!openrouter && parsed.openrouter) {
        openrouter = parsed.openrouter;
      }
      if ((parsed.openai || parsed.openrouter) && !sourcePath) {
        sourcePath = candidate;
      }
    } catch {
      // Continue scanning candidate paths.
    }
  }

  if (!openai && envOpenAI) {
    openai = envOpenAI;
  }
  if (!openrouter && envOpenRouter) {
    openrouter = envOpenRouter;
  }

  return {
    ...(openai ? { openai } : {}),
    ...(openrouter ? { openrouter } : {}),
    ...(sourcePath ? { sourcePath } : {})
  };
};

const defaultAgentSpecs: DefaultAgentSpec[] = [
  {
    name: "planner",
    role: "planner",
    icon: "plan",
    description: "Plans scoped execution with explicit constraints and milestones.",
    capabilities: ["chat_reasoning"]
  },
  {
    name: "coder",
    role: "codex_builder",
    icon: "code",
    description: "Implements approved tasks through the runner execution path.",
    capabilities: ["coding"]
  },
  {
    name: "reviewer",
    role: "claude_debugger",
    icon: "review",
    description: "Reviews outputs, identifies regressions, and proposes corrections.",
    capabilities: ["chat_reasoning", "coding"]
  },
  {
    name: "researcher",
    role: "gemini_researcher",
    icon: "research",
    description: "Collects and synthesizes external evidence with traceable sources.",
    capabilities: ["chat_reasoning"]
  }
];

const resolveProjectFromInput = (
  input: string,
  projects: ProjectItem[]
): ProjectItem => {
  const normalized = input.trim().toLowerCase();
  const exactId = projects.find((item) => item.id.toLowerCase() === normalized);
  if (exactId) return exactId;
  const exactKey = projects.find((item) => item.key.toLowerCase() === normalized);
  if (exactKey) return exactKey;
  const byName = projects.filter((item) => item.name.trim().toLowerCase() === normalized);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(`Project name '${input}' is ambiguous. Use project id or key.`);
  }
  throw new Error(`Project '${input}' not found.`);
};

const resolveProjectId = async (input: {
  flags: Record<string, FlagValue>;
  config: CliConfig;
  client: ReturnType<typeof createApiClient>;
}): Promise<string | undefined> => {
  const fromFlag = asStringFlag(input.flags, "project");
  if (fromFlag) return fromFlag;
  if (input.config.currentProjectId) return input.config.currentProjectId;

  const projects = await input.client.get<{ items?: ProjectItem[] }>("/projects");
  return projects.items?.[0]?.id;
};

const outputCommandResult = (input: {
  deps: CliDeps;
  result: CommandResult;
  jsonMode: boolean;
  quietMode: boolean;
}): void => {
  if (input.jsonMode) {
    input.deps.out(JSON.stringify(input.result.json, null, 2));
    return;
  }

  if (input.quietMode) {
    if (input.result.quietLine) input.deps.out(input.result.quietLine);
    return;
  }

  for (const line of input.result.lines) {
    input.deps.out(line);
  }
};

const runProjectCreate = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  flags: Record<string, FlagValue>;
  debug: boolean;
  deps: CliDeps;
  webBaseUrl: string;
}): Promise<CommandResult> => {
  const name = input.args.join(" ").trim();
  if (!name) {
    throw new Error("Project name is required. Example: devtools project create MyProject");
  }

  const payload = {
    name,
    ...(asStringFlag(input.flags, "description") ? { description: asStringFlag(input.flags, "description") } : {}),
    ...(asStringFlag(input.flags, "key") ? { key: asStringFlag(input.flags, "key") } : {})
  };

  const result = await input.client.post<{ item: ProjectItem }>("/projects", payload);
  debugDump(input.deps, input.debug, "project.create.response", result);

  return {
    lines: [
      "OK Project created",
      `id: ${result.item.id}`,
      `name: ${result.item.name}`,
      `key: ${result.item.key}`,
      `status: ${result.item.status}`
    ],
    quietLine: result.item.id,
    json: {
      status: "ok",
      action: "project.create",
      item: result.item
    },
    openUrl: `${input.webBaseUrl}/project/${result.item.id}`
  };
};

const runProjectList = async (input: {
  client: ReturnType<typeof createApiClient>;
  debug: boolean;
  deps: CliDeps;
}): Promise<CommandResult> => {
  const result = await input.client.get<{ items?: ProjectItem[] }>("/projects");
  debugDump(input.deps, input.debug, "project.list.response", result);

  const items = result.items ?? [];
  if (items.length === 0) {
    return {
      lines: ["No projects found."],
      json: { status: "ok", action: "project.list", items: [] }
    };
  }

  const rows = items.map((item) => [item.id, item.key, item.name, item.status]);
  return {
    lines: [renderTable(["ID", "KEY", "NAME", "STATUS"], rows)],
    json: { status: "ok", action: "project.list", items }
  };
};

const runProjectUse = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  deps: CliDeps;
  config: CliConfig;
  tenantId: string;
  baseUrl: string;
}): Promise<CommandResult> => {
  const projectInput = (input.args[0] ?? "").trim();
  if (!projectInput) {
    throw new Error("Project id/name is required. Example: devtools project use prj_123");
  }

  const projects = await input.client.get<{ items?: ProjectItem[] }>("/projects");
  const selected = resolveProjectFromInput(projectInput, projects.items ?? []);

  const nextConfig: CliConfig = {
    ...input.config,
    currentProjectId: selected.id,
    currentProjectName: selected.name,
    tenantId: input.tenantId,
    apiBaseUrl: input.baseUrl,
    updatedAt: new Date().toISOString()
  };
  await writeCliConfig(input.deps, nextConfig);

  return {
    lines: ["OK Current project selected", `id: ${selected.id}`, `name: ${selected.name}`],
    quietLine: selected.id,
    json: {
      status: "ok",
      action: "project.use",
      item: selected
    }
  };
};

const toWorkspaceMode = (value: ExecutionMode | undefined): "local" | "remote" | undefined => {
  if (!value) return undefined;
  if (value === "remote") return "remote";
  return "local";
};

const resolveWorkspaceForProject = async (input: {
  client: ReturnType<typeof createApiClient>;
  projectId: string;
}): Promise<WorkspaceItem | undefined> => {
  const response = await input.client.get<{ items?: WorkspaceItem[] }>(
    `/workspaces?projectId=${encodeURIComponent(input.projectId)}`
  );
  return response.items?.[0];
};

const ensureWorkspaceForProject = async (input: {
  client: ReturnType<typeof createApiClient>;
  projectId: string;
  mode?: "local" | "remote";
  localPath?: string;
  actor?: string;
}): Promise<WorkspaceItem> => {
  const existing = await resolveWorkspaceForProject({
    client: input.client,
    projectId: input.projectId
  });
  if (existing) return existing;

  const created = await input.client.post<{ item: WorkspaceItem }>("/workspaces", {
    projectId: input.projectId,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.localPath ? { localPath: input.localPath } : {}),
    ...(input.actor ? { actor: input.actor } : {})
  });
  return created.item;
};

const waitForRunnerJobTerminal = async (input: {
  client: ReturnType<typeof createApiClient>;
  deps: CliDeps;
  jobId: string;
  label: string;
  waitMs?: number;
  pollMs?: number;
}): Promise<void> => {
  const maxWaitMs = Math.max(5_000, input.waitMs ?? 45_000);
  const pollMs = Math.max(200, input.pollMs ?? 900);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= maxWaitMs) {
    const snapshot = await input.client.get<{
      item?: {
        id: string;
        status: string;
        payload?: Record<string, unknown>;
      };
    }>(`/jobs/${input.jobId}`);
    const status = snapshot.item?.status ?? "";
    if (status === "done" || status === "waiting_user") return;
    if (status === "error") {
      const payload = snapshot.item?.payload;
      const lastError =
        payload && typeof payload.lastError === "object" && payload.lastError !== null
          ? (payload.lastError as Record<string, unknown>)
          : undefined;
      const errorMessage =
        typeof lastError?.message === "string" ? lastError.message : `${input.label} failed (${input.jobId})`;
      throw new Error(errorMessage);
    }
    await input.deps.sleepFn(pollMs);
  }
  throw new Error(`Timed out while waiting for ${input.label} (${input.jobId})`);
};

const runWorkspaceAttach = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  flags: Record<string, FlagValue>;
  config: CliConfig;
  deps: CliDeps;
  webBaseUrl: string;
}): Promise<CommandResult> => {
  const localPath = input.args.join(" ").trim();
  if (!localPath) {
    throw new Error("Workspace path is required. Example: devtools workspace attach /Users/me/project");
  }
  const projectId = await resolveProjectId({
    flags: input.flags,
    config: input.config,
    client: input.client
  });
  if (!projectId) {
    throw new Error("No active project found. Use 'devtools project use <id>' or pass --project.");
  }

  const requestedMode = toExecutionMode(asStringFlag(input.flags, "mode"));
  const workspaceMode = toWorkspaceMode(requestedMode) ?? "local";
  const existing = await resolveWorkspaceForProject({
    client: input.client,
    projectId
  });
  const item = existing
    ? (
        await input.client.patch<{ item: WorkspaceItem }>(`/workspaces/${existing.id}`, {
          mode: workspaceMode,
          localPath
        })
      ).item
    : (
        await input.client.post<{ item: WorkspaceItem }>("/workspaces", {
          projectId,
          mode: workspaceMode,
          localPath
        })
      ).item;

  return {
    lines: [
      "OK Workspace attached",
      `workspace: ${item.id}`,
      `project: ${item.projectId}`,
      `mode: ${item.mode}`,
      `path: ${item.localPath ?? "n/a"}`,
      `runtime: ${item.runtimeStatus}`
    ],
    quietLine: item.id,
    json: {
      status: "ok",
      action: "workspace.attach",
      item
    },
    openUrl: `${input.webBaseUrl}/project/${projectId}`
  };
};

const runWorkspaceAction = async (input: {
  action: "start" | "stop" | "deploy" | "restart";
  client: ReturnType<typeof createApiClient>;
  flags: Record<string, FlagValue>;
  config: CliConfig;
  deps: CliDeps;
  profile: ExecutionProfileConfig;
  webBaseUrl: string;
}): Promise<CommandResult> => {
  const projectId = await resolveProjectId({
    flags: input.flags,
    config: input.config,
    client: input.client
  });
  if (!projectId) {
    throw new Error("No active project found. Use 'devtools project use <id>' or pass --project.");
  }

  const executionMode = await resolveExecutionModeWithDetection({
    flags: input.flags,
    profile: input.profile,
    fallback: "remote",
    client: input.client
  });
  const workspace = await ensureWorkspaceForProject({
    client: input.client,
    projectId,
    mode: toWorkspaceMode(executionMode.mode) ?? "remote"
  });

  const dispatched = await input.client.patch<{
    item?: WorkspaceItem;
    jobId?: string;
    status?: string;
    message?: string;
  }>(`/workspaces/${workspace.id}`, {
    action: input.action,
    executionMode: executionMode.mode
  });
  if (!dispatched.jobId) {
    throw new Error(dispatched.message ?? `Workspace ${input.action} did not return a job id`);
  }

  await waitForRunnerJobTerminal({
    client: input.client,
    deps: input.deps,
    jobId: dispatched.jobId,
    label: `workspace ${input.action}`
  });
  const refreshed = await resolveWorkspaceForProject({
    client: input.client,
    projectId
  });
  if (!refreshed) {
    throw new Error("Workspace disappeared after execution.");
  }

  return {
    lines: [
      `OK Workspace ${input.action} completed`,
      `workspace: ${refreshed.id}`,
      `project: ${refreshed.projectId}`,
      `mode: ${refreshed.mode}`,
      `runtime: ${refreshed.runtimeStatus}`,
      `route mode: ${executionMode.mode} (${executionMode.reason})`,
      `job: ${dispatched.jobId}`
    ],
    quietLine: refreshed.id,
    json: {
      status: "ok",
      action: `workspace.${input.action}`,
      projectId,
      mode: executionMode.mode,
      modeSource: executionMode.source,
      modeReason: executionMode.reason,
      jobId: dispatched.jobId,
      workspace: refreshed
    },
    openUrl: `${input.webBaseUrl}/project/${projectId}`
  };
};

const runProvidersTest = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  debug: boolean;
  deps: CliDeps;
}): Promise<CommandResult> => {
  const providerInput = (input.args[0] ?? "").trim();
  if (!providerInput) {
    throw new Error("Provider is required. Example: devtools providers test openai");
  }

  const configsResponse = await input.client.get<{ items?: ProviderConfigItem[] }>("/providers/config");
  debugDump(input.deps, input.debug, "providers.config.response", configsResponse);

  const selected = resolveProviderConfig(configsResponse.items ?? [], providerInput);
  const result = await input.client.post<{
    status?: "ok" | "error";
    latencyMs?: number;
    models?: string[];
    error?: string;
    rateLimit?: {
      rpm?: { used?: number; limit?: number | null };
      tpm?: { used?: number; limit?: number | null };
    };
    item?: ProviderConfigItem;
    availableModels?: string[];
  }>(`/providers/config/${selected.id}/test`);
  debugDump(input.deps, input.debug, "providers.test.response", result);

  const providerLabel = result.item?.providerId ?? result.item?.provider ?? selected.providerId ?? selected.provider ?? selected.id;
  const models = result.models ?? result.availableModels ?? [];
  const rpmUsed = typeof result.rateLimit?.rpm?.used === "number" ? result.rateLimit.rpm.used : 0;
  const rpmLimit = typeof result.rateLimit?.rpm?.limit === "number" ? result.rateLimit.rpm.limit : null;
  const tpmUsed = typeof result.rateLimit?.tpm?.used === "number" ? result.rateLimit.tpm.used : 0;
  const tpmLimit = typeof result.rateLimit?.tpm?.limit === "number" ? result.rateLimit.tpm.limit : null;

  const payload = {
    status: result.status ?? "error",
    provider: providerLabel,
    latencyMs: result.latencyMs ?? 0,
    models,
    ...(result.error ? { error: result.error } : {}),
    rateLimit: {
      rpm: { used: rpmUsed, limit: rpmLimit },
      tpm: { used: tpmUsed, limit: tpmLimit }
    }
  };

  if (result.status !== "ok") {
    throw new Error(`Provider ${providerLabel} failed (${result.error ?? "validation failed"})`);
  }

  return {
    lines: [
      `OK Provider test passed (${providerLabel})`,
      `latency: ${result.latencyMs ?? 0}ms`,
      `models: ${models.length > 0 ? models.join(", ") : "none"}`,
      `Rate limit: ${rpmUsed}/${rpmLimit ?? "∞"} rpm, ${tpmUsed}/${tpmLimit ?? "∞"} tpm`
    ],
    quietLine: providerLabel,
    json: {
      action: "providers.test",
      ...payload
    }
  };
};

const runCodingRun = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  flags: Record<string, FlagValue>;
  debug: boolean;
  deps: CliDeps;
  config: CliConfig;
  webBaseUrl: string;
  executionMode: ExecutionModeResolution;
}): Promise<CommandResult> => {
  const requestText = (asStringFlag(input.flags, "request") ?? input.args.join(" ")).trim();
  if (!requestText) {
    throw new Error("Request text is required. Example: devtools coding run --request \"add auth middleware\"");
  }

  let projectId = await resolveProjectId({
    flags: input.flags,
    config: input.config,
    client: input.client
  });

  if (!projectId) {
    throw new Error("No projects available. Create or select a project first.");
  }

  const title = asStringFlag(input.flags, "title") ?? requestText.slice(0, 72);
  const mode = input.executionMode.mode;
  const created = await input.client.post<AsyncJobHandle>(
    `/projects/${projectId}/coding-workflows`,
    {
      title,
      request: requestText,
      mode
    }
  );
  debugDump(input.deps, input.debug, "coding.create.response", created);
  const lines: string[] = [
    `mode: ${mode} (${input.executionMode.reason})`
  ];

  const autoApprove = asBooleanFlag(input.flags, "auto-approve", true);
  const terminalStates = new Set(["completed", "done", "rejected", "plan_rejected", "error"]);
  const startMs = Date.now();
  const maxWaitMs = Math.max(5_000, asIntegerFlag(input.flags, "wait-ms") ?? 45_000);
  const pollMs = Math.max(200, asIntegerFlag(input.flags, "poll-ms") ?? 900);

  const waitForJobTerminal = async (jobId: string, label: string): Promise<void> => {
    while (Date.now() - startMs <= maxWaitMs) {
      const snapshot = await input.client.get<{
        item?: {
          id: string;
          status: string;
          payload?: Record<string, unknown>;
        };
      }>(`/jobs/${jobId}`);
      const status = snapshot.item?.status ?? "";
      if (status === "done" || status === "waiting_user") return;
      if (status === "error") {
        const payload = snapshot.item?.payload;
        const lastError =
          payload && typeof payload.lastError === "object" && payload.lastError !== null
            ? (payload.lastError as Record<string, unknown>)
            : undefined;
        const errorMessage =
          typeof lastError?.message === "string" ? lastError.message : `${label} failed (${jobId})`;
        throw new Error(errorMessage);
      }
      await input.deps.sleepFn(pollMs);
    }
    throw new Error(`Timed out while waiting for ${label} (${jobId})`);
  };

  const loadLatestWorkflow = async (): Promise<CodingWorkflowItem> => {
    const list = await input.client.get<{ items?: CodingWorkflowItem[] }>(
      `/projects/${projectId}/coding-workflows`
    );
    const candidates = list.items ?? [];
    const byTitle = candidates.filter((item) => item.title === title);
    const ordered = [...(byTitle.length > 0 ? byTitle : candidates)].sort((left, right) =>
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
    );
    const latestWorkflow = ordered[0];
    if (!latestWorkflow) {
      throw new Error("Unable to resolve created workflow from project list.");
    }
    return latestWorkflow;
  };

  let workflow: CodingWorkflowItem;
  if (created.item) {
    workflow = created.item;
  } else if (created.jobId) {
    lines.push(`queued create job: ${created.jobId} (${created.status ?? "pending"})`);
    await waitForJobTerminal(created.jobId, "workflow creation");
    workflow = await loadLatestWorkflow();
  } else {
    throw new Error(created.message ?? "Invalid create workflow response.");
  }

  lines.push(`OK Workflow created (${workflow.id})`);
  lines.push(`state: ${workflow.state}`);

  while (Date.now() - startMs <= maxWaitMs) {
    if (autoApprove && (workflow.state === "awaiting_plan_approval" || workflow.state === "planning")) {
      const planApproval = await input.client.post<AsyncJobHandle>(
        `/projects/${projectId}/coding-workflows/${workflow.id}/plan/approve`,
        { mode }
      );
      debugDump(input.deps, input.debug, "coding.plan.approve.response", planApproval);
      if (planApproval.item) {
        workflow = planApproval.item;
      } else if (planApproval.jobId) {
        lines.push(`plan approval job: ${planApproval.jobId} (${planApproval.status ?? "pending"})`);
        await waitForJobTerminal(planApproval.jobId, "plan approval");
        const latestWorkflow = await input.client.get<{ item: CodingWorkflowItem }>(
          `/projects/${projectId}/coding-workflows/${workflow.id}`
        );
        workflow = latestWorkflow.item;
      } else {
        throw new Error(planApproval.message ?? "Invalid plan approval response.");
      }
      lines.push(`plan: approved -> ${workflow.state}`);
      continue;
    }

    if (autoApprove && workflow.state === "awaiting_patch_approval") {
      const patchApproval = await input.client.post<AsyncJobHandle>(
        `/projects/${projectId}/coding-workflows/${workflow.id}/patch/approve`,
        { mode }
      );
      debugDump(input.deps, input.debug, "coding.patch.approve.response", patchApproval);
      if (patchApproval.item) {
        workflow = patchApproval.item;
      } else if (patchApproval.jobId) {
        lines.push(`patch approval job: ${patchApproval.jobId} (${patchApproval.status ?? "pending"})`);
        await waitForJobTerminal(patchApproval.jobId, "patch approval");
        const latestWorkflow = await input.client.get<{ item: CodingWorkflowItem }>(
          `/projects/${projectId}/coding-workflows/${workflow.id}`
        );
        workflow = latestWorkflow.item;
      } else {
        throw new Error(patchApproval.message ?? "Invalid patch approval response.");
      }
      lines.push(`patch: approved -> ${workflow.state}`);
      continue;
    }

    if (!autoApprove && workflow.actionRequired) {
      lines.push("action required: yes");
      break;
    }

    if (terminalStates.has(workflow.state)) {
      break;
    }

    await input.deps.sleepFn(pollMs);
    const latestPoll = await input.client.get<{ item: CodingWorkflowItem }>(
      `/projects/${projectId}/coding-workflows/${workflow.id}`
    );
    workflow = latestPoll.item;
  }

  const latest = await input.client.get<{ item: CodingWorkflowItem }>(
    `/projects/${projectId}/coding-workflows/${workflow.id}`
  );
  debugDump(input.deps, input.debug, "coding.workflow.latest", latest);

  const finalWorkflow = latest.item;
  lines.push(`final: ${finalWorkflow.state}`);
  if (finalWorkflow.plan?.summary) {
    lines.push(`plan summary: ${finalWorkflow.plan.summary}`);
  }
  if (finalWorkflow.generatedTaskIds && finalWorkflow.generatedTaskIds.length > 0) {
    lines.push(`generated tasks: ${finalWorkflow.generatedTaskIds.length}`);
  }
  if (finalWorkflow.reviewSummary) {
    lines.push(`review summary: ${finalWorkflow.reviewSummary}`);
  }
  if (finalWorkflow.actionRequired) {
    lines.push("action required: yes");
  }

  return {
    lines,
    quietLine: finalWorkflow.id,
    json: {
      status: "ok",
      action: "coding.run",
      projectId,
      mode,
      modeSource: input.executionMode.source,
      modeReason: input.executionMode.reason,
      workflow: finalWorkflow
    },
    openUrl: `${input.webBaseUrl}/project/${projectId}/coding`
  };
};

const runAgentsList = async (input: {
  client: ReturnType<typeof createApiClient>;
  debug: boolean;
  deps: CliDeps;
}): Promise<CommandResult> => {
  const result = await input.client.get<{ items?: AgentItem[] }>("/agents");
  debugDump(input.deps, input.debug, "agents.list.response", result);

  const items = result.items ?? [];
  if (items.length === 0) {
    return {
      lines: ["No agents found."],
      json: { status: "ok", action: "agents.list", items: [] }
    };
  }

  const rows = items.map((item) => [item.id, item.name, item.role, item.status]);
  return {
    lines: [renderTable(["ID", "NAME", "ROLE", "STATUS"], rows)],
    json: { status: "ok", action: "agents.list", items }
  };
};

const runJobsList = async (input: {
  client: ReturnType<typeof createApiClient>;
  flags: Record<string, FlagValue>;
  config: CliConfig;
}): Promise<CommandResult> => {
  const status = asStringFlag(input.flags, "status");
  const includeAll = asBooleanFlag(input.flags, "all", false);
  const projectId = includeAll
    ? undefined
    : await resolveProjectId({
        flags: input.flags,
        config: input.config,
        client: input.client
      });

  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (projectId) query.set("projectId", projectId);
  const suffix = query.toString();

  const response = await input.client.get<{ items?: JobItem[] }>(`/jobs${suffix ? `?${suffix}` : ""}`);
  const items = response.items ?? [];

  if (items.length === 0) {
    return {
      lines: ["No jobs found."],
      json: { status: "ok", action: "jobs.list", items: [] }
    };
  }

  const rows = items.map((item) => [
    item.id,
    item.type,
    item.status,
    String(item.priority),
    item.title.slice(0, 60)
  ]);

  return {
    lines: [renderTable(["ID", "TYPE", "STATUS", "PRIORITY", "TITLE"], rows)],
    json: {
      status: "ok",
      action: "jobs.list",
      ...(projectId ? { projectId } : {}),
      items
    }
  };
};

const runLogsTail = async (input: {
  client: ReturnType<typeof createApiClient>;
  flags: Record<string, FlagValue>;
  config: CliConfig;
  deps: CliDeps;
  jsonMode: boolean;
  quietMode: boolean;
}): Promise<CommandResult> => {
  const jobId = asStringFlag(input.flags, "job");
  const intervalMs = Math.max(250, asIntegerFlag(input.flags, "interval") ?? 2000);
  const once = asBooleanFlag(input.flags, "once", false);
  const iterationsFlag = asIntegerFlag(input.flags, "iterations");
  const maxIterations = once ? 1 : (iterationsFlag && iterationsFlag > 0 ? iterationsFlag : Number.POSITIVE_INFINITY);

  const projectId = jobId
    ? undefined
    : await resolveProjectId({
        flags: input.flags,
        config: input.config,
        client: input.client
      });

  const seen = new Set<string>();
  const collected: Array<{ jobId: string; timestamp: string; event: string; message: string }> = [];

  let iteration = 0;
  while (iteration < maxIterations) {
    let targetJobIds: string[] = [];

    if (jobId) {
      targetJobIds = [jobId];
    } else {
      const query = new URLSearchParams({ status: "running" });
      if (projectId) query.set("projectId", projectId);
      const jobs = await input.client.get<{ items?: JobItem[] }>(`/jobs?${query.toString()}`);
      targetJobIds = (jobs.items ?? []).map((item) => item.id);
    }

    for (const currentJobId of targetJobIds) {
      const runtime = await input.client.get<JobRuntimeSnapshot>(`/jobs/${currentJobId}/runtime`);
      const logs = runtime.item?.logs ?? [];
      for (const line of logs) {
        const key = `${currentJobId}:${line.timestamp}:${line.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const record = {
          jobId: currentJobId,
          timestamp: line.timestamp,
          event: line.event,
          message: line.message
        };
        collected.push(record);
        if (!input.jsonMode) {
          input.deps.out(`[${record.jobId}] ${record.timestamp} ${record.event} ${record.message}`);
        }
      }
    }

    iteration += 1;
    if (iteration >= maxIterations) break;
    await input.deps.sleepFn(intervalMs);
  }

  if (!input.jsonMode && !input.quietMode && collected.length === 0) {
    input.deps.out("No log lines available.");
  }

  return {
    lines: [],
    json: {
      status: "ok",
      action: "logs.tail",
      ...(projectId ? { projectId } : {}),
      ...(jobId ? { jobId } : {}),
      lines: collected
    }
  };
};

const runContextOpen = async (input: {
  client: ReturnType<typeof createApiClient>;
  flags: Record<string, FlagValue>;
  config: CliConfig;
  webBaseUrl: string;
}): Promise<CommandResult> => {
  const projectId = await resolveProjectId({
    flags: input.flags,
    config: input.config,
    client: input.client
  });

  if (!projectId) {
    throw new Error("No active project found. Use 'devtools project use <id>' or pass --project.");
  }

  const url = `${input.webBaseUrl}/project/${projectId}/context`;
  return {
    lines: [`Opening context workspace: ${url}`],
    quietLine: url,
    json: {
      status: "ok",
      action: "context.open",
      projectId,
      url
    },
    openUrl: url,
    openByDefault: true
  };
};

const runWorkerStart = async (input: {
  client: ReturnType<typeof createApiClient>;
  flags: Record<string, FlagValue>;
  deps: CliDeps;
  profile: ExecutionProfileConfig;
  jsonMode: boolean;
  quietMode: boolean;
}): Promise<CommandResult> => {
  const fromFlag = toExecutionMode(asStringFlag(input.flags, "mode"));
  const fromProfile = input.profile.defaultMode;
  const mode =
    (fromFlag === "local" || fromFlag === "hybrid"
      ? fromFlag
      : fromProfile === "local" || fromProfile === "hybrid"
        ? fromProfile
        : "local");

  const intervalMs = Math.max(250, asIntegerFlag(input.flags, "interval") ?? 1500);
  const once = asBooleanFlag(input.flags, "once", false);
  const limit = Math.max(1, asIntegerFlag(input.flags, "limit") ?? 5);
  const extraCapabilities = normalizeAllowlist(parseCsv(asStringFlag(input.flags, "capabilities")));
  const allowlistFromFlags = parseCsv(asStringFlag(input.flags, "allow"));
  const allowlistFromConfig = input.profile.commandAllowlist ?? [];
  const allowlist = normalizeAllowlist([...allowlistFromConfig, ...allowlistFromFlags]);
  const requireConfirmation =
    !asBooleanFlag(input.flags, "yes", false) && (input.profile.requireCommandConfirmation ?? true);
  const workerName = asStringFlag(input.flags, "name");
  const workerHost = asStringFlag(input.flags, "host");

  const summary = await startLocalWorker({
    client: input.client,
    deps: {
      runCommandFn: input.deps.runCommandFn,
      sleepFn: input.deps.sleepFn,
      ...(!input.jsonMode && !input.quietMode ? { out: input.deps.out } : {}),
      ...(!input.quietMode ? { err: input.deps.err } : {})
    },
    mode,
    intervalMs,
    once,
    limit,
    ...(workerName ? { machineName: workerName } : {}),
    ...(workerHost ? { machineHost: workerHost } : {}),
    explicitCapabilities: extraCapabilities,
    allowlist,
    requireConfirmation,
    ...(input.profile.preferredLlm ? { preferredLlm: input.profile.preferredLlm } : {}),
    ...(input.profile.fallbackProvider ? { fallbackProvider: input.profile.fallbackProvider } : {})
  });

  return {
    lines: [
      `OK Worker session completed`,
      `machine: ${summary.machineId}`,
      `mode: ${mode}`,
      `processed: ${summary.processed}`,
      `failed: ${summary.failures}`
    ],
    quietLine: summary.machineId,
    json: {
      status: "ok",
      action: "worker.start",
      machineId: summary.machineId,
      mode,
      processed: summary.processed,
      failures: summary.failures,
      iterations: summary.iterations,
      capabilities: summary.capabilities
    }
  };
};

const runWorkerStatus = async (input: {
  client: ReturnType<typeof createApiClient>;
}): Promise<CommandResult> => {
  const response = await input.client.get<{ items?: MachineSummary[] }>("/machines");
  const workers = (response.items ?? []).filter((machine) => isExecutionWorker(machine));
  if (workers.length === 0) {
    return {
      lines: ["No workers registered."],
      json: {
        status: "ok",
        action: "worker.status",
        items: []
      }
    };
  }

  const rows = workers.map((machine) => {
    const mode = machineExecutionMode(machine) ?? "unknown";
    const state = machineIsActive(machine) ? "running" : "stopped";
    const capabilities = (machine.services ?? []).join(",") || "-";
    return [
      machine.id,
      mode,
      state,
      machine.status ?? "unknown",
      machine.lastHeartbeatAt ?? "n/a",
      capabilities
    ];
  });

  return {
    lines: [renderTable(["ID", "MODE", "STATE", "STATUS", "LAST HEARTBEAT", "CAPABILITIES"], rows)],
    ...(rows[0]?.[0] ? { quietLine: rows[0][0] } : {}),
    json: {
      status: "ok",
      action: "worker.status",
      items: workers.map((machine) => ({
        id: machine.id,
        mode: machineExecutionMode(machine) ?? "unknown",
        state: machineIsActive(machine) ? "running" : "stopped",
        status: machine.status ?? "unknown",
        lastHeartbeatAt: machine.lastHeartbeatAt ?? null,
        capabilities: machine.services ?? []
      }))
    }
  };
};

const runWorkerStop = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
}): Promise<CommandResult> => {
  const response = await input.client.get<{ items?: MachineSummary[] }>("/machines");
  const workers = (response.items ?? []).filter((machine) => isExecutionWorker(machine));
  if (workers.length === 0) {
    throw new Error("No workers found to stop.");
  }

  const requestedMachineId = (input.args[0] ?? "").trim();
  const target = requestedMachineId
    ? workers.find((machine) => machine.id === requestedMachineId)
    : workers.find((machine) => machineIsActive(machine) && machineSupportsLocalExecution(machine))
      ?? workers.find((machine) => machineIsActive(machine) && machineSupportsRemoteExecution(machine))
      ?? workers[0];

  if (!target) {
    throw new Error(`Worker '${requestedMachineId}' not found.`);
  }

  await input.client.post(`/execution/workers/${target.id}/heartbeat`, {
    status: "offline",
    capabilities: target.services ?? []
  });

  return {
    lines: [
      "OK Worker marked offline",
      `machine: ${target.id}`,
      `mode: ${machineExecutionMode(target) ?? "unknown"}`
    ],
    quietLine: target.id,
    json: {
      status: "ok",
      action: "worker.stop",
      item: {
        id: target.id,
        mode: machineExecutionMode(target) ?? "unknown"
      }
    }
  };
};

const toAgentAdapterType = (value: string | undefined): "legacy_cli" | "custom_cli" | "mcp_runtime" => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "legacy_cli" || normalized === "custom_cli" || normalized === "mcp_runtime") {
    return normalized;
  }
  return "mcp_runtime";
};

const toAgentStatus = (
  value: string | undefined
): "active" | "paused" | "degraded" | "error" | undefined => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "active" || normalized === "paused" || normalized === "degraded" || normalized === "error") {
    return normalized;
  }
  return undefined;
};

const inferAgentCapabilities = (role: string): string[] => {
  const normalized = role.trim().toLowerCase();
  if (normalized.includes("coder") || normalized.includes("builder")) return ["coding"];
  if (normalized.includes("research")) return ["chat_reasoning"];
  if (normalized.includes("review")) return ["chat_reasoning", "coding"];
  return ["chat_reasoning"];
};

const parseRuntimeConfigFlag = (value: string | undefined): Record<string, unknown> => {
  if (!value) return { promptSource: "registry" };
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--runtime-config must be a JSON object");
  }
  return parsed as Record<string, unknown>;
};

const runAgentsCreate = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  flags: Record<string, FlagValue>;
}): Promise<CommandResult> => {
  const name = (asStringFlag(input.flags, "name") ?? input.args.join(" ")).trim();
  const role = (asStringFlag(input.flags, "role") ?? "").trim();
  if (!name) throw new Error("Agent name is required. Example: devtools agents create planner --role planner");
  if (!role) throw new Error("Agent role is required. Example: devtools agents create planner --role planner");

  const capabilities = normalizeAllowlist(parseCsv(asStringFlag(input.flags, "capabilities")));
  const desiredSkills = normalizeAllowlist(parseCsv(asStringFlag(input.flags, "skills")));
  const status = toAgentStatus(asStringFlag(input.flags, "status")) ?? "active";
  const adapterType = toAgentAdapterType(asStringFlag(input.flags, "adapter"));
  const runtimeConfig = parseRuntimeConfigFlag(asStringFlag(input.flags, "runtime-config"));

  const created = await input.client.post<{ item: AgentItem }>("/agents", {
    name,
    role,
    icon: asStringFlag(input.flags, "icon") ?? "agent",
    description: asStringFlag(input.flags, "description") ?? `Agent ${name}`,
    adapterType,
    desiredSkills,
    ...(asStringFlag(input.flags, "report-to") ? { reportTo: asStringFlag(input.flags, "report-to") } : {}),
    runtimeConfig,
    capabilities: capabilities.length > 0 ? capabilities : inferAgentCapabilities(role),
    status
  });

  return {
    lines: [
      "OK Agent created",
      `id: ${created.item.id}`,
      `name: ${created.item.name}`,
      `role: ${created.item.role}`,
      `status: ${created.item.status}`
    ],
    quietLine: created.item.id,
    json: {
      status: "ok",
      action: "agents.create",
      item: created.item
    }
  };
};

const runAgentsEdit = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  flags: Record<string, FlagValue>;
}): Promise<CommandResult> => {
  const agentId = (input.args[0] ?? "").trim();
  if (!agentId) throw new Error("Agent id is required. Example: devtools agents edit agent_001 --role reviewer");

  const capabilities = normalizeAllowlist(parseCsv(asStringFlag(input.flags, "capabilities")));
  const desiredSkills = normalizeAllowlist(parseCsv(asStringFlag(input.flags, "skills")));
  const status = toAgentStatus(asStringFlag(input.flags, "status"));
  const runtimeConfigFlag = asStringFlag(input.flags, "runtime-config");
  const patch: Record<string, unknown> = {
    ...(asStringFlag(input.flags, "name") ? { name: asStringFlag(input.flags, "name") } : {}),
    ...(asStringFlag(input.flags, "role") ? { role: asStringFlag(input.flags, "role") } : {}),
    ...(asStringFlag(input.flags, "icon") ? { icon: asStringFlag(input.flags, "icon") } : {}),
    ...(asStringFlag(input.flags, "description")
      ? { description: asStringFlag(input.flags, "description") }
      : {}),
    ...(asStringFlag(input.flags, "adapter")
      ? { adapterType: toAgentAdapterType(asStringFlag(input.flags, "adapter")) }
      : {}),
    ...(asStringFlag(input.flags, "report-to") ? { reportTo: asStringFlag(input.flags, "report-to") } : {}),
    ...(capabilities.length > 0 ? { capabilities } : {}),
    ...(desiredSkills.length > 0 ? { desiredSkills } : {}),
    ...(status ? { status } : {}),
    ...(runtimeConfigFlag ? { runtimeConfig: parseRuntimeConfigFlag(runtimeConfigFlag) } : {})
  };

  if (Object.keys(patch).length === 0) {
    throw new Error("No edits provided. Pass at least one flag like --role, --description, --capabilities, or --status.");
  }

  const updated = await input.client.patch<{ item: AgentItem }>(`/agents/${agentId}`, patch);
  return {
    lines: [
      "OK Agent updated",
      `id: ${updated.item.id}`,
      `name: ${updated.item.name}`,
      `role: ${updated.item.role}`,
      `status: ${updated.item.status}`
    ],
    quietLine: updated.item.id,
    json: {
      status: "ok",
      action: "agents.edit",
      item: updated.item
    }
  };
};

const upsertProviderConfigWithKey = async (input: {
  client: ReturnType<typeof createApiClient>;
  providerId: "openai" | "openrouter";
  apiKey: string;
  existing?: ProviderConfigItem;
}): Promise<ProviderConfigItem> => {
  if (input.existing) {
    const patched = await input.client.patch<{ item: ProviderConfigItem }>(`/providers/config/${input.existing.id}`, {
      providerId: input.providerId,
      apiKey: input.apiKey,
      enabled: true
    });
    return patched.item;
  }
  const created = await input.client.post<{ item: ProviderConfigItem }>("/providers/config", {
    providerId: input.providerId,
    apiKey: input.apiKey,
    enabled: true
  });
  return created.item;
};

const testProviderConfig = async (input: {
  client: ReturnType<typeof createApiClient>;
  providerConfigId: string;
}): Promise<{
  status?: "ok" | "error";
  latencyMs?: number;
  models?: string[];
  availableModels?: string[];
  error?: string;
  item?: ProviderConfigItem;
}> =>
  await input.client.post(`/providers/config/${input.providerConfigId}/test`);

const bootstrapProviders = async (input: {
  client: ReturnType<typeof createApiClient>;
  deps: CliDeps;
  flags: Record<string, FlagValue>;
  existingConfigs: ProviderConfigItem[];
}): Promise<{
  keySourcePath?: string;
  results: ProviderBootstrapResult[];
  defaultProviderConfigId?: string;
  defaultModelId?: string;
}> => {
  const keys = await resolveProviderKeys(input.deps, input.flags);
  const targets: Array<{ providerId: "openai" | "openrouter"; key?: string }> = [
    { providerId: "openai", ...(keys.openai ? { key: keys.openai } : {}) },
    { providerId: "openrouter", ...(keys.openrouter ? { key: keys.openrouter } : {}) }
  ];

  const results: ProviderBootstrapResult[] = [];

  for (const target of targets) {
    if (!target.key) {
      results.push({
        provider: target.providerId,
        status: "skipped",
        models: [],
        error: "missing_api_key"
      });
      continue;
    }

    try {
      const existing = input.existingConfigs.find(
        (item) => (item.providerId ?? item.provider ?? "").trim().toLowerCase() === target.providerId
      );
      const config = await upsertProviderConfigWithKey({
        client: input.client,
        providerId: target.providerId,
        apiKey: target.key,
        ...(existing ? { existing } : {})
      });
      const tested = await testProviderConfig({
        client: input.client,
        providerConfigId: config.id
      });
      const models = tested.models ?? tested.availableModels ?? [];
      results.push({
        provider: target.providerId,
        providerConfigId: config.id,
        status: tested.status === "ok" ? "ok" : "error",
        latencyMs: tested.latencyMs ?? 0,
        models,
        ...(tested.error ? { error: tested.error } : {})
      });
    } catch (error) {
      results.push({
        provider: target.providerId,
        status: "error",
        models: [],
        error: error instanceof Error ? error.message : "provider_bootstrap_failed"
      });
    }
  }

  try {
    await input.client.post("/providers/discovery/update", {});
  } catch {
    // Discovery refresh is best-effort during bootstrap.
  }

  const successful = results.filter((item) => item.status === "ok" && item.providerConfigId);
  const preferred =
    successful.find((item) => item.provider === "openai") ??
    successful.find((item) => item.provider === "openrouter");

  let defaultProviderConfigId: string | undefined;
  let defaultModelId: string | undefined;
  if (preferred?.providerConfigId) {
    defaultProviderConfigId = preferred.providerConfigId;
    defaultModelId = preferred.models[0];
    try {
      await input.client.patch<{ item?: { defaultProviderConfigId?: string; defaultModelId?: string } }>(
        "/providers/defaults",
        {
          defaultProviderConfigId,
          ...(defaultModelId ? { defaultModelId } : {})
        }
      );
    } catch {
      // Leave defaults unchanged when owner access is unavailable.
    }
  }

  return {
    ...(keys.sourcePath ? { keySourcePath: keys.sourcePath } : {}),
    results,
    ...(defaultProviderConfigId ? { defaultProviderConfigId } : {}),
    ...(defaultModelId ? { defaultModelId } : {})
  };
};

const ensureDefaultAgents = async (input: {
  client: ReturnType<typeof createApiClient>;
  defaultProviderConfigId?: string;
  defaultModelId?: string;
}): Promise<{ created: number; existing: number }> => {
  const response = await input.client.get<{ items?: AgentItem[] }>("/agents");
  const existing = response.items ?? [];
  let created = 0;
  let existingCount = 0;

  for (const spec of defaultAgentSpecs) {
    if (existing.some((item) => item.name.trim().toLowerCase() === spec.name.toLowerCase())) {
      existingCount += 1;
      continue;
    }

    await input.client.post("/agents", {
      name: spec.name,
      role: spec.role,
      icon: spec.icon,
      description: spec.description,
      adapterType: "mcp_runtime",
      desiredSkills: [],
      runtimeConfig: {
        ...(input.defaultProviderConfigId ? { defaultProviderConfigId: input.defaultProviderConfigId } : {}),
        ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
        promptSource: "registry"
      },
      capabilities: spec.capabilities,
      status: "active"
    });
    created += 1;
  }

  return { created, existing: existingCount };
};

const runInit = async (input: {
  client: ReturnType<typeof createApiClient>;
  args: string[];
  flags: Record<string, FlagValue>;
  deps: CliDeps;
  config: CliConfig;
  profile: ExecutionProfileConfig;
  tenantId: string;
  baseUrl: string;
  webBaseUrl: string;
}): Promise<CommandResult> => {
  const requestedName = asStringFlag(input.flags, "name") ?? input.args.join(" ").trim();
  const defaultName = basename(process.cwd()) || "devtools-project";
  const projectName = requestedName || defaultName;
  const providerId = (asStringFlag(input.flags, "provider") ?? "openai").trim().toLowerCase();

  const createdProject = await input.client.post<{ item: ProjectItem }>("/projects", { name: projectName });

  const providerConfigs = await input.client.get<{ items?: ProviderConfigItem[] }>("/providers/config");
  const existingProvider = (providerConfigs.items ?? []).find(
    (item) => (item.providerId ?? item.provider ?? "").toLowerCase() === providerId
  );
  const providerBootstrap = await bootstrapProviders({
    client: input.client,
    deps: input.deps,
    flags: input.flags,
    existingConfigs: providerConfigs.items ?? []
  });
  const successfulProviderBootstrap = providerBootstrap.results.filter((item) => item.status === "ok");
  const selectedBootstrapProvider =
    successfulProviderBootstrap.find((item) => item.provider === providerId) ??
    successfulProviderBootstrap[0];

  let createdProviderId: string | undefined;
  if (!selectedBootstrapProvider && !existingProvider) {
    const createdProvider = await input.client.post<{ item: ProviderConfigItem }>("/providers/config", {
      providerId,
      authRef: providerTemplateAuthRef(providerId),
      enabled: false
    });
    createdProviderId = createdProvider.item.id;
  }

  const agentBootstrap =
    await ensureDefaultAgents({
      client: input.client,
      ...(providerBootstrap.defaultProviderConfigId
        ? { defaultProviderConfigId: providerBootstrap.defaultProviderConfigId }
        : {}),
      ...(providerBootstrap.defaultModelId ? { defaultModelId: providerBootstrap.defaultModelId } : {})
    }).catch(() => ({ created: 0, existing: 0 }));

  const resolvedFallbackProvider =
    selectedBootstrapProvider?.provider ??
    (existingProvider?.providerId ?? existingProvider?.provider)?.toLowerCase() ??
    providerId;

  const nextConfig: CliConfig = {
    ...input.config,
    currentProjectId: createdProject.item.id,
    currentProjectName: createdProject.item.name,
    tenantId: input.tenantId,
    apiBaseUrl: input.baseUrl,
    updatedAt: new Date().toISOString()
  };
  await writeCliConfig(input.deps, nextConfig);
  const requestedMode = toExecutionMode(asStringFlag(input.flags, "mode"));
  const localWorker = await detectActiveLocalWorker(input.client);
  const preferredLlmRaw = asStringFlag(input.flags, "preferred-llm")?.toLowerCase();
  const preferredLlm =
    preferredLlmRaw === "codex" || preferredLlmRaw === "claude" || preferredLlmRaw === "gemini"
      ? preferredLlmRaw
      : undefined;
  const normalizedPreferredLlm =
    preferredLlm ??
    (input.profile.preferredLlm && input.profile.preferredLlm !== "codex"
      ? input.profile.preferredLlm
      : undefined);
  const defaultMode =
    requestedMode ??
    (localWorker.available ? "local" : (input.profile.defaultMode ?? "remote"));
  const {
    preferredLlm: _existingPreferredLlm,
    fallbackProvider: _existingFallbackProvider,
    ...profileRest
  } = input.profile;
  const nextExecutionConfig: ExecutionProfileConfig = {
    ...profileRest,
    defaultMode,
    ...(normalizedPreferredLlm
      ? { preferredLlm: normalizedPreferredLlm }
      : {}),
    fallbackProvider: resolvedFallbackProvider,
    commandAllowlist: input.profile.commandAllowlist ?? ["pnpm", "npm", "git", "node", "docker", "ls", "cat", "echo"],
    requireCommandConfirmation: input.profile.requireCommandConfirmation ?? true,
    updatedAt: new Date().toISOString()
  };
  await writeExecutionConfig(input.deps, nextExecutionConfig);

  const providerLines = providerBootstrap.results.map((result) => {
    if (result.status === "ok") {
      return `provider ${result.provider}: ok (${result.providerConfigId ?? "n/a"}, ${result.models.length} models)`;
    }
    if (result.status === "skipped") {
      return `provider ${result.provider}: skipped (${result.error ?? "not configured"})`;
    }
    return `provider ${result.provider}: error (${result.error ?? "validation failed"})`;
  });

  return {
    lines: [
      "OK Devtools initialized",
      `project: ${createdProject.item.name} (${createdProject.item.id})`,
      ...((providerBootstrap.keySourcePath ? [`provider keys: ${providerBootstrap.keySourcePath}`] : [])),
      ...providerLines,
      (selectedBootstrapProvider || existingProvider)
        ? `provider active: ${selectedBootstrapProvider?.provider ?? existingProvider?.providerId ?? existingProvider?.provider}`
        : "provider active: none (template only)",
      (providerBootstrap.defaultProviderConfigId
        ? `provider default: ${providerBootstrap.defaultProviderConfigId}${providerBootstrap.defaultModelId ? ` / ${providerBootstrap.defaultModelId}` : ""}`
        : "provider default: unchanged"),
      selectedBootstrapProvider || existingProvider
        ? `provider bootstrap: live configuration ready`
        : "provider bootstrap: template created (add API key to activate)",
      `agents bootstrap: created=${agentBootstrap.created}, existing=${agentBootstrap.existing}`,
      (!selectedBootstrapProvider && existingProvider)
        ? `provider template: reuse ${existingProvider.providerId ?? existingProvider.provider} (${existingProvider.id})`
        : createdProviderId
          ? `provider template: created ${providerId} (${createdProviderId})`
          : "provider template: not required",
      `execution fallback provider: ${nextExecutionConfig.fallbackProvider}`,
      `execution preferred local llm: ${nextExecutionConfig.preferredLlm ?? "auto"}`,
      `execution default mode: ${nextExecutionConfig.defaultMode}${
        !requestedMode && localWorker.available ? ` (active local worker${localWorker.machineId ? ` ${localWorker.machineId}` : ""} detected)` : ""
      }`,
      "config: local CLI context saved"
    ],
    quietLine: createdProject.item.id,
    json: {
      status: "ok",
      action: "init",
      project: createdProject.item,
      providerTemplate: {
        provider: providerId,
        ...(existingProvider && !createdProviderId
          ? { reused: true, id: existingProvider.id }
          : { reused: false, ...(createdProviderId ? { id: createdProviderId } : {}) })
      },
      providerBootstrap: {
        ...(providerBootstrap.keySourcePath ? { keySourcePath: providerBootstrap.keySourcePath } : {}),
        results: providerBootstrap.results,
        ...(providerBootstrap.defaultProviderConfigId
          ? { defaultProviderConfigId: providerBootstrap.defaultProviderConfigId }
          : {}),
        ...(providerBootstrap.defaultModelId ? { defaultModelId: providerBootstrap.defaultModelId } : {})
      },
      agentsBootstrap: agentBootstrap,
      config: nextConfig,
      executionConfig: nextExecutionConfig
    },
    openUrl: `${input.webBaseUrl}/project/${createdProject.item.id}`
  };
};

export const runCli = async (argv: string[], customDeps: Partial<CliDeps> = {}): Promise<number> => {
  const deps: CliDeps = {
    ...defaultDeps(),
    ...customDeps
  };

  const { positional, flags } = parseArgs(argv);
  const debug = asBooleanFlag(flags, "debug", false);
  const jsonMode = asBooleanFlag(flags, "json", false);
  const quietMode = asBooleanFlag(flags, "quiet", false);
  const autoOpen = asBooleanFlag(flags, "open", false);

  if (positional.length === 0 || asBooleanFlag(flags, "help", false)) {
    deps.out(helpText);
    return 0;
  }

  const command = positional[0];
  const subcommand = positional[1];
  const args = positional.slice(2);

  const config = await readCliConfig(deps);
  const profile = await readExecutionConfig(deps);
  const baseUrl = toBaseUrl(asStringFlag(flags, "base-url") ?? deps.env.DEVTOOLS_API_BASE_URL ?? config.apiBaseUrl);
  const webBaseUrl = deriveWebBaseUrl(baseUrl, asStringFlag(flags, "web-url") ?? deps.env.DEVTOOLS_WEB_BASE_URL);
  const tenantId = asStringFlag(flags, "tenant") ?? deps.env.DEVTOOLS_TENANT_ID ?? config.tenantId ?? "tenant_default";
  const auth = await resolveAuth(flags, deps);

  const client = createApiClient(deps, {
    baseUrl,
    tenantId,
    ...(auth.token ? { token: auth.token } : {}),
    ...(auth.apiKey ? { apiKey: auth.apiKey } : {})
  });

  try {
    let result: CommandResult;

    if (command === "init") {
      result = await runInit({
        client,
        args: positional.slice(1),
        flags,
        deps,
        config,
        profile,
        tenantId,
        baseUrl,
        webBaseUrl
      });
    } else if (command === "project" && subcommand === "create") {
      result = await runProjectCreate({
        client,
        args,
        flags,
        debug,
        deps,
        webBaseUrl
      });
    } else if (command === "project" && subcommand === "list") {
      result = await runProjectList({ client, debug, deps });
    } else if (command === "project" && subcommand === "use") {
      result = await runProjectUse({
        client,
        args,
        deps,
        config,
        tenantId,
        baseUrl
      });
    } else if (command === "workspace" && subcommand === "attach") {
      result = await runWorkspaceAttach({
        client,
        args,
        flags,
        config,
        deps,
        webBaseUrl
      });
    } else if (command === "workspace" && subcommand === "start") {
      result = await runWorkspaceAction({
        action: "start",
        client,
        flags,
        config,
        deps,
        profile,
        webBaseUrl
      });
    } else if (command === "workspace" && subcommand === "stop") {
      result = await runWorkspaceAction({
        action: "stop",
        client,
        flags,
        config,
        deps,
        profile,
        webBaseUrl
      });
    } else if (command === "workspace" && subcommand === "deploy") {
      result = await runWorkspaceAction({
        action: "deploy",
        client,
        flags,
        config,
        deps,
        profile,
        webBaseUrl
      });
    } else if (command === "workspace" && subcommand === "restart") {
      result = await runWorkspaceAction({
        action: "restart",
        client,
        flags,
        config,
        deps,
        profile,
        webBaseUrl
      });
    } else if (command === "providers" && subcommand === "test") {
      result = await runProvidersTest({
        client,
        args,
        debug,
        deps
      });
    } else if (command === "coding" && subcommand === "run") {
      const executionMode = await resolveExecutionModeWithDetection({
        flags,
        profile,
        fallback: "remote",
        client
      });
      result = await runCodingRun({
        client,
        args,
        flags,
        debug,
        deps,
        config,
        webBaseUrl,
        executionMode
      });
    } else if (command === "worker" && subcommand === "start") {
      result = await runWorkerStart({
        client,
        flags,
        deps,
        profile,
        jsonMode,
        quietMode
      });
    } else if (command === "worker" && subcommand === "status") {
      result = await runWorkerStatus({
        client
      });
    } else if (command === "worker" && subcommand === "stop") {
      result = await runWorkerStop({
        client,
        args
      });
    } else if (command === "agents" && subcommand === "list") {
      result = await runAgentsList({ client, debug, deps });
    } else if (command === "agents" && subcommand === "create") {
      result = await runAgentsCreate({
        client,
        args,
        flags
      });
    } else if (command === "agents" && subcommand === "edit") {
      result = await runAgentsEdit({
        client,
        args,
        flags
      });
    } else if (command === "jobs" && subcommand === "list") {
      result = await runJobsList({ client, flags, config });
    } else if (command === "logs" && subcommand === "tail") {
      result = await runLogsTail({
        client,
        flags,
        config,
        deps,
        jsonMode,
        quietMode
      });
    } else if (command === "context" && subcommand === "open") {
      result = await runContextOpen({
        client,
        flags,
        config,
        webBaseUrl
      });
    } else {
      deps.err(`Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`);
      deps.out(helpText);
      return 1;
    }

    outputCommandResult({
      deps,
      result,
      jsonMode,
      quietMode
    });

    if (result.openUrl && (autoOpen || result.openByDefault)) {
      await deps.openExternalFn(result.openUrl);
      if (!jsonMode && !quietMode) {
        deps.out(`Opened: ${result.openUrl}`);
      }
    }

    return 0;
  } catch (error) {
    if (jsonMode) {
      if (error instanceof ApiError) {
        deps.out(
          JSON.stringify(
            {
              status: "error",
              error: {
                message: error.message,
                statusCode: error.statusCode,
                body: error.body
              }
            },
            null,
            2
          )
        );
        return 1;
      }

      deps.out(
        JSON.stringify(
          {
            status: "error",
            error: {
              message: error instanceof Error ? error.message : "Unexpected CLI error"
            }
          },
          null,
          2
        )
      );
      return 1;
    }

    if (error instanceof ApiError) {
      deps.err(`ERROR API request failed (${error.statusCode}): ${error.message}`);
      if (debug) {
        deps.err(JSON.stringify(error.body, null, 2));
      }
      return 1;
    }

    deps.err(`ERROR ${error instanceof Error ? error.message : "Unexpected CLI error"}`);
    return 1;
  }
};

export const _internal = {
  parseArgs,
  renderTable,
  toBaseUrl,
  deriveWebBaseUrl
};
