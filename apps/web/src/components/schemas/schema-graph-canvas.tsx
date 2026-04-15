import type { SchemaGraphEdge, SchemaGraphNode } from "./schema-graph-types";

const nodeClassByType: Record<SchemaGraphNode["type"], string> = {
  database: "schema-node schema-node-database",
  table: "schema-node schema-node-table",
  endpoint: "schema-node schema-node-endpoint",
  service: "schema-node schema-node-service",
  task: "schema-node schema-node-task",
  job: "schema-node schema-node-job",
  artifact: "schema-node schema-node-artifact",
  metric: "schema-node schema-node-metric"
};

const center = (node: SchemaGraphNode): { x: number; y: number } => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2
});

const edgePath = (source: SchemaGraphNode, target: SchemaGraphNode): string => {
  const from = center(source);
  const to = center(target);
  const deltaX = Math.max(80, Math.abs(to.x - from.x) * 0.45);
  const control1X = from.x + deltaX;
  const control2X = to.x - deltaX;
  return `M ${from.x} ${from.y} C ${control1X} ${from.y}, ${control2X} ${to.y}, ${to.x} ${to.y}`;
};

export function SchemaGraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode
}: {
  nodes: SchemaGraphNode[];
  edges: SchemaGraphEdge[];
  selectedNodeId: string | undefined;
  onSelectNode: (node: SchemaGraphNode) => void;
}) {
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.size.width), 1200);
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.size.height), 700);

  return (
    <div className="schema-graph-canvas relative overflow-hidden border border-[color:var(--line)] bg-[color:var(--panel)]">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--line) 70%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--line) 70%, transparent) 1px, transparent 1px)",
          backgroundSize: "44px 44px"
        }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${maxX} ${maxY}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="schema-edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        {edges.map((edge) => {
          const source = nodes.find((node) => node.id === edge.source);
          const target = nodes.find((node) => node.id === edge.target);
          if (!source || !target) return null;
          return (
            <g key={edge.id}>
              <path d={edgePath(source, target)} fill="none" stroke="url(#schema-edge-gradient)" strokeWidth="2" />
              {edge.label ? (
                <text
                  x={(center(source).x + center(target).x) / 2}
                  y={(center(source).y + center(target).y) / 2 - 6}
                  textAnchor="middle"
                  className="fill-[color:var(--muted)]"
                  style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          onClick={() => onSelectNode(node)}
          className={`${nodeClassByType[node.type]} ${selectedNodeId === node.id ? "schema-node-selected" : ""}`}
          style={{
            left: node.position.x,
            top: node.position.y,
            width: node.size.width,
            minHeight: node.size.height
          }}
        >
          <div className="schema-node-type">{node.type.replace(/_/g, " ")}</div>
          <div className="schema-node-label">{node.label}</div>
          <div className="schema-node-description">{node.description}</div>
        </button>
      ))}
    </div>
  );
}
