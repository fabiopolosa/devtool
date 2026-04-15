export type KnowledgeScope = "system" | "tenant" | "project";

export interface KnowledgeNode {
  id: string;
  tenantId?: string;
  projectId?: string;
  scope: KnowledgeScope;
  path: string;
  content: string;
  embedding?: number[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
