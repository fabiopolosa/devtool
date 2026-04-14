import { randomUUID } from "node:crypto";
import type { McpConnection, McpDelegationRun } from "@cp/domain";

export interface McpStore {
  listConnections(): Promise<McpConnection[]>;
  getConnection(connectionId: string): Promise<McpConnection | null>;
  createConnection(connection: McpConnection): Promise<McpConnection>;
  updateConnection(connectionId: string, patch: Partial<McpConnection>): Promise<McpConnection>;
  listDelegationRuns(filters?: { connectionId?: string }): Promise<McpDelegationRun[]>;
  createDelegationRun(run: McpDelegationRun): Promise<McpDelegationRun>;
  updateDelegationRun(runId: string, patch: Partial<McpDelegationRun>): Promise<McpDelegationRun>;
}

export interface McpServiceOptions {
  store: McpStore;
  enabled?: boolean;
  resolveSecretValue?: (secretRef: string) => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  idGenerator?: () => string;
}

export interface McpDelegationInput {
  connectionId: string;
  operation: string;
  payload: Record<string, unknown>;
  actor: string;
}

const toAuthHeader = (token: string): string => {
  if (token.toLowerCase().startsWith("bearer ")) return token;
  return `Bearer ${token}`;
};

export class McpService {
  private readonly enabled: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(private readonly options: McpServiceOptions) {
    this.enabled = options.enabled ?? false;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async listConnections(): Promise<McpConnection[]> {
    return this.options.store.listConnections();
  }

  async listDelegationRuns(filters?: { connectionId?: string }): Promise<McpDelegationRun[]> {
    return this.options.store.listDelegationRuns(filters);
  }

  async upsertConnection(input: Omit<McpConnection, "createdAt" | "updatedAt">, actor: string): Promise<McpConnection> {
    const nowIso = this.now().toISOString();
    const existing = await this.options.store.getConnection(input.id);
    if (!existing) {
      return this.options.store.createConnection({
        ...input,
        createdAt: nowIso,
        createdBy: actor,
        updatedAt: nowIso,
        updatedBy: actor
      });
    }
    return this.options.store.updateConnection(input.id, {
      ...input,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }

  async runHealthcheck(connectionId: string, actor: string): Promise<McpConnection> {
    const connection = await this.options.store.getConnection(connectionId);
    if (!connection) {
      throw new Error(`MCP connection not found: ${connectionId}`);
    }

    const nowIso = this.now().toISOString();
    if (!this.enabled || !connection.enabled) {
      return this.options.store.updateConnection(connection.id, {
        status: this.enabled ? "disabled" : "disabled",
        lastCheckedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actor
      });
    }

    try {
      const headers: Record<string, string> = {};
      if (connection.authSecretRef && this.options.resolveSecretValue) {
        const token = await this.options.resolveSecretValue(connection.authSecretRef);
        if (token) headers.Authorization = toAuthHeader(token);
      }
      const response = await this.fetchImpl(`${connection.baseUrl.replace(/\/$/, "")}/health`, {
        method: "GET",
        headers
      });
      const nextStatus: McpConnection["status"] = response.ok ? "healthy" : response.status >= 500 ? "down" : "degraded";
      return this.options.store.updateConnection(connection.id, {
        status: nextStatus,
        lastCheckedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actor
      });
    } catch {
      return this.options.store.updateConnection(connection.id, {
        status: "down",
        lastCheckedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actor
      });
    }
  }

  async delegate(input: McpDelegationInput): Promise<McpDelegationRun> {
    const connection = await this.options.store.getConnection(input.connectionId);
    if (!connection) {
      throw new Error(`MCP connection not found: ${input.connectionId}`);
    }

    const nowIso = this.now().toISOString();
    const queued = await this.options.store.createDelegationRun({
      id: this.idGenerator(),
      connectionId: connection.id,
      operation: input.operation,
      payload: { ...input.payload },
      status: "queued",
      createdAt: nowIso,
      createdBy: input.actor,
      updatedAt: nowIso,
      updatedBy: input.actor
    });

    if (!this.enabled || !connection.enabled) {
      return this.options.store.updateDelegationRun(queued.id, {
        status: "failed",
        error: "MCP integration disabled or connection disabled",
        startedAt: nowIso,
        endedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: input.actor
      });
    }

    const startedAt = this.now().toISOString();
    await this.options.store.updateDelegationRun(queued.id, {
      status: "running",
      startedAt,
      updatedAt: startedAt,
      updatedBy: input.actor
    });

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (connection.authSecretRef && this.options.resolveSecretValue) {
        const token = await this.options.resolveSecretValue(connection.authSecretRef);
        if (token) headers.Authorization = toAuthHeader(token);
      }

      const response = await this.fetchImpl(`${connection.baseUrl.replace(/\/$/, "")}/delegate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          operation: input.operation,
          payload: input.payload
        })
      });

      const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const finishedAt = this.now().toISOString();

      if (!response.ok) {
        return this.options.store.updateDelegationRun(queued.id, {
          status: "failed",
          error: `Delegate request failed (HTTP ${response.status})`,
          response: responseBody,
          endedAt: finishedAt,
          updatedAt: finishedAt,
          updatedBy: input.actor
        });
      }

      return this.options.store.updateDelegationRun(queued.id, {
        status: "completed",
        response: responseBody,
        endedAt: finishedAt,
        updatedAt: finishedAt,
        updatedBy: input.actor
      });
    } catch (error) {
      const finishedAt = this.now().toISOString();
      return this.options.store.updateDelegationRun(queued.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "MCP delegation failed",
        endedAt: finishedAt,
        updatedAt: finishedAt,
        updatedBy: input.actor
      });
    }
  }
}
