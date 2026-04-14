import type { Environment, Machine } from "@cp/domain";
import { describe, expect, it } from "vitest";
import { EnvironmentsService, type EnvironmentStore } from "./service.js";

class InMemoryEnvironmentStore implements EnvironmentStore {
  private readonly environments = new Map<string, Environment>();
  private readonly machines = new Map<string, Machine>();

  async listEnvironments(): Promise<Environment[]> {
    return [...this.environments.values()];
  }
  async getEnvironmentById(environmentId: string): Promise<Environment | null> {
    return this.environments.get(environmentId) ?? null;
  }
  async createEnvironment(environment: Environment): Promise<Environment> {
    this.environments.set(environment.id, environment);
    return environment;
  }
  async updateEnvironment(environmentId: string, patch: Partial<Environment>): Promise<Environment> {
    const existing = this.environments.get(environmentId);
    if (!existing) throw new Error("missing");
    const next = { ...existing, ...patch };
    this.environments.set(environmentId, next);
    return next;
  }
  async deleteEnvironment(environmentId: string): Promise<void> {
    this.environments.delete(environmentId);
  }
  async listMachines(filters?: { environmentId?: string }): Promise<Machine[]> {
    const all = [...this.machines.values()];
    if (!filters?.environmentId) return all;
    return all.filter((machine) => machine.environmentId === filters.environmentId);
  }
  async getMachineById(machineId: string): Promise<Machine | null> {
    return this.machines.get(machineId) ?? null;
  }
  async createMachine(machine: Machine): Promise<Machine> {
    this.machines.set(machine.id, machine);
    return machine;
  }
  async updateMachine(machineId: string, patch: Partial<Machine>): Promise<Machine> {
    const existing = this.machines.get(machineId);
    if (!existing) throw new Error("missing");
    const next = { ...existing, ...patch };
    this.machines.set(machineId, next);
    return next;
  }
  async deleteMachine(machineId: string): Promise<void> {
    this.machines.delete(machineId);
  }
}

describe("EnvironmentsService", () => {
  it("creates env/machine and performs healthcheck", async () => {
    const service = new EnvironmentsService({
      store: new InMemoryEnvironmentStore(),
      now: () => new Date("2026-04-14T00:00:00.000Z"),
      idGenerator: () => "id-1",
      fetchImpl: (async () => ({ ok: true, status: 200 } as Response)) as typeof fetch
    });

    const environment = await service.createEnvironment(
      {
        name: "Local",
        description: "Local dev env",
        type: "development"
      },
      "tester"
    );
    expect(environment.id).toBe("id-1");

    const machine = await service.createMachine(
      {
        environmentId: environment.id,
        name: "MacBook",
        host: "http://localhost:3000",
        cpuCores: 10,
        gpuCount: 1,
        ramGb: 32
      },
      "tester"
    );
    expect(machine.environmentId).toBe(environment.id);

    const check = await service.runMachineHealthcheck(machine.id);
    expect(check.status).toBe("online");
  });
});
