CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  project_id TEXT,
  scope TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_knowledge_nodes_scope_path
  ON knowledge_nodes (scope, path);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_scope
  ON knowledge_nodes (scope);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_tenant
  ON knowledge_nodes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_project
  ON knowledge_nodes (project_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_path
  ON knowledge_nodes (path);
