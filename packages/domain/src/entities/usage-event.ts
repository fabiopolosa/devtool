import type { AuditMetadata } from "../entities.js";

export interface UsageEvent extends AuditMetadata {
  id: string;
  tenantId: string;
  projectId?: string;
  jobId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  metadata: Record<string, unknown>;
}
