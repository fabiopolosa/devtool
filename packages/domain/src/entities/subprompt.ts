export type SubpromptCategory =
  | "stack"
  | "architecture"
  | "agents"
  | "skills"
  | "conventions"
  | "planning"
  | "other";

export interface Subprompt {
  id: string;
  title: string;
  category: SubpromptCategory;
  summary: string;
  prompt: string;
  tags: string[];
  sourcePath: string;
  enabled: boolean;
}
