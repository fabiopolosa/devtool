export type ProviderDiscoveryStatus = "success" | "fallback" | "failed";

export interface ProviderDiscoveryLog {
  id: string;
  source: "startup" | "manual";
  queries: string[];
  discoveredProviders: string[];
  discoveredModels: string[];
  status: ProviderDiscoveryStatus;
  searchStartedAt: string;
  searchFinishedAt: string;
  notes?: string;
  rawResults?: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
