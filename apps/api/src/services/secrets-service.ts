import type { SecretConfig } from "@cp/domain";
import { SecretsService, type SecretStore } from "@cp/secrets";
import { apiStore } from "./api-store.js";

class ApiSecretStoreAdapter implements SecretStore {
  async listSecrets(filters?: { scope?: SecretConfig["scope"] }): Promise<SecretConfig[]> {
    return apiStore.listSecrets(filters?.scope);
  }

  async getSecretById(secretId: string): Promise<SecretConfig | null> {
    return apiStore.getSecret(secretId);
  }

  async getSecretByName(name: string, scope?: SecretConfig["scope"]): Promise<SecretConfig | null> {
    return apiStore.findSecretByName(name, scope);
  }

  async createSecret(secret: SecretConfig): Promise<SecretConfig> {
    return apiStore.createSecret(secret);
  }

  async updateSecret(secretId: string, patch: Partial<SecretConfig>): Promise<SecretConfig> {
    return apiStore.updateSecret(secretId, patch);
  }

  async deleteSecret(secretId: string): Promise<void> {
    await apiStore.deleteSecret(secretId);
  }
}

export const secretsService = new SecretsService({
  store: new ApiSecretStoreAdapter(),
  masterKey: process.env.SECRETS_MASTER_KEY?.trim() || "devtool-local-master-key"
});
