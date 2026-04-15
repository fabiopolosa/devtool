CREATE TABLE IF NOT EXISTS context_notes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  link_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_context_notes_tenant_project_path
  ON context_notes (tenant_id, project_id, path);

CREATE INDEX IF NOT EXISTS idx_context_notes_tenant
  ON context_notes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_context_notes_project
  ON context_notes (project_id);

CREATE INDEX IF NOT EXISTS idx_context_notes_path
  ON context_notes (path);
