import type { SchemaGraphNode, SchemaGraphSection } from "./schema-graph-types";

export function SchemaGraphDetailPanel({
  section,
  node
}: {
  section: SchemaGraphSection;
  node: SchemaGraphNode | undefined;
}) {
  return (
    <aside className="schema-graph-detail shell-panel p-3 md:p-4">
      <div className="label">Selection</div>
      <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">{node?.label ?? section.title}</h3>
      <p className="mt-1 text-sm text-[color:var(--muted)]">{node?.description ?? section.subtitle}</p>

      {node ? (
        <div className="mt-4 space-y-3">
          <div className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
            <div className="label">Node Type</div>
            <div className="mt-1 text-sm text-[color:var(--text)]">{node.type.replace(/_/g, " ")}</div>
          </div>
          <div className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
            <div className="label">Position</div>
            <div className="mt-1 text-sm text-[color:var(--text)]">
              x {node.position.x} · y {node.position.y}
            </div>
          </div>
          <div className="border border-[color:var(--line)] bg-[color:var(--panel2)] p-3">
            <div className="label">Details</div>
            <dl className="mt-2 space-y-2 text-sm">
              {Object.entries(node.details).map(([key, value]) => {
                const rendered = Array.isArray(value) ? value.join(", ") : String(value ?? "n/a");
                return (
                  <div key={key} className="flex items-start justify-between gap-3">
                    <dt className="text-[color:var(--muted)]">{key}</dt>
                    <dd className="max-w-[55%] text-right text-[color:var(--text)]">{rendered}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      ) : (
        <div className="mt-4 border border-[color:var(--line)] bg-[color:var(--panel2)] p-3 text-sm text-[color:var(--muted)]">
          Select a node to inspect its structure.
        </div>
      )}
    </aside>
  );
}
