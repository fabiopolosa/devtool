import type { McpConnection, McpDelegationRun, SecretScope } from "@cp/domain";
import { McpService, type McpStore } from "@cp/mcp";
import { apiStore } from "./api-store.js";
import { secretsService } from "./secrets-service.js";

const boolFlag = (value: string | undefined, fallback = false): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

class ApiMcpStoreAdapter implements McpStore {
  async listConnections() {
    return apiStore.listMcpConnections();
  }

  async getConnection(connectionId: string) {
    return apiStore.getMcpConnection(connectionId);
  }

  async createConnection(connection: McpConnection) {
    return apiStore.createMcpConnection(connection);
  }

  async updateConnection(connectionId: string, patch: Partial<McpConnection>) {
    return apiStore.updateMcpConnection(connectionId, patch);
  }

  async listDelegationRuns(filters?: { connectionId?: string }) {
    return apiStore.listMcpDelegationRuns(filters);
  }

  async createDelegationRun(run: McpDelegationRun) {
    return apiStore.createMcpDelegationRun(run);
  }

  async updateDelegationRun(runId: string, patch: Partial<McpDelegationRun>) {
    return apiStore.updateMcpDelegationRun(runId, patch);
  }
}

const parseSecretRef = (
  ref: string
): { scope?: SecretScope; name: string } => {
  const path = ref.replace(/^secret:\/\//i, "").trim();
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const first = segments[0];
    const rest = segments.slice(1);
    if (!first) {
      return { name: path };
    }
    const maybeScope = first as SecretScope;
    if (["global", "project", "repository", "provider", "environment"].includes(maybeScope)) {
      return { scope: maybeScope, name: rest.join("/") };
    }
    return { scope: "provider", name: rest.join("/") || first };
  }
  return { name: segments[0] ?? path };
};

const resolveMcpSecret = async (secretRef: string): Promise<string | undefined> => {
  if (!secretRef) return undefined;
  if (secretRef.startsWith("env://")) {
    const envKey = secretRef.replace("env://", "").trim();
    return envKey ? process.env[envKey] : undefined;
  }
  if (secretRef.startsWith("secret://")) {
    const parsed = parseSecretRef(secretRef);
    try {
      return await secretsService.resolveSecretValueByName(parsed.name, parsed.scope);
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const mcpService = new McpService({
  store: new ApiMcpStoreAdapter(),
  enabled: boolFlag(process.env.MCP_ENABLED, false),
  resolveSecretValue: resolveMcpSecret
});
