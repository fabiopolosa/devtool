export type PromptRegistryScope = "system" | "tenant" | "project";
export type PromptRegistryStatus = "active" | "draft" | "deprecated";

export interface PromptRegistryEntry {
  id: string;
  type: string;
  scope: PromptRegistryScope;
  target: string;
  version: string;
  content: string;
  status: PromptRegistryStatus;
  tenantId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
