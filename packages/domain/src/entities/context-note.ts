export interface ContextNote {
  id: string;
  tenantId: string;
  projectId: string;
  path: string;
  title: string;
  content: string;
  tags: string[];
  linkRefs: string[];
  pinned: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
