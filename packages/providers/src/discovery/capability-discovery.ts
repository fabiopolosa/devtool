import type { CapabilityClass, ProviderModelDescriptor } from "@cp/domain";
import type { ProviderRegistry } from "../registry/provider-registry.js";
import type { ModelRegistry, RegisteredModel } from "../models/model-registry.js";

export class CapabilityDiscoveryService {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly modelRegistry: ModelRegistry
  ) {}

  async refresh(): Promise<ProviderModelDescriptor[]> {
    const discovered = await this.providerRegistry.discoverAllModels();
    const registered: RegisteredModel[] = discovered.map(model => ({
      ...model,
      enabled: true
    }));
    this.modelRegistry.upsertMany(registered);
    return discovered;
  }

  listCapabilities(): CapabilityClass[] {
    return [...new Set(this.modelRegistry.listAll().map(model => model.capabilityClass))];
  }
}
