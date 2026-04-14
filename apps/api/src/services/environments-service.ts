import type { Environment, Machine } from "@cp/domain";
import { EnvironmentsService, type EnvironmentStore } from "@cp/environments";
import { apiStore } from "./api-store.js";

class ApiEnvironmentStoreAdapter implements EnvironmentStore {
  async listEnvironments(): Promise<Environment[]> {
    return apiStore.listEnvironments();
  }

  async getEnvironmentById(environmentId: string): Promise<Environment | null> {
    return apiStore.getEnvironment(environmentId);
  }

  async createEnvironment(environment: Environment): Promise<Environment> {
    return apiStore.createEnvironment(environment);
  }

  async updateEnvironment(environmentId: string, patch: Partial<Environment>): Promise<Environment> {
    return apiStore.updateEnvironment(environmentId, patch);
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    await apiStore.deleteEnvironment(environmentId);
  }

  async listMachines(filters?: { environmentId?: string }): Promise<Machine[]> {
    return apiStore.listMachines(filters?.environmentId);
  }

  async getMachineById(machineId: string): Promise<Machine | null> {
    return apiStore.getMachine(machineId);
  }

  async createMachine(machine: Machine): Promise<Machine> {
    return apiStore.createMachine(machine);
  }

  async updateMachine(machineId: string, patch: Partial<Machine>): Promise<Machine> {
    return apiStore.updateMachine(machineId, patch);
  }

  async deleteMachine(machineId: string): Promise<void> {
    await apiStore.deleteMachine(machineId);
  }
}

export const environmentsService = new EnvironmentsService({
  store: new ApiEnvironmentStoreAdapter()
});
