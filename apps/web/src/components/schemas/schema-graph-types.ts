export type SchemaGraphSectionId = "data-model" | "api-contracts" | "system-structure";

export type SchemaGraphNodeType = "database" | "table" | "endpoint" | "service" | "task" | "job" | "artifact" | "metric";

export interface SchemaGraphNode {
  id: string;
  label: string;
  type: SchemaGraphNodeType;
  sectionId: SchemaGraphSectionId;
  description: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  details: Record<string, string | number | boolean | string[] | undefined>;
}

export interface SchemaGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface SchemaGraphSection {
  id: SchemaGraphSectionId;
  title: string;
  subtitle: string;
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
}
