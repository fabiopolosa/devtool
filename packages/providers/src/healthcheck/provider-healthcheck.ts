import type { CapabilityClass, ProviderName } from "@cp/domain";
import type { ProviderHealthStatus } from "@cp/domain";
import type { ProviderRegistry } from "../registry/provider-registry.js";
import type { ModelRegistry, RegisteredModel } from "../models/model-registry.js";

export interface ProviderHealthSnapshot {
  provider: ProviderName;
  capabilityClass: CapabilityClass;
  modelId?: string;
  status: ProviderHealthStatus;
}

export class ProviderHealthcheckService {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly modelRegistry: ModelRegistry
  ) {}

  async run(): Promise<ProviderHealthSnapshot[]> {
    const providerStatuses = await this.providerRegistry.healthcheckAll();
    const snapshots: ProviderHealthSnapshot[] = [];

    for (const item of providerStatuses) {
      const models = this.modelRegistry.listByCapability(item.capabilityClass).filter(model => model.provider === item.provider);
      if (models.length === 0) {
        snapshots.push({ provider: item.provider, capabilityClass: item.capabilityClass, status: item.status });
        continue;
      }

      for (const model of models) {
        snapshots.push({
          provider: item.provider,
          capabilityClass: item.capabilityClass,
          modelId: model.modelId,
          status: this.decorateWithModel(item.status, model)
        });
      }
    }

    return snapshots;
  }

  private decorateWithModel(status: ProviderHealthStatus, model: RegisteredModel): ProviderHealthStatus {
    if (model.healthStatus === "down") {
      return { ...status, status: "down", message: status.message ?? "Model marked down in registry" };
    }
    if (model.healthStatus === "degraded" && status.status === "healthy") {
      return { ...status, status: "degraded", message: status.message ?? "Model registry marks this model degraded" };
    }
    return status;
  }
}
