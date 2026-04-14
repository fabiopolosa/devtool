CREATE TABLE IF NOT EXISTS schema_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  database_name TEXT NOT NULL,
  dialect TEXT NOT NULL,
  tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  conventions JSONB NOT NULL DEFAULT '[]'::jsonb,
  stack_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_introspected_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schema_docs_database ON schema_docs (database_name);
