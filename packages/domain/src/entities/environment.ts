export type EnvironmentStatus = "active" | "degraded" | "down" | "maintenance";
export type MachineStatus = "online" | "degraded" | "offline" | "maintenance";

export interface Environment {
  id: string;
  name: string;
  description: string;
  type: "local" | "development" | "staging" | "production";
  region?: string;
  baseUrl?: string;
  status: EnvironmentStatus;
  notes: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Machine {
  id: string;
  environmentId: string;
  name: string;
  host: string;
  status: MachineStatus;
  cpuCores: number;
  gpuCount: number;
  ramGb: number;
  services: string[];
  agents: string[];
  lastHeartbeatAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
