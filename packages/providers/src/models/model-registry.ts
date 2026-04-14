import type { CapabilityClass, ID, ProviderName } from "@cp/domain";
import type { ProviderModelDescriptor } from "@cp/domain";

export interface RegisteredModel extends ProviderModelDescriptor {
  providerConfigId?: ID;
  enabled: boolean;
  healthStatus?: "healthy" | "degraded" | "down" | "unknown";
  healthCheckedAt?: string;
}

export class ModelRegistry {
  private readonly models = new Map<string, RegisteredModel>();

  upsert(model: RegisteredModel): void {
    this.models.set(this.key(model.provider, model.capabilityClass, model.modelId), model);
  }

  upsertMany(models: RegisteredModel[]): void {
    for (const model of models) this.upsert(model);
  }

  get(provider: ProviderName, capabilityClass: CapabilityClass, modelId: string): RegisteredModel | undefined {
    return this.models.get(this.key(provider, capabilityClass, modelId));
  }

  listByCapability(capabilityClass: CapabilityClass): RegisteredModel[] {
    return [...this.models.values()].filter(model => model.capabilityClass === capabilityClass && model.enabled);
  }

  listAll(): RegisteredModel[] {
    return [...this.models.values()];
  }

  private key(provider: ProviderName, capabilityClass: CapabilityClass, modelId: string): string {
    return `${provider}:${capabilityClass}:${modelId}`;
  }
}
