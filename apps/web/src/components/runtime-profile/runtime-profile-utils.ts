import type {
  AgentConfig,
  AgentRuntimeAdapterType,
  AgentLaunchMode,
  AgentRuntimeHost,
  AgentRuntimeProfile,
  AgentRuntimeVendor,
  HeartbeatIntervalPreset,
  HeartbeatPolicy,
  HeartbeatTriggerPreset
} from "@cp/domain";

export type RuntimeKind =
  | "desktop_cli"
  | "server_api"
  | "mcp_bridge"
  | "custom_command"
  | "legacy_command";

export type RuntimeOption = {
  value: RuntimeKind;
  label: string;
  description: string;
};

export const runtimeKindOptions: RuntimeOption[] = [
  {
    value: "desktop_cli",
    label: "Local CLI",
    description: "Run a CLI like Codex, Claude Code or Gemini on this machine."
  },
  {
    value: "server_api",
    label: "Cloud / API",
    description: "Use hosted models and provider keys through the control plane."
  },
  {
    value: "mcp_bridge",
    label: "Managed worker bridge",
    description: "Use a worker-managed runtime without exposing low-level bridge setup."
  },
  {
    value: "custom_command",
    label: "Custom command",
    description: "Advanced: run your own command with explicit cwd and arguments."
  },
  {
    value: "legacy_command",
    label: "Legacy command",
    description: "Compatibility mode for older command-based setups."
  }
];

const normalizeAdapterType = (adapterType: AgentRuntimeAdapterType | string): AgentRuntimeAdapterType =>
  adapterType === "legacy_cli" || adapterType === "custom_cli" || adapterType === "mcp_runtime"
    ? adapterType
    : adapterType.endsWith("_cli")
      ? "custom_cli"
      : "mcp_runtime";

export const runtimeKindFromAdapterType = (adapterType: AgentRuntimeAdapterType | string): RuntimeKind => {
  const normalizedAdapterType = normalizeAdapterType(adapterType);
  return normalizedAdapterType === "legacy_cli"
    ? "legacy_command"
    : normalizedAdapterType === "custom_cli"
      ? "custom_command"
      : "mcp_bridge";
};

export const runtimeVendorOptions: Record<RuntimeKind, Array<{ value: AgentRuntimeVendor; label: string }>> = {
  desktop_cli: [
    { value: "openai_codex", label: "OpenAI Codex CLI" },
    { value: "claude_code", label: "Claude Code" },
    { value: "gemini_cli", label: "Gemini CLI" },
    { value: "generic_cli", label: "Generic CLI" }
  ],
  server_api: [
    { value: "openai_api", label: "OpenAI API" },
    { value: "anthropic_api", label: "Anthropic API" },
    { value: "gemini_api", label: "Gemini API" },
    { value: "generic_api", label: "Generic API" }
  ],
  mcp_bridge: [
    { value: "openai_codex", label: "OpenAI Codex CLI" },
    { value: "claude_code", label: "Claude Code" },
    { value: "gemini_cli", label: "Gemini CLI" },
    { value: "generic_cli", label: "Generic CLI" }
  ],
  custom_command: [
    { value: "openai_codex", label: "OpenAI Codex CLI" },
    { value: "claude_code", label: "Claude Code" },
    { value: "gemini_cli", label: "Gemini CLI" },
    { value: "generic_cli", label: "Generic CLI" }
  ],
  legacy_command: [{ value: "generic_cli", label: "Generic CLI" }]
};

export const runtimeHostOptions: Record<RuntimeKind, Array<{ value: AgentRuntimeHost; label: string }>> = {
  desktop_cli: [
    { value: "desktop_app", label: "Desktop app" },
    { value: "local_worker", label: "Local worker" }
  ],
  server_api: [{ value: "api", label: "API" }],
  mcp_bridge: [
    { value: "local_worker", label: "Local worker" },
    { value: "remote_worker", label: "Remote worker" },
    { value: "desktop_app", label: "Desktop app" }
  ],
  custom_command: [
    { value: "local_worker", label: "Local worker" },
    { value: "remote_worker", label: "Remote worker" },
    { value: "desktop_app", label: "Desktop app" }
  ],
  legacy_command: [
    { value: "local_worker", label: "Local worker" },
    { value: "remote_worker", label: "Remote worker" },
    { value: "desktop_app", label: "Desktop app" }
  ]
};

export const launchModeOptions: Array<{ value: AgentLaunchMode; label: string }> = [
  { value: "interactive", label: "Interactive" },
  { value: "headless", label: "Headless" },
  { value: "queued", label: "Queued" }
];

export const heartbeatIntervalOptions: Array<{ value: HeartbeatIntervalPreset; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "1m", label: "Every minute" },
  { value: "5m", label: "Every 5 minutes" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
  { value: "1h", label: "Every hour" }
];

export const heartbeatTriggerOptions: Array<{ value: HeartbeatTriggerPreset; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "on_startup", label: "On startup" },
  { value: "after_deploy", label: "After deploy" },
  { value: "after_failure", label: "After failure" }
];

export const runtimeKindLabels: Record<RuntimeKind, string> = {
  desktop_cli: "Local CLI",
  server_api: "Cloud / API",
  mcp_bridge: "Managed worker bridge",
  custom_command: "Custom command",
  legacy_command: "Legacy command"
};

export const runtimeVendorLabels: Record<AgentRuntimeVendor, string> = {
  openai_codex: "OpenAI Codex CLI",
  claude_code: "Claude Code",
  gemini_cli: "Gemini CLI",
  generic_cli: "Generic CLI",
  openai_api: "OpenAI API",
  anthropic_api: "Anthropic API",
  gemini_api: "Gemini API",
  generic_api: "Generic API"
};

export const runtimeHostLabels: Record<AgentRuntimeHost, string> = {
  desktop_app: "This machine (desktop app)",
  local_worker: "This machine (local worker)",
  remote_worker: "Remote worker",
  api: "Cloud / API"
};

export const launchModeLabels: Record<AgentLaunchMode, string> = {
  interactive: "Interactive",
  headless: "Headless",
  queued: "Queued"
};

export const heartbeatIntervalLabels: Record<HeartbeatIntervalPreset, string> = {
  manual: "Manual",
  "1m": "Every minute",
  "5m": "Every 5 minutes",
  "15m": "Every 15 minutes",
  "30m": "Every 30 minutes",
  "1h": "Every hour"
};

export const heartbeatTriggerLabels: Record<HeartbeatTriggerPreset, string> = {
  manual: "Manual",
  on_startup: "On startup",
  after_deploy: "After deploy",
  after_failure: "After failure"
};

export const runtimeKindToCompatibilityAdapter = (runtimeKind: RuntimeKind): "legacy_cli" | "custom_cli" | "mcp_runtime" =>
  runtimeKind === "legacy_command"
    ? "legacy_cli"
    : runtimeKind === "custom_command"
      ? "custom_cli"
      : "mcp_runtime";

export const defaultRuntimeProfile = (runtimeKind: RuntimeKind): AgentRuntimeProfile => {
  const vendor = runtimeVendorOptions[runtimeKind][0]?.value ?? "generic_cli";
  const host = runtimeHostOptions[runtimeKind][0]?.value ?? "local_worker";
  const launchMode: AgentLaunchMode =
    runtimeKind === "server_api" ? "queued" : runtimeKind === "desktop_cli" ? "interactive" : "headless";
  return {
    runtimeKind,
    vendor,
    host,
    launchMode,
    args: [],
    metadata: {}
  };
};

export const normalizeRuntimeKindSelection = (runtimeKind: RuntimeKind): AgentRuntimeProfile => {
  const defaults = defaultRuntimeProfile(runtimeKind);
  return {
    ...defaults,
    ...(runtimeKind === "server_api" ? { host: "api", launchMode: "queued" } : {}),
    ...(runtimeKind === "desktop_cli" ? { host: "desktop_app", launchMode: "interactive" } : {})
  };
};

export const describeRuntimeProfile = (profile?: Partial<AgentRuntimeProfile> | null): string => {
  if (!profile) return "Not configured";
  const runtimeKind = profile.runtimeKind as RuntimeKind | undefined;
  const vendor = profile.vendor ? runtimeVendorLabels[profile.vendor] ?? profile.vendor : "Vendor";
  const host = profile.host ? runtimeHostLabels[profile.host] ?? profile.host : "Host";
  const launchMode = profile.launchMode ? launchModeLabels[profile.launchMode] ?? profile.launchMode : "Mode";
  const family = runtimeKind ? runtimeKindLabels[runtimeKind] ?? runtimeKind : "Runtime";
  return `${family} · ${vendor} · ${host} · ${launchMode}`;
};

export const describeHeartbeatPolicy = (policy?: Partial<HeartbeatPolicy> | null): string => {
  if (!policy) return "No heartbeat policy";
  const interval = policy.interval ? heartbeatIntervalLabels[policy.interval] ?? policy.interval : "Manual";
  const triggers = policy.triggers?.length
    ? policy.triggers.map((trigger) => heartbeatTriggerLabels[trigger] ?? trigger).join(", ")
    : "Manual";
  const enabled = policy.enabled === false ? "Disabled" : "Enabled";
  return `${enabled} · ${interval} · ${triggers}`;
};

export const resolveRuntimeProfileForAgent = (
  agent: Pick<AgentConfig, "adapterType"> & { runtimeProfile?: Partial<AgentRuntimeProfile> | undefined }
): AgentRuntimeProfile => {
  const runtimeKind = runtimeKindFromAdapterType(normalizeAdapterType(agent.adapterType));
  const defaults = defaultRuntimeProfile(runtimeKind);
  const profile = agent.runtimeProfile;
  const normalizedRuntimeKind =
    profile?.runtimeKind && runtimeKindOptions.some((option) => option.value === profile.runtimeKind)
      ? profile.runtimeKind
      : defaults.runtimeKind;
  return {
    ...defaults,
    runtimeKind: normalizedRuntimeKind,
    ...(profile?.vendor ? { vendor: profile.vendor } : {}),
    ...(profile?.host ? { host: profile.host } : {}),
    ...(profile?.launchMode ? { launchMode: profile.launchMode } : {}),
    ...(profile?.command ? { command: profile.command } : {}),
    ...(profile?.cwd ? { cwd: profile.cwd } : {}),
    ...(profile?.mcpServerRef ? { mcpServerRef: profile.mcpServerRef } : {}),
    ...(profile?.apiConfigRef ? { apiConfigRef: profile.apiConfigRef } : {}),
    ...(typeof profile?.workerPoolSize === "number" ? { workerPoolSize: profile.workerPoolSize } : {}),
    args: profile?.args ?? defaults.args,
    metadata:
      profile?.metadata && typeof profile.metadata === "object" && !Array.isArray(profile.metadata)
        ? profile.metadata
        : defaults.metadata
  };
};

export type LocalHostSnapshot = {
  attached?: boolean;
  connected?: boolean;
  machineAttached?: boolean;
  status?: string;
  machineName?: string;
  hostname?: string;
  workspaceAttached?: boolean;
  folderAttached?: boolean;
  localPath?: string;
  workspacePath?: string;
  previewAvailable?: boolean;
  previewStatus?: string;
  previewUrl?: string;
  previewPort?: number;
  message?: string;
};

export type AppTargetConfig = {
  id?: string;
  name: string;
  runCommand?: string;
  testCommand?: string;
  devCommand?: string;
  previewUrl?: string;
  previewPort?: number;
  enabled?: boolean;
  status?: string;
  lastAction?: string;
  lastActionAt?: string;
};

export type AppTargetConfigInput = {
  id?: string | undefined;
  name?: string | undefined;
  runCommand?: string | undefined;
  testCommand?: string | undefined;
  devCommand?: string | undefined;
  previewUrl?: string | undefined;
  previewPort?: number | string | undefined;
  enabled?: boolean | undefined;
  status?: string | undefined;
  lastAction?: string | undefined;
  lastActionAt?: string | undefined;
};

export type LocalWrapperSignals = {
  machineAttached: boolean;
  folderAttached: boolean;
  previewAvailable: boolean;
  machineLabel: string;
  folderLabel: string;
  previewLabel: string;
  previewHref: string | undefined;
};

const hasText = (value?: string | null): boolean => Boolean(value && value.trim().length > 0);

export const resolveLocalWrapperSignals = (
  localHost?: Partial<LocalHostSnapshot> | null,
  workspacePath?: string | null,
  appTarget?: Partial<AppTargetConfigInput> | null
): LocalWrapperSignals => {
  const machineAttached = Boolean(
    localHost?.attached
    || localHost?.connected
    || localHost?.machineAttached
    || localHost?.status === "attached"
    || localHost?.status === "connected"
  );
  const folderAttached = Boolean(
    localHost?.workspaceAttached
    || localHost?.folderAttached
    || hasText(localHost?.localPath)
    || hasText(localHost?.workspacePath)
    || hasText(workspacePath)
  );
  const previewHref = localHost?.previewUrl ?? appTarget?.previewUrl;
  const previewPort = localHost?.previewPort ?? appTarget?.previewPort;
  const previewAvailable = Boolean(
    localHost?.previewAvailable
    || localHost?.previewStatus === "available"
    || hasText(previewHref)
    || typeof previewPort === "number"
    || (typeof previewPort === "string" && hasText(previewPort))
  );

  return {
    machineAttached,
    folderAttached,
    previewAvailable,
    machineLabel: machineAttached ? "Local machine attached" : "Local machine not attached",
    folderLabel: folderAttached ? "Local folder attached" : "Local folder not attached",
    previewLabel: previewAvailable ? "Local preview available" : "Local preview not available",
    previewHref: hasText(previewHref) ? previewHref : undefined
  };
};

export const describeLocalWrapperStatus = (
  localHost?: Partial<LocalHostSnapshot> | null,
  workspacePath?: string | null,
  appTarget?: Partial<AppTargetConfigInput> | null
): string => {
  const signals = resolveLocalWrapperSignals(localHost, workspacePath, appTarget);
  const details: string[] = [signals.machineLabel, signals.folderLabel, signals.previewLabel];
  return details.join(" · ");
};

export const defaultAppTargetConfig = (): AppTargetConfig => ({
  name: "Main app target",
  runCommand: "",
  testCommand: "",
  devCommand: "",
  previewUrl: "",
  enabled: true
});

export const normalizeAppTargetConfig = (draft: Partial<AppTargetConfigInput> | null | undefined): AppTargetConfig => {
  const source = draft ?? {};
  const previewPort =
    typeof source.previewPort === "string"
      ? Number(source.previewPort.trim())
      : source.previewPort;
  return {
    ...(hasText(source.id) ? { id: source.id!.trim() } : {}),
    name: hasText(source.name) ? source.name!.trim() : "Main app target",
    ...(hasText(source.runCommand) ? { runCommand: source.runCommand!.trim() } : {}),
    ...(hasText(source.testCommand) ? { testCommand: source.testCommand!.trim() } : {}),
    ...(hasText(source.devCommand) ? { devCommand: source.devCommand!.trim() } : {}),
    ...(hasText(source.previewUrl) ? { previewUrl: source.previewUrl!.trim() } : {}),
    ...(typeof previewPort === "number" && Number.isFinite(previewPort) ? { previewPort } : {}),
    enabled: source.enabled !== false,
    ...(hasText(source.status) ? { status: source.status!.trim() } : {}),
    ...(hasText(source.lastAction) ? { lastAction: source.lastAction!.trim() } : {}),
    ...(hasText(source.lastActionAt) ? { lastActionAt: source.lastActionAt!.trim() } : {})
  };
};

export const describeAppTarget = (target?: Partial<AppTargetConfigInput> | null): string => {
  if (!target) return "No app target configured";
  const pieces = [target.name ?? "App target"];
  if (hasText(target.runCommand)) pieces.push(`run ${target.runCommand}`);
  if (hasText(target.devCommand)) pieces.push(`dev ${target.devCommand}`);
  if (hasText(target.testCommand)) pieces.push(`test ${target.testCommand}`);
  if (hasText(target.previewUrl)) pieces.push(`preview ${target.previewUrl}`);
  else if (typeof target.previewPort === "number") pieces.push(`preview port ${target.previewPort}`);
  return pieces.join(" · ");
};
