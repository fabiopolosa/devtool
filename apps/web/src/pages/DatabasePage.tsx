import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import type { SchemaDoc } from "@cp/domain";
import { Button, Input, Panel, Pill, SectionHeading } from "@/components/common";
import { SchemasGraphPage } from "./SchemasGraphPage";
import { useAppStore } from "@/store/app-store";

const defaultConventions = [
  { key: "Naming", value: "snake_case tables, snake_case columns" },
  { key: "Primary keys", value: "UUID text keys" },
  { key: "Stack", value: "Fastify + Drizzle + PostgreSQL + BullMQ" }
];

function DatabasePlatformPage() {
  const { auth, authActions } = useAppStore();
  const [schemaDocs, setSchemaDocs] = useState<SchemaDoc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [title, setTitle] = useState("Control-plane schema");
  const [description, setDescription] = useState("Operational schema snapshot and conventions.");
  const [loading, setLoading] = useState(false);
  const [runningIntrospection, setRunningIntrospection] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isAdmin = auth.enabled && Boolean(auth.principal?.roles.includes("admin"));

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await authActions.apiFetch("/schema-docs");
      const body = (await response.json()) as { items?: SchemaDoc[]; message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? `Unable to load schema docs (HTTP ${response.status})`);
      }
      const docs = body.items ?? [];
      setSchemaDocs(docs);
      if (!selectedDocId && docs.length > 0) {
        setSelectedDocId(docs[0]!.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load schema docs");
    } finally {
      setLoading(false);
    }
  }, [authActions, selectedDocId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const selectedDoc = useMemo(
    () => schemaDocs.find((doc) => doc.id === selectedDocId) ?? schemaDocs[0],
    [schemaDocs, selectedDocId]
  );

  const introspect = async (): Promise<void> => {
    setRunningIntrospection(true);
    setError(undefined);
    try {
      const payload = {
        ...(selectedDoc ? { id: selectedDoc.id } : {}),
        title,
        description,
        conventions: selectedDoc?.conventions?.length ? selectedDoc.conventions : defaultConventions,
        stackNotes: selectedDoc?.stackNotes?.length ? selectedDoc.stackNotes : ["Control-plane operational stack"]
      };
      const response = await authActions.apiFetch("/schema-docs/introspect", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as { item?: SchemaDoc; message?: string };
      if (!response.ok || !body.item) {
        throw new Error(body.message ?? `Unable to introspect schema (HTTP ${response.status})`);
      }
      await loadDocs();
      setSelectedDocId(body.item.id);
    } catch (introspectionError) {
      setError(introspectionError instanceof Error ? introspectionError.message : "Unable to introspect schema");
    } finally {
      setRunningIntrospection(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel>
        <SectionHeading
          title="Database"
          subtitle="Schema docs, ER overview and conventions"
          action={
            <Button variant="secondary" onClick={() => void loadDocs()}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          }
        />
        <p className="text-sm text-slate-300">
          Introspection stores a snapshot of tables/columns and conventions for project onboarding and planner context quality.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Panel>

      <Panel>
        <SectionHeading title="Schema Snapshot" subtitle="Introspect PostgreSQL" />
        <div className="grid gap-2 md:grid-cols-2">
          <Input value={title} onChange={setTitle} placeholder="Schema document title" />
          <Input value={description} onChange={setDescription} placeholder="Schema description" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>Selected snapshot: {selectedDoc?.title ?? "none"}</span>
          {isAdmin ? (
            <Button variant="primary" onClick={() => void introspect()}>
              {runningIntrospection ? "Running introspection..." : "Run introspection"}
            </Button>
          ) : (
            <Pill tone="warn">Admin required to introspect</Pill>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel>
          <SectionHeading title="Snapshots" subtitle={`${schemaDocs.length} documents`} />
          <div className="space-y-2">
            {schemaDocs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                  selectedDoc?.id === doc.id
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <div className="font-medium">{doc.title}</div>
                <div className="text-xs text-slate-400">{doc.databaseName} · {doc.lastIntrospectedAt}</div>
              </button>
            ))}
            {schemaDocs.length === 0 ? <p className="text-sm text-slate-400">No schema snapshots available.</p> : null}
          </div>
        </Panel>

        <Panel>
          <SectionHeading title="ER Diagram" subtitle={selectedDoc ? `${selectedDoc.tables.length} tables` : "No data"} />
          {selectedDoc ? (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {selectedDoc.tables.map((table) => (
                  <div
                    key={`${table.schemaName}.${table.tableName}`}
                    className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3"
                  >
                    <div className="font-medium text-emerald-200">{table.schemaName}.{table.tableName}</div>
                    <div className="mt-2 space-y-1 text-xs text-slate-300">
                      {table.columns.slice(0, 8).map((column) => (
                        <div key={`${table.tableName}.${column.name}`} className="flex items-center justify-between gap-2">
                          <span className="truncate">{column.name}</span>
                          <span className="text-slate-500">{column.dataType}</span>
                        </div>
                      ))}
                      {table.columns.length > 8 ? (
                        <div className="text-slate-500">+{table.columns.length - 8} columns</div>
                      ) : null}
                    </div>
                    {table.primaryKeyColumns.length > 0 ? (
                      <div className="mt-2 text-[11px] text-emerald-300">
                        PK: {table.primaryKeyColumns.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="label">Project Conventions</div>
                  <div className="mt-2 space-y-2 text-sm">
                    {(selectedDoc.conventions.length > 0 ? selectedDoc.conventions : defaultConventions).map((convention) => (
                      <div
                        key={`${convention.key}:${convention.value}`}
                        className="rounded-lg border border-white/10 bg-slate-950/40 p-2"
                      >
                        <div className="font-medium text-white">{convention.key}</div>
                        <div className="text-slate-400">{convention.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="label">Stack Notes</div>
                  <ul className="mt-2 space-y-2 text-sm text-slate-300">
                    {(selectedDoc.stackNotes.length > 0 ? selectedDoc.stackNotes : ["No stack notes documented."]).map(
                      (note, index) => (
                        <li key={`${note}:${index}`} className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1.5">
                          {note}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Run introspection to generate schema documentation.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function DatabasePage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isProjectSchemaRoute = pathname.startsWith("/project/") && pathname.endsWith("/schemas");

  if (isProjectSchemaRoute) {
    return <SchemasGraphPage />;
  }

  return <DatabasePlatformPage />;
}
