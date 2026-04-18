import type {
  AgentLaunchMode,
  AgentRuntimeHost,
  AgentRuntimeKind,
  AgentRuntimeProfile,
  AgentRuntimeVendor
} from "./contracts.js";

export type DesktopCliVendor = Extract<
  AgentRuntimeVendor,
  "openai_codex" | "claude_code" | "gemini_cli" | "generic_cli"
>;

export const supportedDesktopCliVendors = [
  "openai_codex",
  "claude_code",
  "gemini_cli",
  "generic_cli"
] as const satisfies readonly DesktopCliVendor[];

export const isDesktopCliVendor = (vendor: AgentRuntimeVendor): vendor is DesktopCliVendor =>
  supportedDesktopCliVendors.includes(vendor as DesktopCliVendor);

export interface CliLaunchRequest {
  profile: AgentRuntimeProfile;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface CliLaunchPlan {
  vendor: DesktopCliVendor;
  runtimeKind: AgentRuntimeKind;
  host: AgentRuntimeHost;
  launchMode: AgentLaunchMode;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface CliLauncher {
  readonly vendor: DesktopCliVendor;
  buildLaunchPlan(request: CliLaunchRequest): CliLaunchPlan;
}

const normalizeArgs = (args: string[] | undefined): string[] =>
  (args ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);

const mergeArgs = (...chunks: Array<string[] | undefined>): string[] =>
  chunks.flatMap((chunk) => normalizeArgs(chunk));

const defaultCommands: Record<DesktopCliVendor, string> = {
  openai_codex: "codex",
  claude_code: "claude",
  gemini_cli: "gemini",
  generic_cli: "generic-cli"
};

const resolveCommand = (vendor: DesktopCliVendor, command?: string): string =>
  command?.trim().length ? command.trim() : defaultCommands[vendor];

abstract class BaseCliLauncher implements CliLauncher {
  abstract readonly vendor: DesktopCliVendor;

  buildLaunchPlan(request: CliLaunchRequest): CliLaunchPlan {
    const profile = request.profile;
    return {
      vendor: this.vendor,
      runtimeKind: profile.runtimeKind,
      host: profile.host,
      launchMode: profile.launchMode,
      command: resolveCommand(this.vendor, profile.command),
      args: mergeArgs(profile.args, request.args),
      ...(profile.cwd ? { cwd: profile.cwd } : request.cwd ? { cwd: request.cwd } : {}),
      ...(request.env ? { env: { ...request.env } } : {})
    };
  }
}

export class OpenAiCodexCliLauncher extends BaseCliLauncher {
  readonly vendor = "openai_codex" as const;
}

export class ClaudeCodeCliLauncher extends BaseCliLauncher {
  readonly vendor = "claude_code" as const;
}

export class GeminiCliLauncher extends BaseCliLauncher {
  readonly vendor = "gemini_cli" as const;
}

export class GenericCliLauncher extends BaseCliLauncher {
  readonly vendor = "generic_cli" as const;
}

export const cliLaunchers: Record<DesktopCliVendor, CliLauncher> = {
  openai_codex: new OpenAiCodexCliLauncher(),
  claude_code: new ClaudeCodeCliLauncher(),
  gemini_cli: new GeminiCliLauncher(),
  generic_cli: new GenericCliLauncher()
};

export const resolveCliLauncher = (vendor: AgentRuntimeVendor): CliLauncher => {
  if (isDesktopCliVendor(vendor)) {
    return cliLaunchers[vendor];
  }
  throw new Error(`No CLI launcher is available for vendor ${vendor}`);
};

export const buildCliLaunchPlan = (request: CliLaunchRequest): CliLaunchPlan =>
  resolveCliLauncher(request.profile.vendor).buildLaunchPlan(request);
