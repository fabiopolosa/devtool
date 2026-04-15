import type { AgentConfig, Job, Project, RoadmapItem, SchemaDoc, Task } from "@cp/domain";
import type { SchemaGraphEdge, SchemaGraphNode, SchemaGraphSection, SchemaGraphSectionId } from "./schema-graph-types";

const sectionMeta: Record<SchemaGraphSectionId, { title: string; subtitle: string }> = {
  "data-model": {
    title: "ER Diagram",
    subtitle: "Tables, columns, keys and structural relationships derived from schema docs."
  },
  "api-contracts": {
    title: "API Contracts",
    subtitle: "Operational endpoints and their request/response responsibilities."
  },
  "system-structure": {
    title: "System Structure",
    subtitle: "Projects, tasks, jobs, agents and runtime relationships."
  }
};

const buildTableNodes = (doc: SchemaDoc): SchemaGraphNode[] =>
  doc.tables.map((table, index) => ({
    id: `table:${table.schemaName}.${table.tableName}`,
    label: `${table.schemaName}.${table.tableName}`,
    type: "table",
    sectionId: "data-model",
    description: `${table.columns.length} columns · PK ${table.primaryKeyColumns.length > 0 ? table.primaryKeyColumns.join(", ") : "none"}`,
    position: {
      x: 120 + (index % 3) * 290,
      y: 180 + Math.floor(index / 3) * 160
    },
    size: { width: 250, height: 118 },
    details: {
      schema: table.schemaName,
      columns: table.columns.map((column) => `${column.name}:${column.dataType}${column.nullable ? "?" : ""}`),
      primaryKeys: table.primaryKeyColumns
    }
  }));

const buildApiContractNodes = (): SchemaGraphNode[] => {
  const contracts: Array<Pick<SchemaGraphNode, "id" | "label" | "description" | "details"> & { type: SchemaGraphNode["type"] }> = [
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
      id: "api:/project/:projectId/tasks",
      label: "GET /project/:projectId/tasks",
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
}): SchemaGraphNode[] => {
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

const connectDatabaseNodes = (nodes: SchemaGraphNode[]): SchemaGraphEdge[] => {
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

const connectSystemNodes = (nodes: SchemaGraphNode[]): SchemaGraphEdge[] => {
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
    .filter((edge): edge is SchemaGraphEdge => Boolean(edge));
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
  sectionId: SchemaGraphSectionId;
  schemaDocs: SchemaDoc[];
  project?: Project;
  tasks: Task[];
  roadmapItems: RoadmapItem[];
  jobs: Job[];
  agents: AgentConfig[];
}): SchemaGraphSection {
  const section = sectionMeta[sectionId];
  if (sectionId === "data-model") {
    const doc = schemaDocs[0];
    const tableNodes = doc ? buildTableNodes(doc) : [];
    const rootNode: SchemaGraphNode = {
      id: "data-model:root",
      label: doc?.databaseName ?? "database",
      type: "database",
      sectionId,
      description: doc?.description ?? "Schema snapshot and conventions",
      position: { x: 120, y: 72 },
      size: { width: 270, height: 112 },
      details: {
        dialect: doc?.dialect ?? "unknown",
        conventions: doc?.conventions.map((item) => `${item.key}: ${item.value}`) ?? [],
        stackNotes: doc?.stackNotes ?? []
      }
    };
    const nodes = [rootNode, ...tableNodes];
    return {
      id: sectionId,
      title: section.title,
      subtitle: doc ? `${doc.title} · ${section.subtitle}` : section.subtitle,
      nodes,
      edges: connectDatabaseNodes(nodes)
    };
  }

  if (sectionId === "api-contracts") {
    const nodes = buildApiContractNodes();
    const hubNode: SchemaGraphNode = {
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
