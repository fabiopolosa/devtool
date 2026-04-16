import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentConfig, Job, Project, SchemaDoc } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { SchemaGraphCanvas } from "@/components/schemas/schema-graph-canvas";
import { SchemaGraphDetailPanel } from "@/components/schemas/schema-graph-detail-panel";
import { buildSchemaGraphSection } from "@/components/schemas/schema-graph-data";
import type { SchemaGraphNode, SchemaGraphSection, SchemaGraphSectionId } from "@/components/schemas/schema-graph-types";
import { useAppStore } from "@/store/app-store";
import { usePathParam } from "./_utils";

interface SchemaObservabilitySnapshot {
  projectId?: string;
  projectName?: string;
  generatedAt: string;
  sections: SchemaGraphSection[];
}

const fallbackSectionMeta: Array<{ id: SchemaGraphSectionId; label: string; hint: string }> = [
  { id: "data-model", label: "Data Model", hint: "ER diagram" },
  { id: "api-contracts", label: "API Contracts", hint: "REST surface" },
  { id: "system-structure", label: "System Structure", hint: "runtime graph" }
];

const emptySection = (id: SchemaGraphSectionId): SchemaGraphSection => ({
  id,
  title: "Schema observability",
  subtitle: "No schema data available yet.",
  nodes: [],
  edges: []
});

const bootstrapNode = (sectionId: SchemaGraphSectionId): SchemaGraphNode => ({
  id: `${sectionId}:bootstrap`,
  label: "Schema bootstrap",
  type: "service",
  sectionId,
  description: "Initial schema node generated to keep graph navigation active.",
  position: { x: 180, y: 160 },
  size: { width: 300, height: 120 },
  details: {
    status: "bootstrap",
    note: "Run project activity to populate full schema relations."
  }
});

const ensureNonEmptySections = (sections: SchemaGraphSection[]): SchemaGraphSection[] =>
  sections.map((section) =>
    section.nodes.length > 0
      ? section
      : {
          ...section,
          nodes: [bootstrapNode(section.id)],
          edges: []
        }
  );

export function SchemasGraphPage() {
  const { state, authActions } = useAppStore();
  const projectId = usePathParam(2);
  const project = useMemo<Project | undefined>(
    () => state.projects.find((item) => item.id === projectId) ?? state.projects[0],
    [projectId, state.projects]
  );
  const [sections, setSections] = useState<SchemaGraphSection[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | undefined>();
  const [selectedSection, setSelectedSection] = useState<SchemaGraphSectionId>("data-model");
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadLegacySnapshot = useCallback(async (): Promise<SchemaObservabilitySnapshot> => {
    const [schemaResponse, agentsResponse, jobsResponse] = await Promise.all([
      authActions.apiFetchJson<{ items?: SchemaDoc[]; message?: string }>("/schema-docs"),
      authActions.apiFetchJson<{ items?: AgentConfig[]; message?: string }>("/agents"),
      authActions.apiFetchJson<{ items?: Job[]; message?: string }>(
        project?.id ? `/jobs?projectId=${encodeURIComponent(project.id)}` : "/jobs"
      )
    ]);

    if (!schemaResponse.response.ok) {
      throw new Error(
        schemaResponse.body.message ?? `Unable to load schema docs (HTTP ${schemaResponse.response.status})`
      );
    }
    if (!agentsResponse.response.ok) {
      throw new Error(
        agentsResponse.body.message ?? `Unable to load agents (HTTP ${agentsResponse.response.status})`
      );
    }
    if (!jobsResponse.response.ok) {
      throw new Error(
        jobsResponse.body.message ?? `Unable to load jobs (HTTP ${jobsResponse.response.status})`
      );
    }

    const tasks = state.tasks.filter((task) => (project ? task.projectId === project.id : true));
    const roadmapItems = state.roadmapItems.filter((item) => (project ? item.projectId === project.id : true));
    const schemaDocs = schemaResponse.body.items ?? [];
    const jobs = jobsResponse.body.items ?? [];
    const agents = agentsResponse.body.items ?? [];
    const sections: SchemaGraphSection[] = (["data-model", "api-contracts", "system-structure"] as const).map(
      (sectionId) =>
        buildSchemaGraphSection({
          sectionId,
          schemaDocs,
          ...(project ? { project } : {}),
          tasks,
          roadmapItems,
          jobs,
          agents
        })
    );

    return {
      ...(project?.id ? { projectId: project.id } : {}),
      ...(project?.name ? { projectName: project.name } : {}),
      generatedAt: new Date().toISOString(),
      sections
    };
  }, [authActions, project, state.roadmapItems, state.tasks]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const query = project?.id ? `?projectId=${encodeURIComponent(project.id)}` : "";
      const { response, body } = await authActions.apiFetchJson<{
        item?: SchemaObservabilitySnapshot;
        message?: string;
      }>(`/schema-observability${query}`);

      let snapshot: SchemaObservabilitySnapshot | undefined;
      if (response.ok && body.item) {
        snapshot = body.item;
      } else {
        snapshot = await loadLegacySnapshot();
      }

      setSections(ensureNonEmptySections(snapshot.sections));
      setGeneratedAt(snapshot.generatedAt);
      if (!snapshot.sections.some((section) => section.id === selectedSection)) {
        const firstSection = snapshot.sections[0];
        if (firstSection) {
          setSelectedSection(firstSection.id);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load schema observability data");
      setSections([]);
      setGeneratedAt(undefined);
    } finally {
      setLoading(false);
    }
  }, [authActions, loadLegacySnapshot, project?.id, selectedSection]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sectionTabs = useMemo(() => {
    if (sections.length === 0) return fallbackSectionMeta;
    return sections.map((section) => ({
      id: section.id,
      label: section.title,
      hint: section.subtitle
    }));
  }, [sections]);

  const activeSection = useMemo(
    () =>
      sections.find((section) => section.id === selectedSection) ??
      sections[0] ??
      emptySection(selectedSection),
    [sections, selectedSection]
  );

  const filteredNodes = useMemo(() => {
    const terms = searchTerm.trim().toLowerCase();
    if (!terms) return activeSection.nodes;
    return activeSection.nodes.filter((node) => {
      const haystack = `${node.label} ${node.description} ${Object.values(node.details)
        .flat()
        .join(" ")}`.toLowerCase();
      return haystack.includes(terms);
    });
  }, [activeSection.nodes, searchTerm]);

  const filteredEdges = useMemo(
    () =>
      activeSection.edges.filter((edge) =>
        filteredNodes.some((node) => node.id === edge.source || node.id === edge.target)
      ),
    [activeSection.edges, filteredNodes]
  );

  const selectedNode = useMemo(
    () => filteredNodes.find((node) => node.id === selectedNodeId) ?? filteredNodes[0],
    [filteredNodes, selectedNodeId]
  );

  useEffect(() => {
    if (!selectedNode || selectedNode.id === selectedNodeId) return;
    setSelectedNodeId(selectedNode.id);
  }, [selectedNode, selectedNodeId]);

  const currentProject = project ?? state.projects[0];

  return (
    <div className="space-y-4">
      <Panel>
        <SectionHeading
          title="Database"
          subtitle={currentProject ? `${currentProject.name} · node-based schema graph` : "node-based schema graph"}
          action={
            <Button variant="secondary" onClick={() => void loadData()}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
          <Pill tone="accent">{currentProject?.key ?? "project"}</Pill>
          <span>Data model, API contracts and system structure views from real runtime snapshot.</span>
          {generatedAt ? <span>Snapshot: {generatedAt}</span> : null}
        </div>
        {error ? <div className="mt-3 text-sm text-[color:var(--bad)]">{error}</div> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <Panel>
          <SectionHeading title="Views" subtitle="Schemas" />
          <div className="space-y-2">
            {sectionTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedSection(tab.id);
                  setSelectedNodeId(undefined);
                }}
                className={`w-full border px-3 py-2 text-left transition ${
                  selectedSection === tab.id
                    ? "border-[color:var(--accent)] bg-[color:color-mix(in_oklab,var(--accent)_12%,transparent)] text-[color:var(--text)]"
                    : "border-[color:var(--line)] bg-[color:var(--panel2)] text-[color:var(--muted)] hover:text-[color:var(--text)]"
                }`}
              >
                <div className="text-sm font-semibold">{tab.label}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.12em]">{tab.hint}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
            <div className="label">Section</div>
            <div className="mt-1 text-sm text-[color:var(--text)]">{activeSection.title}</div>
            <div className="mt-2 text-xs text-[color:var(--muted)]">{activeSection.subtitle}</div>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] pb-2">
            <div>
              <div className="label">Workspace</div>
              <h2 className="title-lg">{activeSection.title}</h2>
            </div>
            <Input value={searchTerm} onChange={setSearchTerm} placeholder="Search nodes" />
          </div>
          <div className="mt-3">
            {filteredNodes.length > 0 ? (
              <SchemaGraphCanvas
                nodes={filteredNodes}
                edges={filteredEdges}
                selectedNodeId={selectedNode?.id}
                onSelectNode={(node: SchemaGraphNode) => setSelectedNodeId(node.id)}
              />
            ) : (
              <div className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-6 text-sm text-[color:var(--muted)]">
                No schema nodes available yet for this section. Run schema introspection or generate project activity first.
              </div>
            )}
          </div>
        </Panel>

        <SchemaGraphDetailPanel section={activeSection} node={selectedNode} />
      </div>
    </div>
  );
}
