import type { AgentRuntimeHost } from "./contracts.js";

export type ExecutionMode = "local" | "remote";

export type WorkerHeartbeatStatus = "online" | "degraded" | "offline" | "maintenance";

export interface WorkerRegistrationInput {
  name: string;
  host: string;
  mode?: ExecutionMode;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkerHeartbeatInput {
  machineId: string;
  status?: WorkerHeartbeatStatus;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkerRegistrationPayload {
  name: string;
  host: string;
  mode: ExecutionMode;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

export interface WorkerHeartbeatPayload {
  status: WorkerHeartbeatStatus;
  capabilities: string[];
  metadata: Record<string, unknown>;
}

export interface WorkerRegistrationResponse {
  item?: {
    id?: string;
    host?: string;
    name?: string;
  };
}

export interface WorkerRegistrationClientOptions {
  apiBaseUrl: string;
  tenantId?: string;
  authToken?: string;
  fetchFn?: typeof fetch;
}

const normalizeStrings = (values: string[] | undefined): string[] =>
  (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);

export const buildWorkerRegistrationPayload = (
  input: WorkerRegistrationInput,
  metadata: Record<string, unknown> = {}
): WorkerRegistrationPayload => ({
  name: input.name.trim(),
  host: input.host.trim(),
  mode: input.mode ?? "local",
  capabilities: normalizeStrings(input.capabilities),
  metadata: {
    executionType: "desktop_host",
    ...metadata,
    ...(input.metadata ?? {})
  }
});

export const buildWorkerHeartbeatPayload = (
  input: WorkerHeartbeatInput,
  metadata: Record<string, unknown> = {}
): WorkerHeartbeatPayload => ({
  status: input.status ?? "online",
  capabilities: normalizeStrings(input.capabilities),
  metadata: {
    executionType: "desktop_host",
    ...metadata,
    ...(input.metadata ?? {})
  }
});

export class WorkerRegistrationClient {
  constructor(private readonly options: WorkerRegistrationClientOptions) {}

  async registerWorker(
    input: WorkerRegistrationInput,
    metadata: Record<string, unknown> = {}
  ): Promise<{ id: string | null; payload: WorkerRegistrationPayload }> {
    const payload = buildWorkerRegistrationPayload(input, metadata);
    const response = await this.fetchJson<WorkerRegistrationResponse>("/execution/workers/register", payload);
    return {
      id: response.item?.id ?? null,
      payload
    };
  }

  async heartbeatWorker(
    machineId: string,
    input: WorkerHeartbeatInput,
    metadata: Record<string, unknown> = {}
  ): Promise<{ payload: WorkerHeartbeatPayload }> {
    const payload = buildWorkerHeartbeatPayload(input, metadata);
    await this.fetchJson(`/execution/workers/${machineId}/heartbeat`, payload);
    return { payload };
  }

  private async fetchJson<T>(path: string, body: object): Promise<T> {
    const fetchImpl = this.options.fetchFn ?? fetch;
    const response = await fetchImpl(`${this.options.apiBaseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.options.tenantId ? { "x-tenant-id": this.options.tenantId } : {}),
        ...(this.options.authToken ? { authorization: `Bearer ${this.options.authToken}` } : {})
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message.trim() || `Request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }
}

export const buildWorkerHostMetadata = (input: {
  platform: NodeJS.Platform;
  arch: string;
  release: string;
  nodeVersion: string;
  runtimeHost?: AgentRuntimeHost;
}): Record<string, unknown> => ({
  executionType: "desktop_host",
  platform: input.platform,
  arch: input.arch,
  release: input.release,
  nodeVersion: input.nodeVersion,
  ...(input.runtimeHost ? { runtimeHost: input.runtimeHost } : {})
});
