import type { AgentConfig, Job, Project, RoadmapItem, SchemaDoc, Task } from "@cp/domain";
import { apiStore } from "./api-store.js";

export type SchemaObservabilitySectionId = "data-model" | "api-contracts" | "system-structure";

export interface SchemaObservabilityNode {
  id: string;
  label: string;
  type: "database" | "table" | "endpoint" | "service" | "task" | "job" | "artifact" | "metric";
  sectionId: SchemaObservabilitySectionId;
  description: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  details: Record<string, string | number | boolean | string[] | undefined>;
}

export interface SchemaObservabilityEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface SchemaObservabilitySection {
  id: SchemaObservabilitySectionId;
  title: string;
  subtitle: string;
  nodes: SchemaObservabilityNode[];
  edges: SchemaObservabilityEdge[];
}

export interface SchemaObservabilitySnapshot {
  projectId?: string;
  projectName?: string;
  generatedAt: string;
  sections: SchemaObservabilitySection[];
}

export interface SchemaObservabilityServiceInput {
  tenantId: string;
  projectId?: string;
}

const sectionMeta: Record<SchemaObservabilitySectionId, { title: string; subtitle: string }> = {
  "data-model": {
    title: "ER Diagram",
    subtitle: "Tables, columns and keys extracted from schema docs."
  },
  "api-contracts": {
    title: "API Contracts",
    subtitle: "Project and platform endpoints with request/response responsibilities."
  },
  "system-structure": {
    title: "System Structure",
    subtitle: "Tasks, jobs, agents and runtime relationships."
  }
};

const buildDataModelSection = (schemaDocs: SchemaDoc[]): SchemaObservabilitySection => {
  const doc = schemaDocs[0];
  const root: SchemaObservabilityNode = {
    id: "data-model:root",
    label: doc?.databaseName ?? "database",
    type: "database",
    sectionId: "data-model",
    description: doc?.description ?? "Schema snapshot",
    position: { x: 120, y: 72 },
    size: { width: 270, height: 112 },
    details: {
      dialect: doc?.dialect ?? "unknown",
      conventions: doc?.conventions.map((item) => `${item.key}: ${item.value}`) ?? [],
      stackNotes: doc?.stackNotes ?? []
    }
  };

  const tableNodes: SchemaObservabilityNode[] = doc
    ? doc.tables.map((table, index) => ({
        id: `table:${table.schemaName}.${table.tableName}`,
        label: `${table.schemaName}.${table.tableName}`,
        type: "table",
        sectionId: "data-model",
        description: `${table.columns.length} columns · PK ${table.primaryKeyColumns.join(", ") || "none"}`,
        position: { x: 120 + (index % 3) * 290, y: 180 + Math.floor(index / 3) * 160 },
        size: { width: 250, height: 118 },
        details: {
          schema: table.schemaName,
          columns: table.columns.map((column) => `${column.name}:${column.dataType}${column.nullable ? "?" : ""}`),
          primaryKeys: table.primaryKeyColumns
        }
      }))
    : [];

  return {
    id: "data-model",
    title: sectionMeta["data-model"].title,
    subtitle: doc ? `${doc.title} · ${sectionMeta["data-model"].subtitle}` : sectionMeta["data-model"].subtitle,
    nodes: [root, ...tableNodes],
    edges: connectDatabaseNodes([root, ...tableNodes])
  };
};

const buildApiContractNodes = (): SchemaObservabilityNode[] => {
  const contracts: Array<Pick<SchemaObservabilityNode, "id" | "label" | "description" | "details"> & { type: SchemaObservabilityNode["type"] }> = [
    {
      id: "api:/schema-docs",
      label: "GET /schema-docs",
      type: "endpoint",
      description: "Schema snapshot listing and introspection entry point.",
      details: { method: "GET", response: "items[]", scope: "platform" }
    },
    {
      id: "api:/jobs",
      label: "GET /jobs",
      type: "endpoint",
      description: "Live job queue and action-required work items.",
      details: { method: "GET", response: "items[]", scope: "project" }
    },
    {
      id: "api:/projects/:id/tasks",
      label: "GET /projects/:id/tasks",
      type: "endpoint",
      description: "Project-scoped development task list.",
      details: { method: "GET", response: "items[]", scope: "project" }
    },
    {
      id: "api:/brainstorm/plan/:id",
      label: "GET /brainstorm/plan/:id",
      type: "endpoint",
      description: "Canonical brainstorm plan retrieval.",
      details: { method: "GET", response: "item", scope: "project" }
    },
    {
      id: "api:/providers/models",
      label: "GET /providers/models",
      type: "endpoint",
      description: "Normalized model registry and capability discovery.",
      details: { method: "GET", response: "items[]", scope: "platform" }
    }
  ];

  return contracts.map((contract, index) => ({
    ...contract,
    sectionId: "api-contracts",
    position: {
      x: 120 + (index % 2) * 330,
      y: 170 + Math.floor(index / 2) * 150
    },
    size: { width: 285, height: 116 }
  }));
};

const buildSystemStructureNodes = ({
  project,
  tasks,
  roadmapItems,
  jobs,
  agents
}: {
  project?: Project;
  tasks: Task[];
  roadmapItems: RoadmapItem[];
  jobs: Job[];
  agents: AgentConfig[];
}): SchemaObservabilityNode[] => {
  const projectLabel = project?.name ?? "Project";
  return [
    {
      id: "sys:project",
      label: projectLabel,
      type: "service",
      sectionId: "system-structure",
      description: "Primary workspace container.",
      position: { x: 130, y: 120 },
      size: { width: 260, height: 112 },
      details: { key: project?.key ?? "n/a", status: project?.status ?? "n/a" }
    },
    {
      id: "sys:roadmap",
      label: "Roadmap",
      type: "task",
      sectionId: "system-structure",
      description: `${roadmapItems.length} roadmap items guiding execution.`,
      position: { x: 440, y: 72 },
      size: { width: 250, height: 112 },
      details: { items: roadmapItems.length, approved: roadmapItems.filter((item) => item.state === "approved").length }
    },
    {
      id: "sys:tasks",
      label: "Tasks",
      type: "task",
      sectionId: "system-structure",
      description: `${tasks.length} project tasks with approvals and dependencies.`,
      position: { x: 440, y: 220 },
      size: { width: 250, height: 112 },
      details: { items: tasks.length, running: tasks.filter((task) => task.state === "running").length }
    },
    {
      id: "sys:jobs",
      label: "Jobs",
      type: "job",
      sectionId: "system-structure",
      description: `${jobs.length} runtime jobs with action gates.`,
      position: { x: 760, y: 72 },
      size: { width: 250, height: 112 },
      details: { running: jobs.filter((job) => job.status === "running").length, attention: jobs.filter((job) => job.actionRequired).length }
    },
    {
      id: "sys:agents",
      label: "Agents",
      type: "service",
      sectionId: "system-structure",
      description: `${agents.length} managed agents and runtimes.`,
      position: { x: 760, y: 220 },
      size: { width: 250, height: 112 },
      details: { active: agents.filter((agent) => agent.status === "active").length }
    },
    {
      id: "sys:artifacts",
      label: "Artifacts",
      type: "artifact",
      sectionId: "system-structure",
      description: "Execution outputs, patch summaries and context packets.",
      position: { x: 760, y: 368 },
      size: { width: 250, height: 112 },
      details: { type: "workspace outputs" }
    },
    {
      id: "sys:verification",
      label: "Verification",
      type: "metric",
      sectionId: "system-structure",
      description: "Deterministic lint, test, build and optional hooks.",
      position: { x: 440, y: 368 },
      size: { width: 250, height: 112 },
      details: { gates: ["lint", "test", "build"] }
    }
  ];
};

const connectDatabaseNodes = (nodes: SchemaObservabilityNode[]): SchemaObservabilityEdge[] => {
  const root = nodes.find((node) => node.id === "data-model:root");
  if (!root) return [];
  return nodes
    .filter((node) => node.id !== root.id)
    .map((node) => ({
      id: `edge:${root.id}->${node.id}`,
      source: root.id,
      target: node.id,
      label: "contains"
    }));
};

const connectSystemNodes = (nodes: SchemaObservabilityNode[]): SchemaObservabilityEdge[] => {
  const edgePairs: Array<[string, string, string?]> = [
    ["sys:project", "sys:roadmap", "plans"],
    ["sys:project", "sys:tasks", "drives"],
    ["sys:tasks", "sys:jobs", "dispatches"],
    ["sys:jobs", "sys:artifacts", "produces"],
    ["sys:jobs", "sys:verification", "verifies"],
    ["sys:agents", "sys:jobs", "executes"],
    ["sys:project", "sys:agents", "coordinates"]
  ];
  return edgePairs
    .map(([source, target, label]) => {
      if (!nodes.find((node) => node.id === source) || !nodes.find((node) => node.id === target)) {
        return null;
      }
      return { id: `edge:${source}->${target}`, source, target, ...(label ? { label } : {}) };
    })
    .filter((edge): edge is SchemaObservabilityEdge => Boolean(edge));
};

export function buildSchemaGraphSection({
  sectionId,
  schemaDocs,
  project,
  tasks,
  roadmapItems,
  jobs,
  agents
}: {
  sectionId: SchemaObservabilitySectionId;
  schemaDocs: SchemaDoc[];
  project?: Project;
  tasks: Task[];
  roadmapItems: RoadmapItem[];
  jobs: Job[];
  agents: AgentConfig[];
}): SchemaObservabilitySection {
  const section = sectionMeta[sectionId];
  if (sectionId === "data-model") {
    return buildDataModelSection(schemaDocs);
  }

  if (sectionId === "api-contracts") {
    const nodes = buildApiContractNodes();
    const hubNode: SchemaObservabilityNode = {
      id: "api:hub",
      label: "Control Plane API",
      type: "service",
      sectionId,
      description: "Public REST surface and contract boundaries.",
      position: { x: 120, y: 60 },
      size: { width: 270, height: 112 },
      details: {
        tiers: ["platform", "project"],
        note: "Contracts are additive and route-scoped."
      }
    };
    const graphNodes = [hubNode, ...nodes];
    return {
      id: sectionId,
      title: section.title,
      subtitle: section.subtitle,
      nodes: graphNodes,
      edges: nodes.map((node) => ({
        id: `edge:${hubNode.id}->${node.id}`,
        source: hubNode.id,
        target: node.id,
        label: "exposes"
      }))
    };
  }

  const nodes = buildSystemStructureNodes({
    ...(project ? { project } : {}),
    tasks,
    roadmapItems,
    jobs,
    agents
  });
  return {
    id: sectionId,
    title: section.title,
    subtitle: project ? `${project.name} · ${section.subtitle}` : section.subtitle,
    nodes,
    edges: connectSystemNodes(nodes)
  };
}

export async function getSchemaObservabilitySnapshot({
  tenantId: _tenantId,
  projectId
}: SchemaObservabilityServiceInput): Promise<SchemaObservabilitySnapshot> {
  const [schemaDocs, project, tasks, roadmapItems, jobs, agents] = await Promise.all([
    apiStore.listSchemaDocs(),
    projectId ? apiStore.getProject(projectId) : Promise.resolve(undefined),
    apiStore.listTasks(projectId),
    apiStore.listRoadmap(projectId),
    apiStore.listJobs(projectId ? { projectId } : undefined),
    apiStore.listAgents()
  ]);

  const dataModelSection = buildSchemaGraphSection({
    sectionId: "data-model",
    schemaDocs,
    ...(project ? { project } : {}),
    tasks,
    roadmapItems,
    jobs,
    agents
  });

  const apiContractsSection = buildSchemaGraphSection({
    sectionId: "api-contracts",
    schemaDocs,
    ...(project ? { project } : {}),
    tasks,
    roadmapItems,
    jobs,
    agents
  });

  const systemStructureSection = buildSchemaGraphSection({
    sectionId: "system-structure",
    schemaDocs,
    ...(project ? { project } : {}),
    tasks,
    roadmapItems,
    jobs,
    agents
  });

  return {
    generatedAt: new Date().toISOString(),
    sections: [dataModelSection, apiContractsSection, systemStructureSection],
    ...(projectId ? { projectId } : {}),
    ...(project?.name ? { projectName: project.name } : {})
  };
}
