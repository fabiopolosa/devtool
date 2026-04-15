import type { AnyCapabilityProvider, CapabilityClass, ProviderName } from "@cp/domain";
import type { ProviderHealthStatus, ProviderModelDescriptor } from "@cp/domain";

export class ProviderRegistry {
  private readonly providers = new Map<string, AnyCapabilityProvider>();

  register(provider: AnyCapabilityProvider): void {
    this.providers.set(this.key(provider.provider, provider.capabilityClass), provider);
  }

  registerMany(providers: AnyCapabilityProvider[]): void {
    for (const provider of providers) this.register(provider);
  }

  get(provider: ProviderName, capabilityClass: CapabilityClass): AnyCapabilityProvider | undefined {
    return this.providers.get(this.key(provider, capabilityClass));
  }

  list(): AnyCapabilityProvider[] {
    return [...this.providers.values()];
  }

  async discoverAllModels(): Promise<ProviderModelDescriptor[]> {
    const models: ProviderModelDescriptor[] = [];
    for (const provider of this.providers.values()) {
      try {
        models.push(...(await provider.discoverModels()));
      } catch (error) {
        console.warn("Provider model discovery failed", {
          provider: provider.provider,
          capabilityClass: provider.capabilityClass,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return models;
  }

  async healthcheckAll(): Promise<Array<{ provider: ProviderName; capabilityClass: CapabilityClass; status: ProviderHealthStatus }>> {
    const results: Array<{ provider: ProviderName; capabilityClass: CapabilityClass; status: ProviderHealthStatus }> = [];
    for (const provider of this.providers.values()) {
      results.push({
        provider: provider.provider,
        capabilityClass: provider.capabilityClass,
        status: await provider.healthcheck()
      });
    }
    return results;
  }

  private key(provider: ProviderName, capabilityClass: CapabilityClass): string {
    return `${provider}:${capabilityClass}`;
  }
}
