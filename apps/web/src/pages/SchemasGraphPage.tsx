import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentConfig, Job, Project, SchemaDoc } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { SchemaGraphCanvas } from "@/components/schemas/schema-graph-canvas";
import { SchemaGraphDetailPanel } from "@/components/schemas/schema-graph-detail-panel";
import { buildSchemaGraphSection } from "@/components/schemas/schema-graph-data";
import type { SchemaGraphNode, SchemaGraphSectionId } from "@/components/schemas/schema-graph-types";
import { useAppStore } from "@/store/app-store";
import { usePathParam } from "./_utils";

const sectionTabs: Array<{ id: SchemaGraphSectionId; label: string; hint: string }> = [
  { id: "data-model", label: "Data Model", hint: "ER diagram" },
  { id: "api-contracts", label: "API Contracts", hint: "REST surface" },
  { id: "system-structure", label: "System Structure", hint: "runtime graph" }
];

export function SchemasGraphPage() {
  const { state, authActions } = useAppStore();
  const projectId = usePathParam(2);
  const project = useMemo<Project | undefined>(
    () => state.projects.find((item) => item.id === projectId) ?? state.projects[0],
    [projectId, state.projects]
  );
  const [schemaDocs, setSchemaDocs] = useState<SchemaDoc[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedSection, setSelectedSection] = useState<SchemaGraphSectionId>("data-model");
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [schemaResponse, agentsResponse, jobsResponse] = await Promise.all([
        authActions.apiFetchJson<{ items?: SchemaDoc[]; message?: string }>("/schema-docs"),
        authActions.apiFetchJson<{ items?: AgentConfig[]; message?: string }>("/agents"),
        authActions.apiFetchJson<{ items?: Job[]; message?: string }>(
          project?.id ? `/jobs?projectId=${encodeURIComponent(project.id)}` : "/jobs"
        )
      ]);

      if (!schemaResponse.response.ok) {
        throw new Error(schemaResponse.body.message ?? `Unable to load schema docs (HTTP ${schemaResponse.response.status})`);
      }
      if (!agentsResponse.response.ok) {
        throw new Error(agentsResponse.body.message ?? `Unable to load agents (HTTP ${agentsResponse.response.status})`);
      }
      if (!jobsResponse.response.ok) {
        throw new Error(jobsResponse.body.message ?? `Unable to load jobs (HTTP ${jobsResponse.response.status})`);
      }

      setSchemaDocs(schemaResponse.body.items ?? []);
      setAgents(agentsResponse.body.items ?? []);
      setJobs(jobsResponse.body.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load schema observability data");
    } finally {
      setLoading(false);
    }
  }, [authActions, project?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const tasks = useMemo(
    () => state.tasks.filter((item) => (project ? item.projectId === project.id : true)),
    [project, state.tasks]
  );
  const roadmapItems = useMemo(
    () => state.roadmapItems.filter((item) => (project ? item.projectId === project.id : true)),
    [project, state.roadmapItems]
  );

  const activeSection = useMemo(
    () =>
      buildSchemaGraphSection({
        sectionId: selectedSection,
        schemaDocs,
        ...(project ? { project } : {}),
        tasks,
        roadmapItems,
        jobs,
        agents
      }),
    [agents, jobs, project, roadmapItems, schemaDocs, selectedSection, tasks]
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
          subtitle={currentProject ? `${currentProject.name} · node-based schema observability` : "node-based schema observability"}
          action={
            <Button variant="secondary" onClick={() => void loadData()}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
          <Pill tone="accent">{currentProject?.key ?? "project"}</Pill>
          <span>Three technical views: data model, API contracts and system structure.</span>
        </div>
        {error ? <div className="mt-3 text-sm text-[color:var(--bad)]">{error}</div> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <Panel>
          <SectionHeading title="Schemas" subtitle="Views" />
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
            <SchemaGraphCanvas
              nodes={filteredNodes}
              edges={filteredEdges}
              selectedNodeId={selectedNode?.id}
              onSelectNode={(node: SchemaGraphNode) => setSelectedNodeId(node.id)}
            />
          </div>
        </Panel>

        <SchemaGraphDetailPanel section={activeSection} node={selectedNode} />
      </div>
    </div>
  );
}
