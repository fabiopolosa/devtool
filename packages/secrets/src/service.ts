import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { SecretConfig, SecretScope } from "@cp/domain";

const encryptionVersion = "v1";

const deriveKey = (masterKey: string): Buffer => createHash("sha256").update(masterKey).digest();

const encode = (value: Buffer): string => value.toString("base64url");
const decode = (value: string): Buffer => Buffer.from(value, "base64url");

export interface SecretStore {
  listSecrets(filters?: { scope?: SecretScope }): Promise<SecretConfig[]>;
  getSecretById(secretId: string): Promise<SecretConfig | null>;
  getSecretByName(name: string, scope?: SecretScope): Promise<SecretConfig | null>;
  createSecret(secret: SecretConfig): Promise<SecretConfig>;
  updateSecret(secretId: string, patch: Partial<SecretConfig>): Promise<SecretConfig>;
  deleteSecret(secretId: string): Promise<void>;
}

export interface SecretCreateInput {
  name: string;
  description: string;
  value: string;
  scope: SecretScope;
}

export interface SecretUpdateInput {
  name?: string;
  description?: string;
  value?: string;
  scope?: SecretScope;
}

export interface SecretsServiceOptions {
  store: SecretStore;
  masterKey: string;
  now?: () => Date;
  idGenerator?: () => string;
}

export class SecretsService {
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly key: Buffer;

  constructor(private readonly options: SecretsServiceOptions) {
    if (!options.masterKey || options.masterKey.trim().length < 8) {
      throw new Error("A valid SECRETS_MASTER_KEY is required");
    }
    this.key = deriveKey(options.masterKey.trim());
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  async listSecrets(filters?: { scope?: SecretScope }): Promise<SecretConfig[]> {
    return this.options.store.listSecrets(filters);
  }

  async getSecret(secretId: string): Promise<SecretConfig | null> {
    return this.options.store.getSecretById(secretId);
  }

  async createSecret(input: SecretCreateInput, actor: string): Promise<SecretConfig> {
    const nowIso = this.now().toISOString();
    const existing = await this.options.store.getSecretByName(input.name, input.scope);
    if (existing) {
      throw new Error(`Secret ${input.name} already exists in scope ${input.scope}`);
    }
    const secret: SecretConfig = {
      id: this.idGenerator(),
      name: input.name.trim(),
      description: input.description.trim(),
      encryptedValue: this.encrypt(input.value),
      scope: input.scope,
      createdAt: nowIso,
      createdBy: actor,
      updatedAt: nowIso,
      updatedBy: actor
    };
    return this.options.store.createSecret(secret);
  }

  async updateSecret(secretId: string, patch: SecretUpdateInput, actor: string): Promise<SecretConfig> {
    const existing = await this.options.store.getSecretById(secretId);
    if (!existing) {
      throw new Error(`Secret not found: ${secretId}`);
    }
    const nowIso = this.now().toISOString();
    const next: Partial<SecretConfig> = {
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.description ? { description: patch.description.trim() } : {}),
      ...(patch.value !== undefined ? { encryptedValue: this.encrypt(patch.value) } : {}),
      ...(patch.scope ? { scope: patch.scope } : {}),
      updatedAt: nowIso,
      updatedBy: actor
    };
    return this.options.store.updateSecret(secretId, next);
  }

  async deleteSecret(secretId: string): Promise<void> {
    await this.options.store.deleteSecret(secretId);
  }

  async resolveSecretValueById(secretId: string): Promise<string> {
    const secret = await this.options.store.getSecretById(secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }
    return this.decrypt(secret.encryptedValue);
  }

  async resolveSecretValueByName(name: string, scope?: SecretScope): Promise<string> {
    const secret = await this.options.store.getSecretByName(name, scope);
    if (!secret) {
      throw new Error(`Secret not found: ${name}`);
    }
    return this.decrypt(secret.encryptedValue);
  }

  redact(secret: SecretConfig): SecretConfig {
    return {
      ...secret,
      encryptedValue: `${secret.encryptedValue.slice(0, 12)}...`
    };
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${encryptionVersion}:${encode(iv)}:${encode(tag)}:${encode(encrypted)}`;
  }

  decrypt(payload: string): string {
    const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":");
    if (version !== encryptionVersion || !ivRaw || !tagRaw || !encryptedRaw) {
      throw new Error("Invalid secret payload format");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, decode(ivRaw));
    decipher.setAuthTag(decode(tagRaw));
    const decrypted = Buffer.concat([decipher.update(decode(encryptedRaw)), decipher.final()]);
    return decrypted.toString("utf8");
  }
}
