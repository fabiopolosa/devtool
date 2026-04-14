export type McpConnectionStatus = "unknown" | "healthy" | "degraded" | "down" | "disabled";

export interface McpConnection {
  id: string;
  name: string;
  baseUrl: string;
  authSecretRef?: string;
  enabled: boolean;
  status: McpConnectionStatus;
  capabilities: string[];
  metadata: Record<string, unknown>;
  lastCheckedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface McpDelegationRun {
  id: string;
  connectionId: string;
  operation: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "completed" | "failed";
  response?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
