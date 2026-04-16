import { randomUUID } from "node:crypto";
import type { AgentConfig } from "@cp/domain";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export interface AgentRuntimeInvocationOptions {
  reason?: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
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

export interface AgentRuntimeJobData {
  agentId: string;
  operation: "heartbeat" | "diagnose";
  command: string;
  args: string[];
  cwd?: string | undefined;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

const resolveCliCommand = (agent: AgentConfig): string => {
  const runtimeCommand = agent.runtimeConfig.commandPrefix;
  if (typeof runtimeCommand === "string" && runtimeCommand.trim().length > 0) {
    return runtimeCommand.trim();
  }
  return "devtools-agent";
};

const resolveCliCwd = (agent: AgentConfig): string | undefined => {
  const runtimeCwd = agent.runtimeConfig.cwd;
  if (typeof runtimeCwd === "string" && runtimeCwd.trim().length > 0) {
    return runtimeCwd.trim();
  }
  return undefined;
};

const toJobData = (
  operation: "heartbeat" | "diagnose",
  agent: AgentConfig,
  options?: AgentRuntimeInvocationOptions
): AgentRuntimeJobData => {
  const command = resolveCliCommand(agent);
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
    ...(resolveCliCwd(agent) ? { cwd: resolveCliCwd(agent) } : {}),
    timeoutMs,
    metadata: {
      role: agent.role,
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
    return this.options.store.listAgents();
  }

  async getAgent(agentId: string): Promise<AgentConfig | null> {
    return this.options.store.getAgent(agentId);
  }

  async createAgent(input: AgentCreateInput): Promise<AgentConfig> {
    const nowIso = this.now().toISOString();
    const next: AgentConfig = {
      id: input.id ?? this.idGenerator(),
      name: input.name,
      role: input.role,
      icon: input.icon,
      description: input.description,
      adapterType: input.adapterType,
      desiredSkills: [...input.desiredSkills],
      ...(input.reportTo ? { reportTo: input.reportTo } : {}),
      runtimeConfig: { ...input.runtimeConfig },
      capabilities: [...input.capabilities],
      createdAt: nowIso,
      updatedAt: nowIso,
      status: input.status
    };
    return this.options.store.createAgent(next);
  }

  async updateAgent(agentId: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
    return this.options.store.updateAgent(agentId, {
      ...patch,
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
