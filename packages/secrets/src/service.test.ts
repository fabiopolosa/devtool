import type { SecretConfig } from "@cp/domain";
import { describe, expect, it } from "vitest";
import { SecretsService, type SecretStore } from "./service.js";

const fixedNow = "2026-04-14T00:00:00.000Z";

class InMemorySecretStore implements SecretStore {
  private readonly map = new Map<string, SecretConfig>();

  async listSecrets(filters?: { scope?: SecretConfig["scope"] }): Promise<SecretConfig[]> {
    const all = [...this.map.values()];
    if (!filters?.scope) return all;
    return all.filter((item) => item.scope === filters.scope);
  }

  async getSecretById(secretId: string): Promise<SecretConfig | null> {
    return this.map.get(secretId) ?? null;
  }

  async getSecretByName(name: string, scope?: SecretConfig["scope"]): Promise<SecretConfig | null> {
    return (
      [...this.map.values()].find(
        (item) => item.name === name && (scope ? item.scope === scope : true)
      ) ?? null
    );
  }

  async createSecret(secret: SecretConfig): Promise<SecretConfig> {
    this.map.set(secret.id, secret);
    return secret;
  }

  async updateSecret(secretId: string, patch: Partial<SecretConfig>): Promise<SecretConfig> {
    const existing = this.map.get(secretId);
    if (!existing) {
      throw new Error("missing");
    }
    const next = { ...existing, ...patch };
    this.map.set(secretId, next);
    return next;
  }

  async deleteSecret(secretId: string): Promise<void> {
    this.map.delete(secretId);
  }
}

describe("SecretsService", () => {
  it("creates secrets and resolves decrypted values", async () => {
    const service = new SecretsService({
      store: new InMemorySecretStore(),
      masterKey: "unit-test-master-key",
      now: () => new Date(fixedNow),
      idGenerator: () => "secret-1"
    });

    const created = await service.createSecret(
      {
        name: "OPENAI_API_KEY",
        description: "OpenAI key",
        value: "sk-live-demo",
        scope: "provider"
      },
      "tester"
    );

    expect(created.encryptedValue).not.toContain("sk-live-demo");

    const resolved = await service.resolveSecretValueById(created.id);
    expect(resolved).toBe("sk-live-demo");
  });

  it("updates secrets and rotates encrypted payload", async () => {
    const service = new SecretsService({
      store: new InMemorySecretStore(),
      masterKey: "unit-test-master-key",
      now: () => new Date(fixedNow),
      idGenerator: () => "secret-1"
    });

    const created = await service.createSecret(
      {
        name: "ANTHROPIC_API_KEY",
        description: "Anthropic key",
        value: "initial",
        scope: "provider"
      },
      "tester"
    );

    const updated = await service.updateSecret(created.id, { value: "rotated" }, "tester-2");
    const resolved = await service.resolveSecretValueById(updated.id);

    expect(updated.updatedBy).toBe("tester-2");
    expect(updated.encryptedValue).not.toBe(created.encryptedValue);
    expect(resolved).toBe("rotated");
  });
});
