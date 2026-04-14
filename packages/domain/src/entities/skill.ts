export interface Skill {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  version: string;
  installed: boolean;
  categories: string[];
  instructions: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
