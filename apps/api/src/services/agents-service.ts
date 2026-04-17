import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentService,
  UnavailableAgentRuntimeScheduler,
  BullmqAgentRuntimeScheduler,
  type AgentConfigStore
} from "@cp/agents";
import type { AgentConfig } from "@cp/domain";
import { apiStore } from "./api-store.js";

class ApiAgentStoreAdapter implements AgentConfigStore {
  async listAgents(): Promise<AgentConfig[]> {
    return apiStore.listAgents();
  }

  async getAgent(agentId: string): Promise<AgentConfig | null> {
    return apiStore.getAgent(agentId);
  }

  async createAgent(agent: AgentConfig): Promise<AgentConfig> {
    return apiStore.createAgent(agent);
  }

  async updateAgent(agentId: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
    return apiStore.updateAgent(agentId, patch);
  }

  async deleteAgent(agentId: string): Promise<void> {
    await apiStore.deleteAgent(agentId);
  }
}

const createRuntimeScheduler = () => {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return new UnavailableAgentRuntimeScheduler();
  }
  return new BullmqAgentRuntimeScheduler({ redisUrl, queueName: "agent-runtime-jobs" });
};

const resolveWorkflowsDir = (): string => {
  const fromCwd = path.resolve(process.cwd(), "configs/workflows");
  try {
    if (readdirSync(fromCwd).some((file) => file.endsWith(".json"))) {
      return fromCwd;
    }
  } catch {
    // Fallback below.
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../../../configs/workflows");
};

export interface WorkflowRuntimeDefinition {
  id: string;
  version?: string;
  maxRetries: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
  escalationRule: string;
  raw: Record<string, unknown>;
}

export const listWorkflowRuntimeDefinitions = (): WorkflowRuntimeDefinition[] => {
  const workflowsDir = resolveWorkflowsDir();
  const files = readdirSync(workflowsDir).filter((file) => file.endsWith(".json"));
  return files.map((file) => {
    const filePath = path.join(workflowsDir, file);
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : file.replace(/\.json$/i, "");
    const runtime = (raw.runtime ?? {}) as Record<string, unknown>;
    const budget = (runtime.budget ?? {}) as Record<string, unknown>;
    return {
      id,
      ...(typeof raw.version === "string" ? { version: raw.version } : {}),
      maxRetries: typeof runtime.maxRetries === "number" ? runtime.maxRetries : 2,
      maxInputTokens: typeof budget.maxInputTokens === "number" ? budget.maxInputTokens : 32000,
      maxOutputTokens: typeof budget.maxOutputTokens === "number" ? budget.maxOutputTokens : 8000,
      maxCostUsd: typeof budget.maxCostUsd === "number" ? budget.maxCostUsd : 5,
      escalationRule:
        typeof runtime.escalationRule === "string" ? runtime.escalationRule : "on_failure_repeat",
      raw
    };
  });
};

export const agentsService = new AgentService({
  store: new ApiAgentStoreAdapter(),
  runtimeScheduler: createRuntimeScheduler()
});
