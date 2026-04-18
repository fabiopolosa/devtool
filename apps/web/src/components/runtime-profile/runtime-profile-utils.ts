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
    label: "Desktop CLI",
    description: "Launch a vendor CLI from the desktop host."
  },
  {
    value: "server_api",
    label: "Server API",
    description: "Use an API-backed runtime through the control plane."
  },
  {
    value: "mcp_bridge",
    label: "MCP bridge/runtime",
    description: "Bridge the control plane to a worker-managed CLI runtime."
  },
  {
    value: "custom_command",
    label: "Custom command",
    description: "Run a custom command with explicit arguments and cwd."
  },
  {
    value: "legacy_command",
    label: "Legacy command",
    description: "Keep compatibility with older command-based setups."
  }
];

export const runtimeKindFromAdapterType = (adapterType: AgentRuntimeAdapterType): RuntimeKind =>
  adapterType === "legacy_cli"
    ? "legacy_command"
    : adapterType === "custom_cli"
      ? "custom_command"
      : "mcp_bridge";

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
  desktop_cli: "Desktop CLI",
  server_api: "Server API",
  mcp_bridge: "MCP bridge/runtime",
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
  desktop_app: "Desktop app",
  local_worker: "Local worker",
  remote_worker: "Remote worker",
  api: "API"
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
  agent: Pick<AgentConfig, "adapterType"> & { runtimeProfile?: AgentRuntimeProfile | undefined }
): AgentRuntimeProfile => agent.runtimeProfile ?? defaultRuntimeProfile(runtimeKindFromAdapterType(agent.adapterType));
