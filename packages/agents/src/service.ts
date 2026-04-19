import { randomUUID } from "node:crypto";
import type {
  AgentConfig,
  AgentLaunchMode,
  AgentRuntimeHost,
  AgentRuntimeKind,
  AgentRuntimeProfile,
  AgentRuntimeVendor,
  AgentRuntimeAdapterType,
  HeartbeatPolicy
} from "@cp/domain";
import { buildHeartbeatPolicy } from "@cp/domain";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export interface AgentRuntimeInvocationOptions {
  reason?: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentRuntimeProfileValidationIssue {
  field: string;
  message: string;
}

export interface AgentRuntimeJobReference {
  agentId: string;
  jobId: string;
  queueName: string;
  operation: "heartbeat" | "diagnose";
  status: "queued";
  command: string;
  args: string[];
  createdAt: string;
}

export interface AgentRuntimeJobSnapshot {
  agentId: string;
  jobId: string;
  queueName: string;
  operation: "heartbeat" | "diagnose";
  state: string;
  progress: number;
  attemptsMade: number;
  failedReason?: string;
  logs: string[];
}

export interface AgentConfigStore {
  listAgents(): Promise<AgentConfig[]>;
  getAgent(agentId: string): Promise<AgentConfig | null>;
  createAgent(agent: AgentConfig): Promise<AgentConfig>;
  updateAgent(agentId: string, patch: Partial<AgentConfig>): Promise<AgentConfig>;
  deleteAgent(agentId: string): Promise<void>;
}

export interface AgentRuntimeScheduler {
  enqueueHeartbeat(
    agent: AgentConfig,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference>;
  enqueueDiagnose(
    agent: AgentConfig,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference>;
  getJobSnapshot(jobId: string): Promise<AgentRuntimeJobSnapshot | null>;
  close?(): Promise<void>;
}

export class AgentRuntimeSchedulerUnavailableError extends Error {
  constructor(message = "Agent runtime scheduler requires REDIS_URL") {
    super(message);
    this.name = "AgentRuntimeSchedulerUnavailableError";
  }
}

export class AgentRuntimeProfileValidationError extends Error {
  readonly issues: AgentRuntimeProfileValidationIssue[];

  constructor(issues: AgentRuntimeProfileValidationIssue[]) {
    super(
      issues.length > 0
        ? `Invalid agent runtime profile: ${issues.map((issue) => issue.message).join("; ")}`
        : "Invalid agent runtime profile"
    );
    this.name = "AgentRuntimeProfileValidationError";
    this.issues = issues;
  }
}

export interface AgentRuntimeJobData {
  agentId: string;
  operation: "heartbeat" | "diagnose";
  command: string;
  args: string[];
  cwd?: string | undefined;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

const agentRuntimeAdapterTypeToRuntimeKindMap = {
  mcp_runtime: "mcp_bridge",
  custom_cli: "custom_command",
  legacy_cli: "legacy_command"
} as const satisfies Record<AgentRuntimeAdapterType, AgentRuntimeKind>;

const runtimeKinds = new Set<AgentRuntimeKind>([
  "desktop_cli",
  "server_api",
  "mcp_bridge",
  "custom_command",
  "legacy_command"
]);

const agentRuntimeKindDefaults: Record<
  AgentRuntimeKind,
  {
    vendor: AgentRuntimeVendor;
    host: AgentRuntimeHost;
    launchMode: AgentLaunchMode;
  }
> = {
  desktop_cli: {
    vendor: "generic_cli",
    host: "desktop_app",
    launchMode: "interactive"
  },
  server_api: {
    vendor: "generic_api",
    host: "api",
    launchMode: "queued"
  },
  mcp_bridge: {
    vendor: "generic_cli",
    host: "local_worker",
    launchMode: "queued"
  },
  custom_command: {
    vendor: "generic_cli",
    host: "local_worker",
    launchMode: "headless"
  },
  legacy_command: {
    vendor: "generic_cli",
    host: "local_worker",
    launchMode: "headless"
  }
};

const cliRuntimeVendors = new Set<AgentRuntimeVendor>([
  "openai_codex",
  "claude_code",
  "gemini_cli",
  "generic_cli"
]);
const apiRuntimeVendors = new Set<AgentRuntimeVendor>([
  "openai_api",
  "anthropic_api",
  "gemini_api",
  "generic_api"
]);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const normalizeAdapterType = (adapterType: AgentRuntimeAdapterType | string): AgentRuntimeAdapterType => {
  if (adapterType === "legacy_cli" || adapterType === "custom_cli" || adapterType === "mcp_runtime") {
    return adapterType;
  }
  return adapterType.endsWith("_cli") ? "custom_cli" : "mcp_runtime";
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : [];
};

const resolveRuntimeKind = (
  adapterType: AgentRuntimeAdapterType | string,
  runtimeKind?: AgentRuntimeProfile["runtimeKind"]
): AgentRuntimeKind => {
  if (runtimeKind && runtimeKinds.has(runtimeKind)) {
    return runtimeKind;
  }
  return agentRuntimeAdapterTypeToRuntimeKindMap[normalizeAdapterType(adapterType)];
};

const resolveRuntimeDefaults = (runtimeKind: AgentRuntimeKind): {
  vendor: AgentRuntimeVendor;
  host: AgentRuntimeHost;
  launchMode: AgentLaunchMode;
} => agentRuntimeKindDefaults[runtimeKind];

const resolveRuntimeCommand = (
  runtimeKind: AgentRuntimeKind,
  vendor: AgentRuntimeVendor,
  runtimeConfig: Record<string, unknown>,
  runtimeProfile?: Partial<AgentRuntimeProfile>
): string | undefined => {
  const profileCommand = asString(runtimeProfile?.command);
  if (profileCommand) return profileCommand;

  const runtimeCommand = asString(runtimeConfig.commandPrefix);
  if (runtimeCommand) return runtimeCommand;

  if (!cliRuntimeVendors.has(vendor) && !apiRuntimeVendors.has(vendor)) {
    return undefined;
  }
  if (runtimeKind === "server_api") {
    return undefined;
  }
  if (vendor === "openai_codex") return "codex";
  if (vendor === "claude_code") return "claude";
  if (vendor === "gemini_cli") return "gemini";
  return "devtools-agent";
};

const normalizeRuntimeProfileMetadata = (
  runtimeConfig: Record<string, unknown>,
  runtimeProfile?: Partial<AgentRuntimeProfile>
): Record<string, unknown> => ({
  ...(asRecord(runtimeConfig.metadata) ?? {}),
  ...(runtimeProfile?.metadata ?? {})
});

const normalizeRuntimeProfileArgs = (
  runtimeConfig: Record<string, unknown>,
  runtimeProfile?: Partial<AgentRuntimeProfile>
): string[] => {
  const profileArgs = asStringArray(runtimeProfile?.args);
  if (profileArgs !== undefined) return profileArgs;
  const configArgs = asStringArray(runtimeConfig.args);
  return configArgs ?? [];
};

const normalizeRuntimeProfileCwd = (
  runtimeConfig: Record<string, unknown>,
  runtimeProfile?: Partial<AgentRuntimeProfile>
): string | undefined => asString(runtimeProfile?.cwd) ?? asString(runtimeConfig.cwd);

const validateRuntimeProfileHost = (
  runtimeKind: AgentRuntimeKind,
  host: AgentRuntimeHost,
  issues: AgentRuntimeProfileValidationIssue[]
): void => {
  const allowedHostsByKind: Record<AgentRuntimeKind, AgentRuntimeHost[]> = {
    desktop_cli: ["desktop_app", "local_worker"],
    server_api: ["api"],
    mcp_bridge: ["desktop_app", "local_worker", "remote_worker"],
    custom_command: ["desktop_app", "local_worker", "remote_worker"],
    legacy_command: ["desktop_app", "local_worker", "remote_worker"]
  };

  if (!allowedHostsByKind[runtimeKind].includes(host)) {
    issues.push({
      field: "host",
      message: `${runtimeKind} runtimes do not support host '${host}'`
    });
  }
};

const validateRuntimeProfileVendor = (
  runtimeKind: AgentRuntimeKind,
  vendor: AgentRuntimeVendor,
  issues: AgentRuntimeProfileValidationIssue[]
): void => {
  if (runtimeKind === "server_api" && !apiRuntimeVendors.has(vendor)) {
    issues.push({
      field: "vendor",
      message: `server_api runtimes require an API-backed vendor, received '${vendor}'`
    });
    return;
  }

  if (runtimeKind !== "server_api" && !cliRuntimeVendors.has(vendor)) {
    issues.push({
      field: "vendor",
      message: `${runtimeKind} runtimes require a CLI vendor, received '${vendor}'`
    });
  }
};

const validateRuntimeProfileLaunchMode = (
  runtimeKind: AgentRuntimeKind,
  launchMode: AgentLaunchMode,
  issues: AgentRuntimeProfileValidationIssue[]
): void => {
  const allowedLaunchModesByKind: Record<AgentRuntimeKind, AgentLaunchMode[]> = {
    desktop_cli: ["interactive", "headless"],
    server_api: ["queued"],
    mcp_bridge: ["headless", "queued"],
    custom_command: ["interactive", "headless", "queued"],
    legacy_command: ["headless", "queued"]
  };

  if (!allowedLaunchModesByKind[runtimeKind].includes(launchMode)) {
    issues.push({
      field: "launchMode",
      message: `${runtimeKind} runtimes do not support launch mode '${launchMode}'`
    });
  }
};

const validateRuntimeProfileRefs = (
  runtimeKind: AgentRuntimeKind,
  profile: AgentRuntimeProfile,
  issues: AgentRuntimeProfileValidationIssue[]
): void => {
  if (runtimeKind === "server_api" && !asString(profile.apiConfigRef)) {
    issues.push({
      field: "apiConfigRef",
      message: "server_api runtimes require apiConfigRef"
    });
  }
  if (runtimeKind === "mcp_bridge" && !asString(profile.mcpServerRef)) {
    issues.push({
      field: "mcpServerRef",
      message: "mcp_bridge runtimes require mcpServerRef"
    });
  }
};

export const validateAgentRuntimeProfile = (
  profile: AgentRuntimeProfile
): AgentRuntimeProfileValidationIssue[] => {
  const issues: AgentRuntimeProfileValidationIssue[] = [];
  validateRuntimeProfileVendor(profile.runtimeKind, profile.vendor, issues);
  validateRuntimeProfileHost(profile.runtimeKind, profile.host, issues);
  validateRuntimeProfileLaunchMode(profile.runtimeKind, profile.launchMode, issues);
  validateRuntimeProfileRefs(profile.runtimeKind, profile, issues);
  if (profile.workerPoolSize !== undefined && profile.workerPoolSize <= 0) {
    issues.push({
      field: "workerPoolSize",
      message: "workerPoolSize must be a positive integer when provided"
    });
  }
  return issues;
};

export const normalizeAgentRuntimeProfile = (input: {
  adapterType: AgentRuntimeAdapterType;
  runtimeConfig?: Record<string, unknown>;
  runtimeProfile?: Partial<AgentRuntimeProfile>;
}): AgentRuntimeProfile => {
  const runtimeConfig = input.runtimeConfig ?? {};
  const runtimeProfile = input.runtimeProfile;
  const runtimeKind = resolveRuntimeKind(input.adapterType, runtimeProfile?.runtimeKind);
  const defaults = resolveRuntimeDefaults(runtimeKind);
  const vendor = runtimeProfile?.vendor ?? defaults.vendor;
  const host = runtimeProfile?.host ?? defaults.host;
  const launchMode = runtimeProfile?.launchMode ?? defaults.launchMode;
  const command = resolveRuntimeCommand(
    runtimeKind,
    vendor,
    runtimeConfig,
    runtimeProfile
  );
  const cwd = normalizeRuntimeProfileCwd(runtimeConfig, runtimeProfile);
  const mcpServerRef = asString(runtimeProfile?.mcpServerRef);
  const apiConfigRef = asString(runtimeProfile?.apiConfigRef);
  const workerPoolSize = runtimeProfile?.workerPoolSize;
  const next: AgentRuntimeProfile = {
    runtimeKind,
    vendor,
    host,
    launchMode,
    ...(command ? { command } : {}),
    args: normalizeRuntimeProfileArgs(runtimeConfig, runtimeProfile),
    ...(cwd ? { cwd } : {}),
    ...(mcpServerRef ? { mcpServerRef } : {}),
    ...(apiConfigRef ? { apiConfigRef } : {}),
    ...(typeof workerPoolSize === "number" ? { workerPoolSize } : {}),
    metadata: normalizeRuntimeProfileMetadata(runtimeConfig, runtimeProfile)
  };

  const issues = validateAgentRuntimeProfile(next);
  if (issues.length > 0) {
    throw new AgentRuntimeProfileValidationError(issues);
  }
  return next;
};

export const normalizeHeartbeatPolicy = (
  heartbeatPolicy?: Partial<HeartbeatPolicy>
): HeartbeatPolicy =>
  buildHeartbeatPolicy({
    ...(heartbeatPolicy?.interval ? { interval: heartbeatPolicy.interval } : {}),
    ...(heartbeatPolicy?.triggers ? { triggers: heartbeatPolicy.triggers } : {}),
    ...(typeof heartbeatPolicy?.enabled === "boolean" ? { enabled: heartbeatPolicy.enabled } : {}),
    ...(heartbeatPolicy?.metadata ? { metadata: heartbeatPolicy.metadata } : {})
  });

const normalizeAgentRecord = (agent: AgentConfig): AgentConfig => {
  const runtimeConfig = asRecord(agent.runtimeConfig) ?? {};
  const adapterType = normalizeAdapterType(agent.adapterType);
  try {
    return {
      ...agent,
      adapterType,
      runtimeConfig,
      runtimeProfile: agent.runtimeProfile
        ? normalizeAgentRuntimeProfile({
            adapterType,
            runtimeConfig,
            runtimeProfile: agent.runtimeProfile
          })
        : normalizeAgentRuntimeProfile({
            adapterType,
            runtimeConfig
          }),
      heartbeatPolicy: normalizeHeartbeatPolicy(agent.heartbeatPolicy)
    };
  } catch (error) {
    if (!(error instanceof AgentRuntimeProfileValidationError)) {
      throw error;
    }
    return {
      ...agent,
      adapterType,
      runtimeConfig,
      heartbeatPolicy: normalizeHeartbeatPolicy(agent.heartbeatPolicy)
    };
  }
};

const toJobData = (
  operation: "heartbeat" | "diagnose",
  agent: AgentConfig,
  options?: AgentRuntimeInvocationOptions
): AgentRuntimeJobData => {
  const command = asString(agent.runtimeConfig.commandPrefix) ?? "devtools-agent";
  const args =
    operation === "heartbeat"
      ? ["heartbeat", "run", "--agent", agent.name]
      : ["doctor", "run", "--agent", agent.name];
  const timeoutFromRuntime = agent.runtimeConfig.timeoutMs;
  const timeoutMs =
    typeof options?.timeoutMs === "number"
      ? options.timeoutMs
      : typeof timeoutFromRuntime === "number"
        ? timeoutFromRuntime
        : 60000;

  return {
    agentId: agent.id,
    operation,
    command,
    args,
    ...(asString(agent.runtimeConfig.cwd) ? { cwd: asString(agent.runtimeConfig.cwd) } : {}),
    timeoutMs,
    metadata: {
      role: agent.role,
      runtimeProfile: agent.runtimeProfile ?? null,
      heartbeatPolicy: agent.heartbeatPolicy ?? null,
      reason: options?.reason ?? "manual",
      ...(options?.metadata ?? {})
    }
  };
};

export class BullmqAgentRuntimeScheduler implements AgentRuntimeScheduler {
  private readonly connection: Redis;
  private readonly queue: Queue<AgentRuntimeJobData>;

  constructor(private readonly options: { redisUrl: string; queueName?: string }) {
    this.connection = new Redis(options.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue<AgentRuntimeJobData>(options.queueName ?? "agent-runtime-jobs", {
      connection: this.connection
    });
  }

  async enqueueHeartbeat(
    agent: AgentConfig,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference> {
    const data = toJobData("heartbeat", agent, options);
    return this.enqueue("agent.heartbeat", data);
  }

  async enqueueDiagnose(
    agent: AgentConfig,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference> {
    const data = toJobData("diagnose", agent, options);
    return this.enqueue("agent.diagnose", data);
  }

  async getJobSnapshot(jobId: string): Promise<AgentRuntimeJobSnapshot | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    const logs = await this.queue.getJobLogs(jobId, 0, 200, true);
    return {
      agentId: job.data.agentId,
      jobId,
      queueName: this.queue.name,
      operation: job.data.operation,
      state,
      progress: typeof job.progress === "number" ? job.progress : 0,
      attemptsMade: job.attemptsMade,
      ...(job.failedReason ? { failedReason: job.failedReason } : {}),
      logs: logs.logs
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }

  private async enqueue(
    name: string,
    data: AgentRuntimeJobData
  ): Promise<AgentRuntimeJobReference> {
    const createdAt = new Date().toISOString();
    const job = await this.queue.add(name, data, {
      attempts: 1,
      removeOnComplete: 200,
      removeOnFail: 200
    });
    return {
      agentId: data.agentId,
      jobId: String(job.id),
      queueName: this.queue.name,
      operation: data.operation,
      status: "queued",
      command: data.command,
      args: data.args,
      createdAt
    };
  }
}

export class InMemoryAgentRuntimeScheduler implements AgentRuntimeScheduler {
  private readonly jobs = new Map<string, AgentRuntimeJobSnapshot>();

  async enqueueHeartbeat(
    agent: AgentConfig,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference> {
    const data = toJobData("heartbeat", agent, options);
    return this.enqueue(data);
  }

  async enqueueDiagnose(
    agent: AgentConfig,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference> {
    const data = toJobData("diagnose", agent, options);
    return this.enqueue(data);
  }

  async getJobSnapshot(jobId: string): Promise<AgentRuntimeJobSnapshot | null> {
    return this.jobs.get(jobId) ?? null;
  }

  private async enqueue(data: AgentRuntimeJobData): Promise<AgentRuntimeJobReference> {
    const createdAt = new Date().toISOString();
    const jobId = randomUUID();
    this.jobs.set(jobId, {
      agentId: data.agentId,
      jobId,
      queueName: "agent-runtime-jobs",
      operation: data.operation,
      state: "queued",
      progress: 0,
      attemptsMade: 0,
      logs: [
        `[queued] ${data.command} ${data.args.join(" ")}`,
        `[info] metadata ${JSON.stringify(data.metadata)}`
      ]
    });

    return {
      agentId: data.agentId,
      jobId,
      queueName: "agent-runtime-jobs",
      operation: data.operation,
      status: "queued",
      command: data.command,
      args: data.args,
      createdAt
    };
  }
}

export class UnavailableAgentRuntimeScheduler implements AgentRuntimeScheduler {
  constructor(private readonly message = "Agent runtime scheduler requires REDIS_URL") {}

  async enqueueHeartbeat(): Promise<AgentRuntimeJobReference> {
    throw new AgentRuntimeSchedulerUnavailableError(this.message);
  }

  async enqueueDiagnose(): Promise<AgentRuntimeJobReference> {
    throw new AgentRuntimeSchedulerUnavailableError(this.message);
  }

  async getJobSnapshot(): Promise<AgentRuntimeJobSnapshot | null> {
    throw new AgentRuntimeSchedulerUnavailableError(this.message);
  }
}

export interface AgentServiceOptions {
  store: AgentConfigStore;
  runtimeScheduler: AgentRuntimeScheduler;
  now?: () => Date;
  idGenerator?: () => string;
}

export type AgentCreateInput = Omit<AgentConfig, "id" | "createdAt" | "updatedAt"> & { id?: string };

export class AgentService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(private readonly options: AgentServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  async listAgents(): Promise<AgentConfig[]> {
    return (await this.options.store.listAgents()).map((agent) => normalizeAgentRecord(agent));
  }

  async getAgent(agentId: string): Promise<AgentConfig | null> {
    const agent = await this.options.store.getAgent(agentId);
    return agent ? normalizeAgentRecord(agent) : null;
  }

  async createAgent(input: AgentCreateInput): Promise<AgentConfig> {
    const nowIso = this.now().toISOString();
    const runtimeConfig = asRecord(input.runtimeConfig) ?? {};
    const runtimeProfile = input.runtimeProfile
      ? normalizeAgentRuntimeProfile({
          adapterType: input.adapterType,
          runtimeConfig,
          runtimeProfile: input.runtimeProfile
        })
      : normalizeAgentRuntimeProfile({
          adapterType: input.adapterType,
          runtimeConfig
        });
    const heartbeatPolicy = normalizeHeartbeatPolicy(input.heartbeatPolicy);
    const next: AgentConfig = {
      id: input.id ?? this.idGenerator(),
      name: input.name,
      role: input.role,
      icon: input.icon,
      description: input.description,
      adapterType: input.adapterType,
      desiredSkills: [...input.desiredSkills],
      ...(input.reportTo ? { reportTo: input.reportTo } : {}),
      runtimeConfig,
      runtimeProfile,
      heartbeatPolicy,
      capabilities: [...input.capabilities],
      createdAt: nowIso,
      updatedAt: nowIso,
      status: input.status
    };
    return this.options.store.createAgent(next);
  }

  async updateAgent(agentId: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
    const existing = await this.getAgent(agentId);
    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const runtimeConfig = patch.runtimeConfig ? (asRecord(patch.runtimeConfig) ?? {}) : existing.runtimeConfig;
    const mergedRuntimeProfile = patch.runtimeProfile ?? existing.runtimeProfile;
    const runtimeProfile = mergedRuntimeProfile
      ? normalizeAgentRuntimeProfile({
          adapterType: patch.adapterType ?? existing.adapterType,
          runtimeConfig,
          runtimeProfile: mergedRuntimeProfile
        })
      : normalizeAgentRuntimeProfile({
          adapterType: patch.adapterType ?? existing.adapterType,
          runtimeConfig
        });
    const heartbeatPolicy = normalizeHeartbeatPolicy(patch.heartbeatPolicy ?? existing.heartbeatPolicy);

    return this.options.store.updateAgent(agentId, {
      ...existing,
      ...patch,
      runtimeConfig,
      runtimeProfile,
      heartbeatPolicy,
      updatedAt: this.now().toISOString()
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    const existing = await this.options.store.getAgent(agentId);
    if (!existing) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    await this.options.store.deleteAgent(agentId);
  }

  async runHeartbeat(
    agentId: string,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference> {
    const agent = await this.options.store.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return this.options.runtimeScheduler.enqueueHeartbeat(agent, options);
  }

  async diagnoseAgent(
    agentId: string,
    options?: AgentRuntimeInvocationOptions
  ): Promise<AgentRuntimeJobReference> {
    const agent = await this.options.store.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return this.options.runtimeScheduler.enqueueDiagnose(agent, options);
  }

  async getRuntimeJob(jobId: string): Promise<AgentRuntimeJobSnapshot | null> {
    return this.options.runtimeScheduler.getJobSnapshot(jobId);
  }
}
