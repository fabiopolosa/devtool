import { randomUUID } from "node:crypto";
import type { Environment, Machine, MachineStatus } from "@cp/domain";

export interface EnvironmentStore {
  listEnvironments(): Promise<Environment[]>;
  getEnvironmentById(environmentId: string): Promise<Environment | null>;
  createEnvironment(environment: Environment): Promise<Environment>;
  updateEnvironment(environmentId: string, patch: Partial<Environment>): Promise<Environment>;
  deleteEnvironment(environmentId: string): Promise<void>;
  listMachines(filters?: { environmentId?: string }): Promise<Machine[]>;
  getMachineById(machineId: string): Promise<Machine | null>;
  createMachine(machine: Machine): Promise<Machine>;
  updateMachine(machineId: string, patch: Partial<Machine>): Promise<Machine>;
  deleteMachine(machineId: string): Promise<void>;
}

export interface EnvironmentCreateInput {
  name: string;
  description: string;
  type: Environment["type"];
  region?: string;
  baseUrl?: string;
  notes?: string[];
  status?: Environment["status"];
}

export interface MachineCreateInput {
  environmentId: string;
  name: string;
  host: string;
  cpuCores: number;
  gpuCount: number;
  ramGb: number;
  services?: string[];
  agents?: string[];
  metadata?: Record<string, unknown>;
  status?: Machine["status"];
}

export interface EnvironmentServiceOptions {
  store: EnvironmentStore;
  now?: () => Date;
  idGenerator?: () => string;
  fetchImpl?: typeof fetch;
}

export interface MachineHealthcheckResult {
  machine: Machine;
  status: MachineStatus;
  latencyMs: number;
  details: string;
}

export class EnvironmentsService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: EnvironmentServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listEnvironments(): Promise<Environment[]> {
    return this.options.store.listEnvironments();
  }

  async getEnvironment(environmentId: string): Promise<Environment | null> {
    return this.options.store.getEnvironmentById(environmentId);
  }

  async createEnvironment(input: EnvironmentCreateInput, actor: string): Promise<Environment> {
    const nowIso = this.now().toISOString();
    return this.options.store.createEnvironment({
      id: this.idGenerator(),
      name: input.name.trim(),
      description: input.description.trim(),
      type: input.type,
      ...(input.region ? { region: input.region.trim() } : {}),
      ...(input.baseUrl ? { baseUrl: input.baseUrl.trim() } : {}),
      status: input.status ?? "active",
      notes: input.notes ?? [],
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }

  async updateEnvironment(
    environmentId: string,
    patch: Partial<EnvironmentCreateInput>,
    actor: string
  ): Promise<Environment> {
    return this.options.store.updateEnvironment(environmentId, {
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.description ? { description: patch.description.trim() } : {}),
      ...(patch.type ? { type: patch.type } : {}),
      ...(patch.region ? { region: patch.region.trim() } : {}),
      ...(patch.baseUrl ? { baseUrl: patch.baseUrl.trim() } : {}),
      ...(patch.notes ? { notes: patch.notes } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      updatedAt: this.now().toISOString(),
      updatedBy: actor
    });
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    await this.options.store.deleteEnvironment(environmentId);
  }

  async listMachines(environmentId?: string): Promise<Machine[]> {
    return this.options.store.listMachines(environmentId ? { environmentId } : undefined);
  }

  async getMachine(machineId: string): Promise<Machine | null> {
    return this.options.store.getMachineById(machineId);
  }

  async createMachine(input: MachineCreateInput, actor: string): Promise<Machine> {
    const nowIso = this.now().toISOString();
    return this.options.store.createMachine({
      id: this.idGenerator(),
      environmentId: input.environmentId,
      name: input.name.trim(),
      host: input.host.trim(),
      status: input.status ?? "online",
      cpuCores: input.cpuCores,
      gpuCount: input.gpuCount,
      ramGb: input.ramGb,
      services: input.services ?? [],
      agents: input.agents ?? [],
      metadata: input.metadata ?? {},
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    });
  }

  async updateMachine(machineId: string, patch: Partial<MachineCreateInput>, actor: string): Promise<Machine> {
    return this.options.store.updateMachine(machineId, {
      ...(patch.environmentId ? { environmentId: patch.environmentId } : {}),
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.host ? { host: patch.host.trim() } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.cpuCores !== undefined ? { cpuCores: patch.cpuCores } : {}),
      ...(patch.gpuCount !== undefined ? { gpuCount: patch.gpuCount } : {}),
      ...(patch.ramGb !== undefined ? { ramGb: patch.ramGb } : {}),
      ...(patch.services ? { services: patch.services } : {}),
      ...(patch.agents ? { agents: patch.agents } : {}),
      ...(patch.metadata ? { metadata: patch.metadata } : {}),
      updatedAt: this.now().toISOString(),
      updatedBy: actor
    });
  }

  async deleteMachine(machineId: string): Promise<void> {
    await this.options.store.deleteMachine(machineId);
  }

  async runMachineHealthcheck(machineId: string): Promise<MachineHealthcheckResult> {
    const machine = await this.options.store.getMachineById(machineId);
    if (!machine) {
      throw new Error(`Machine not found: ${machineId}`);
    }
    const started = Date.now();
    let status: MachineStatus = "online";
    let details = "healthcheck ok";
    try {
      const endpoint = machine.host.startsWith("http://") || machine.host.startsWith("https://")
        ? `${machine.host.replace(/\/$/, "")}/health`
        : null;
      if (endpoint) {
        const response = await this.fetchImpl(endpoint);
        if (!response.ok) {
          status = "degraded";
          details = `health endpoint returned ${response.status}`;
        }
      }
    } catch (error) {
      status = "offline";
      details = error instanceof Error ? error.message : "healthcheck failed";
    }

    const latencyMs = Date.now() - started;
    const nowIso = this.now().toISOString();
    const updated = await this.options.store.updateMachine(machine.id, {
      status,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso
    });

    return {
      machine: updated,
      status,
      latencyMs,
      details
    };
  }
}
