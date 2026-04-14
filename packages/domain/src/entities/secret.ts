export type SecretScope = "global" | "project" | "repository" | "provider" | "environment";

export interface SecretConfig {
  id: string;
  name: string;
  description: string;
  encryptedValue: string;
  scope: SecretScope;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
