import type { ProviderHealthcheck } from "@cp/domain";
import { apiStore } from "./api-store.js";

export class HealthService {
  async health() {
    return {
      ok: true as const,
      service: "api",
      status: "healthy" as const,
      timestamp: new Date().toISOString(),
      providerHealthchecks: await apiStore.listProviderHealthchecks()
    };
  }

  async providerHealthchecks(): Promise<ProviderHealthcheck[]> {
    return apiStore.listProviderHealthchecks();
  }
}

export const healthService = new HealthService();
